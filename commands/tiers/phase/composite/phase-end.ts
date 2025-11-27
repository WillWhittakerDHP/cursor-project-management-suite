/**
 * Composite Command: /phase-end [phase]
 * Composition: /mark-complete + /update-handoff + /create-branch + /git-commit + /git-push
 * 
 * Tier: Phase (Tier 1 - High-Level)
 * Operates on: Phase-level workflow (completes phase, updates phase log/handoff)
 * 
 * IMPORTANT: Prompt Before Execution
 * 
 * This command should be called AFTER the agent workflow prompts the user for confirmation.
 * The prompt should be shown by the agent's workflow logic (not by this command) after completing
 * all sessions in a phase.
 * 
 * Prompt format (shown by agent workflow):
 * ```
 * ## Ready to Complete Phase?
 * 
 * All sessions complete. Ready to run phase-completion workflow?
 * 
 * **This will:**
 * - Mark phase complete (update checkboxes and status)
 * - Update phase log with completion summary
 * - Update main handoff document
 * - Git commit/push
 * 
 * **Proceed with /phase-end?** (yes/no)
 * ```
 * 
 * If user says "yes": Execute this command automatically
 * If user says "no": Address concerns, then re-prompt
 * 
 * See: `.cursor/rules/USER_CODING_RULES.md` (Rule 19: End of Phase)
 * See: `.cursor/commands/tiers/phase/templates/phase-guide.md` (End of Phase Workflow section)
 */

import { markComplete } from '../../task/atomic/mark-complete';
import { updateHandoff, UpdateHandoffParams } from '../../session/composite/update-handoff';
import { createBranch } from '../../../git/atomic/create-branch';
import { gitCommit } from '../../../git/atomic/commit';
import { gitPush } from '../../../git/atomic/push';
import { markPhaseComplete, MarkPhaseCompleteParams } from './mark-phase-complete';
import { workflowCleanupReadmes } from '../../../readme/composite/readme-workflow-cleanup';
import { testEndWorkflow } from '../../../testing/composite/test-end-workflow';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { WorkflowId } from '../../../utils/id-utils';
import { detectPhaseModifiedFiles } from '../../../utils/detect-modified-files';
import { gitMerge } from '../../../git/atomic/merge';
import { getCurrentBranch, runCommand } from '../../../utils/utils';

export interface PhaseEndParams {
  phase: string; // Format: N (e.g., "1")
  completedSessions: string[]; // Format: X.Y (e.g., ["1.1", "1.2", "1.3"])
  nextPhase?: string; // Format: N (e.g., "2")
  totalTasks?: number; // Total tasks completed in phase
  createNewBranch?: boolean;
  newBranchName?: string;
  commitMessage?: string;
  runTests?: boolean; // If true, run full test suite before ending phase
  testTarget?: string; // Test target: vue/server/all (default: vue)
  // Feature name is auto-detected from git branch or config file - no parameter needed
}

export async function phaseEnd(params: PhaseEndParams): Promise<{
  success: boolean;
  steps: Record<string, { success: boolean; output: string }>;
}> {
  const steps: Record<string, { success: boolean; output: string }> = {};
  
  // Step 1: Mark phase complete in phase guide (update checkboxes and phase log)
  try {
    const markCompleteParams: MarkPhaseCompleteParams = {
      phase: params.phase,
      sessionsCompleted: params.completedSessions,
      totalTasks: params.totalTasks,
    };
    const markCompleteOutput = await markPhaseComplete(markCompleteParams);
    steps.markPhaseComplete = { success: true, output: markCompleteOutput };
  } catch (error) {
    steps.markPhaseComplete = {
      success: false,
      output: `Failed to mark phase complete: ${error instanceof Error ? error.message : String(error)}`,
    };
    // Don't fail entire phase-end if this fails, but log it
  }
  
  // Step 2: Update handoff
  const handoffParams: UpdateHandoffParams = {
    nextAction: params.nextPhase ? `Review migration plan for Phase ${params.nextPhase}` : 'Review migration plan',
  };
  await updateHandoff(handoffParams);
  steps.updateHandoff = { success: true, output: 'Phase handoff updated' };
  
  // Step 2.5: Run tests if requested
  if (params.runTests) {
    try {
      const testTarget = params.testTarget || 'vue';
      const testResult = await testEndWorkflow('phase', params.phase, testTarget);
      steps.runTests = {
        success: testResult.success,
        output: testResult.message + '\n' + JSON.stringify(testResult.results, null, 2),
      };
      // Don't fail phase-end if tests fail, but log it clearly
      if (!testResult.success) {
        steps.runTests.output += '\n⚠️ Tests failed, but continuing with phase end. Review test output above.';
      }
    } catch (error) {
      steps.runTests = {
        success: false,
        output: `Test execution failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
          `You can run tests manually with /test-run ${params.testTarget || 'vue'}`,
      };
      // Don't fail phase-end if test execution fails
    }
  }

  // Step 2.6: Verify test strategy or justification exists
  try {
    const context = await WorkflowCommandContext.getCurrent();
    const phaseGuide = await context.readPhaseGuide(params.phase.toString());
    
    // Check if test strategy section exists
    const hasTestStrategy = /## Test Strategy|test.*strategy|test.*requirements/i.test(phaseGuide);
    const hasTestJustification = /test.*justification|tests.*deferred|why.*tests.*not.*created/i.test(phaseGuide);
    
    // Also check session guides for test documentation
    const phaseGuideContent = phaseGuide;
    const sessionMatches = phaseGuideContent.matchAll(/Session\s+(\d+\.\d+):/g);
    let sessionsWithTestDocs = 0;
    let totalSessions = 0;
    
    for (const match of sessionMatches) {
      const sessionId = match[1];
      if (WorkflowId.isValidSessionId(sessionId)) {
        totalSessions++;
        try {
          const sessionGuide = await context.readSessionGuide(sessionId);
          const sessionHasTestStrategy = /## Test Strategy|test.*strategy|test.*justification|tests.*deferred/i.test(sessionGuide);
          if (sessionHasTestStrategy) {
            sessionsWithTestDocs++;
          }
        } catch (error) {
          // Session guide might not exist, skip
        }
      }
    }
    
    if (!hasTestStrategy && !hasTestJustification && sessionsWithTestDocs === 0) {
      steps.testVerification = {
        success: false,
        output: `⚠️ **WARNING: No test strategy or justification found for Phase ${params.phase}**\n\n` +
          `- Phase guide has no test strategy section\n` +
          `- No test justification documented\n` +
          `- ${totalSessions > 0 ? `${totalSessions - sessionsWithTestDocs}/${totalSessions} sessions missing test documentation` : 'No sessions found'}\n\n` +
          `**Recommendation:** Add a "Test Strategy" section to the phase guide documenting:\n` +
          `- Test requirements for this phase\n` +
          `- Why tests are deferred (if applicable)\n` +
          `- When tests will be added (if deferred)\n`,
      };
    } else {
      steps.testVerification = {
        success: true,
        output: `Test documentation verified:\n` +
          `- Phase guide: ${hasTestStrategy || hasTestJustification ? 'Has test strategy/justification' : 'No test strategy'}\n` +
          `- Sessions: ${sessionsWithTestDocs}/${totalSessions} have test documentation`,
      };
    }
  } catch (error) {
    steps.testVerification = {
      success: false,
      output: `Test verification check failed (non-critical): ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  
  // Step 3: Security audit (optional, non-blocking)
  try {
    const { securityAudit } = await import('../../../security/composite/security-audit');
    const securityResult = await securityAudit({ path: 'server/src' });
    steps.securityAudit = {
      success: true,
      output: securityResult.includes('❌') 
        ? `Security audit completed with issues found. Review output:\n\n${securityResult}`
        : 'Security audit passed',
    };
  } catch (error) {
    steps.securityAudit = {
      success: false,
      output: `Security audit failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
        `You can run /security-audit manually.`,
    };
    // Don't fail phase-end if security audit fails
  }
  
  // Create new branch if requested
  if (params.createNewBranch && params.newBranchName) {
    const branchResult = await createBranch(params.newBranchName);
    steps.createBranch = branchResult;
    if (!branchResult.success) {
      return { success: false, steps };
    }
  }
  
  // Merge phase branch into feature branch
  try {
    const context = await WorkflowCommandContext.getCurrent();
    const currentBranch = await getCurrentBranch();
    const phaseBranchName = `${context.feature.name}-phase-${params.phase}`;
    const featureBranchName = `feature/${context.feature.name}`;
    
    // Only merge if we're on the phase branch
    if (currentBranch === phaseBranchName || currentBranch.endsWith(`-phase-${params.phase}`)) {
      const mergeResult = await gitMerge({
        sourceBranch: phaseBranchName,
        targetBranch: featureBranchName,
      });
      
      steps.gitMerge = {
        success: mergeResult.success,
        output: mergeResult.output,
      };
      
      if (!mergeResult.success) {
        // Don't fail entire phase-end if merge fails, but log it clearly
        steps.gitMerge.output += '\n⚠️ Branch merge failed, but continuing with phase end. Review merge output above.';
      } else {
        // Optionally delete phase branch after successful merge
        const deleteBranchResult = await runCommand(`git branch -d ${phaseBranchName}`);
        if (deleteBranchResult.success) {
          steps.deletePhaseBranch = {
            success: true,
            output: `Deleted phase branch: ${phaseBranchName}`,
          };
        } else {
          // Don't fail if branch deletion fails (might be protected or already deleted)
          steps.deletePhaseBranch = {
            success: false,
            output: `Could not delete phase branch (non-critical): ${deleteBranchResult.error || deleteBranchResult.output}`,
          };
        }
      }
    } else {
      steps.gitMerge = {
        success: true,
        output: `Skipped merge - not on phase branch (current: ${currentBranch})`,
      };
    }
  } catch (error) {
    steps.gitMerge = {
      success: false,
      output: `Branch merge failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
        `You can merge manually with: git checkout feature/${(await WorkflowCommandContext.getCurrent()).feature.name} && git merge ${(await WorkflowCommandContext.getCurrent()).feature.name}-phase-${params.phase}`,
    };
    // Don't fail entire phase-end if merge fails
  }
  
  // Commit
  const commitMessage = params.commitMessage || `Phase ${params.phase} complete`;
  const commitResult = await gitCommit(commitMessage);
  steps.gitCommit = commitResult;
  if (!commitResult.success) {
    return { success: false, steps };
  }
  
  // Push
  const pushResult = await gitPush();
  steps.gitPush = pushResult;
  if (!pushResult.success) {
    return { success: false, steps };
  }
  
  // Cleanup temporary READMEs (non-blocking)
  try {
    const cleanupResult = await workflowCleanupReadmes({
      tier: 'phase',
      identifier: params.phase,
    });
    steps.readmeCleanup = { success: true, output: cleanupResult };
  } catch (error) {
    steps.readmeCleanup = {
      success: false,
      output: `README cleanup failed (non-critical): ${error instanceof Error ? error.message : String(error)}`,
    };
    // Don't fail entire phase-end if cleanup fails
  }
  
  // Step 9: Run audit (non-blocking)
  try {
    const { auditPhase } = await import('../../../audit/composite/audit-phase');
    const { readFile } = await import('fs/promises');
    const testResults = params.runTests && steps.runTests ? { success: steps.runTests.success } : undefined;
    const context = await WorkflowCommandContext.getCurrent();
    
    // Detect modified files from session logs and git history
    const modifiedFiles = await detectPhaseModifiedFiles(
      params.phase,
      params.completedSessions,
      context
    );
    
    const auditResult = await auditPhase({
      phase: params.phase,
      featureName: context.feature.name,
      modifiedFiles: modifiedFiles.length > 0 ? modifiedFiles : undefined,
      testResults,
    });
    
    // Open audit report file in editor
    if (auditResult.fullReportPath) {
      try {
        await readFile(auditResult.fullReportPath, 'utf-8');
        // File read will cause it to open in editor
      } catch {
        // If file doesn't exist yet, that's okay
      }
    }
    
    steps.audit = {
      success: auditResult.success,
      output: auditResult.output,
    };
    // Don't fail phase-end if audit fails, but log it clearly
    if (!auditResult.success) {
      steps.audit.output += '\n⚠️ Audit completed with issues. Review audit report.';
    }
  } catch (error) {
    steps.audit = {
      success: false,
      output: `Audit failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
        `You can run /audit-phase ${params.phase} manually.`,
    };
    // Don't fail phase-end if audit fails
  }
  
  return { success: true, steps };
}

