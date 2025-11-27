/**
 * Composite Command: /session-end [session-id] [description] [next-session]
 * 
 * Tier: Session (Tier 2 - Medium-Level)
 * Operates on: Session-level workflow (completes session, updates session log/handoff/guide)
 * 
 * Focus: Update session log, guide, and handoff (most important)
 * Streamlined to focus on three core updates with minimal handoff context
 * 
 * IMPORTANT: Prompt Before Execution
 * 
 * This command should be called AFTER the agent workflow prompts the user for confirmation.
 * The prompt should be shown by the agent's workflow logic (not by this command) after completing
 * the last task checkpoint in a session.
 * 
 * Prompt format (shown by agent workflow):
 * ```
 * ## Ready to End Session?
 * 
 * All tasks complete. Ready to run end-of-session workflow?
 * 
 * **This will:**
 * - Verify app starts
 * - Run quality checks
 * - Update session log
 * - Update handoff document
 * - Mark session complete (update checkboxes in phase guide)
 * - Git commit/push
 * 
 * **Proceed with /session-end?** (yes/no)
 * ```
 * 
 * If user says "yes": Execute this command automatically
 * If user says "no": Address concerns, then re-prompt
 * 
 * See: `.cursor/rules/USER_CODING_RULES.md` (Rule 19: End of Session)
 * See: `.cursor/commands/tiers/session/templates/session-guide.md` (End of Session section)
 */

import { verifyApp } from '../../../utils/verify-app';
import { verify } from '../../../utils/verify';
import { formatTaskEntry, TaskEntry } from '../../task/atomic/format-task-entry';
import { appendLog } from '../../../utils/append-log';
import { updateHandoffMinimal, MinimalHandoffUpdate } from '../../../utils/update-handoff-minimal';
import { updateGuide, GuideUpdate } from '../../../utils/update-guide';
import { gitCommit } from '../../../git/atomic/commit';
import { gitPush } from '../../../git/atomic/push';
import { markSessionComplete, MarkSessionCompleteParams } from './mark-session-complete';
import { workflowCleanupReadmes } from '../../../readme/composite/readme-workflow-cleanup';
import { testEndWorkflow } from '../../../testing/composite/test-end-workflow';
import { isLastSessionInPhase, getPhaseFromSessionId } from '../../../utils/phase-session-utils';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { detectSessionModifiedFiles } from '../../../utils/detect-modified-files';
import { gitMerge } from '../../../git/atomic/merge';
import { getCurrentBranch, runCommand } from '../../../utils/utils';

export interface SessionEndParams {
  sessionId: string; // Format: X.Y (e.g., "1.3")
  description: string;
  nextSession: string; // Format: X.Y (e.g., "1.4")
  lastCompletedTask: string; // Format: X.Y.Z (e.g., "1.3.4") - last task completed in this session
  taskEntry?: TaskEntry; // Optional: Log entry for last completed task
  transitionNotes?: string; // Minimal notes about where we left off
  guideUpdates?: GuideUpdate[]; // Optional: instructions, patterns, architectural notes for guide
  commitMessage?: string;
  skipGit?: boolean; // If true, skip git operations
  tasksCompleted?: string[]; // Optional: List of completed task IDs for session completion tracking
  accomplishments?: string[]; // Optional: Key accomplishments for session completion tracking
  runTests?: boolean; // If true, run tests before ending session
  testTarget?: string; // Test target: vue/server/all (default: vue)
  // Feature name is auto-detected from git branch or config file - no parameter needed
}

export async function sessionEnd(params: SessionEndParams): Promise<{
  success: boolean;
  steps: Record<string, { success: boolean; output: string }>;
}> {
  const steps: Record<string, { success: boolean; output: string }> = {};
  
  // Step 1: Verify app starts (quick check)
  const appResult = await verifyApp();
  steps.verifyApp = appResult;
  if (!appResult.success) {
    return { success: false, steps };
  }
  
  // Step 2: Run quality checks
  const verifyResult = await verify('vue', false);
  steps.verify = {
    success: verifyResult.success,
    output: JSON.stringify(verifyResult.results, null, 2),
  };
  if (!verifyResult.success) {
    return { success: false, steps };
  }
  
  // Step 2.5: Run tests if requested
  if (params.runTests) {
    try {
      const testTarget = params.testTarget || 'vue';
      const testResult = await testEndWorkflow('session', params.sessionId, testTarget);
      steps.runTests = {
        success: testResult.success,
        output: testResult.message + '\n' + JSON.stringify(testResult.results, null, 2),
      };
      // Don't fail session-end if tests fail, but log it clearly
      if (!testResult.success) {
        steps.runTests.output += '\n⚠️ Tests failed, but continuing with session end. Review test output above.';
      }
    } catch (error) {
      steps.runTests = {
        success: false,
        output: `Test execution failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
          `You can run tests manually with /test-run ${params.testTarget || 'vue'}`,
      };
      // Don't fail session-end if test execution fails
    }
  }

  // Step 2.6: Test creation or justification documentation
  try {
    const context = await WorkflowCommandContext.getCurrent();
    const sessionGuide = await context.readSessionGuide(params.sessionId);
    
    // Check if test strategy section exists and has test requirements
    const hasTestStrategy = /## Test Strategy/i.test(sessionGuide);
    const hasTestJustification = /test.*justification|tests.*deferred|why.*tests.*not.*created/i.test(sessionGuide);
    const hasTestFiles = /test.*file|\.test\.|\.spec\./i.test(sessionGuide);
    
    if (!hasTestStrategy && !hasTestJustification && !hasTestFiles) {
      // Log test status to session log
      const testStatusNote = `\n## Test Status\n\n**Note:** No test strategy or justification documented for this session. Consider adding test requirements or documenting why tests are deferred.\n`;
      await appendLog(testStatusNote, params.sessionId);
      steps.testDocumentation = {
        success: true,
        output: 'Test status logged (no test strategy found in guide)',
      };
    } else {
      steps.testDocumentation = {
        success: true,
        output: 'Test strategy or justification found in session guide',
      };
    }
  } catch (error) {
    steps.testDocumentation = {
      success: false,
      output: `Test documentation check failed (non-critical): ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  
  // Step 3: Update session log (MOST IMPORTANT)
  // Log last completed task if provided
  if (params.taskEntry) {
    const formattedEntry = formatTaskEntry(params.taskEntry);
    // Use session-specific log path
    await appendLog(formattedEntry, params.sessionId);
    steps.appendLog = { success: true, output: 'Task log entry appended to session log' };
  } else {
    steps.appendLog = { success: true, output: 'No task entry provided' };
  }
  
  // Step 4: Update handoff document minimally (MOST IMPORTANT - context only)
  const handoffUpdate: MinimalHandoffUpdate = {
    lastCompletedTask: params.lastCompletedTask,
    nextSession: params.nextSession,
    transitionNotes: params.transitionNotes,
  };
  await updateHandoffMinimal(handoffUpdate);
  steps.updateHandoff = { success: true, output: 'Session handoff updated with transition context' };
  
  // Step 5: Update session guide if needed (MOST IMPORTANT - for instructions/patterns)
  if (params.guideUpdates && params.guideUpdates.length > 0) {
    for (const guideUpdate of params.guideUpdates) {
      await updateGuide(guideUpdate);
    }
    steps.updateGuide = { success: true, output: `Guide updated with ${params.guideUpdates.length} update(s)` };
  } else {
    steps.updateGuide = { success: true, output: 'No guide updates provided' };
  }
  
  // Step 6: Mark session complete in phase guide (update checkboxes and phase log)
  // CRITICAL: This ensures the session checkbox is checked off in the phase guide
  try {
    const markCompleteParams: MarkSessionCompleteParams = {
      sessionId: params.sessionId,
      tasksCompleted: params.tasksCompleted,
      accomplishments: params.accomplishments || [`Completed ${params.description}`],
    };
    const markCompleteOutput = await markSessionComplete(markCompleteParams);
    steps.markSessionComplete = { success: true, output: markCompleteOutput };
  } catch (error) {
    // Log error but don't fail entire session-end - user can manually check off if needed
    steps.markSessionComplete = {
      success: false,
      output: `Failed to mark session complete in phase guide: ${error instanceof Error ? error.message : String(error)}\n` +
        `Session ID: ${params.sessionId}\n` +
        `You may need to manually check off the session in the phase guide.`,
    };
    // Don't fail entire session-end if this fails, but log it clearly
  }
  
  // Step 7: Security audit (optional, non-blocking)
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
    // Don't fail session-end if security audit fails
  }
  
  // Step 7.5: Merge session branch into phase branch (before git operations)
  if (!params.skipGit) {
    try {
      const context = await WorkflowCommandContext.getCurrent();
      const currentBranch = await getCurrentBranch();
      
      // Extract phase number from sessionId
      const phaseMatch = params.sessionId.match(/^(\d+)/);
      const phase = phaseMatch ? phaseMatch[1] : '1';
      
      const sessionBranchName = `${context.feature.name}-phase-${phase}-session-${params.sessionId}`;
      const phaseBranchName = `${context.feature.name}-phase-${phase}`;
      
      // Only merge if we're on the session branch
      if (currentBranch === sessionBranchName || currentBranch.endsWith(`-session-${params.sessionId}`)) {
        const mergeResult = await gitMerge({
          sourceBranch: sessionBranchName,
          targetBranch: phaseBranchName,
        });
        
        steps.gitMerge = {
          success: mergeResult.success,
          output: mergeResult.output,
        };
        
        if (!mergeResult.success) {
          // Don't fail entire session-end if merge fails, but log it clearly
          steps.gitMerge.output += '\n⚠️ Branch merge failed, but continuing with session end. Review merge output above.';
        } else {
          // Optionally delete session branch after successful merge
          const deleteBranchResult = await runCommand(`git branch -d ${sessionBranchName}`);
          if (deleteBranchResult.success) {
            steps.deleteSessionBranch = {
              success: true,
              output: `Deleted session branch: ${sessionBranchName}`,
            };
          } else {
            // Don't fail if branch deletion fails (might be protected or already deleted)
            steps.deleteSessionBranch = {
              success: false,
              output: `Could not delete session branch (non-critical): ${deleteBranchResult.error || deleteBranchResult.output}`,
            };
          }
        }
      } else {
        steps.gitMerge = {
          success: true,
          output: `Skipped merge - not on session branch (current: ${currentBranch})`,
        };
      }
    } catch (error) {
      const errorContext = await WorkflowCommandContext.getCurrent();
      const errorPhaseMatch = params.sessionId.match(/^(\d+)/);
      const errorPhase = errorPhaseMatch ? errorPhaseMatch[1] : '1';
      const errorSessionBranchName = `${errorContext.feature.name}-phase-${errorPhase}-session-${params.sessionId}`;
      const errorPhaseBranchName = `${errorContext.feature.name}-phase-${errorPhase}`;
      
      steps.gitMerge = {
        success: false,
        output: `Branch merge failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
          `You can merge manually with: git checkout ${errorPhaseBranchName} && git merge ${errorSessionBranchName}`,
      };
      // Don't fail entire session-end if merge fails
    }
  } else {
    steps.gitMerge = { success: true, output: 'Skipped (skipGit=true)' };
  }
  
  // Step 8: Git operations (optional)
  if (!params.skipGit) {
    const commitMessage = params.commitMessage || `Session ${params.sessionId}: ${params.description}`;
    const commitResult = await gitCommit(commitMessage);
    steps.gitCommit = commitResult;
    if (!commitResult.success) {
      return { success: false, steps };
    }
    
    const pushResult = await gitPush();
    steps.gitPush = pushResult;
    if (!pushResult.success) {
      return { success: false, steps };
    }
  } else {
    steps.gitCommit = { success: true, output: 'Skipped (skipGit=true)' };
    steps.gitPush = { success: true, output: 'Skipped (skipGit=true)' };
  }
  
  // Cleanup temporary READMEs (non-blocking)
  try {
    const cleanupResult = await workflowCleanupReadmes({
      tier: 'session',
      identifier: params.sessionId,
    });
    steps.readmeCleanup = { success: true, output: cleanupResult };
  } catch (error) {
    steps.readmeCleanup = {
      success: false,
      output: `README cleanup failed (non-critical): ${error instanceof Error ? error.message : String(error)}`,
    };
    // Don't fail entire session-end if cleanup fails
  }

  // Step 9: Run audit (non-blocking)
  try {
    const { auditSession } = await import('../../../audit/composite/audit-session');
    const { readFile } = await import('fs/promises');
    const testResults = params.runTests && steps.runTests ? { success: steps.runTests.success } : undefined;
    const context = await WorkflowCommandContext.getCurrent();
    
    // Detect modified files from session log
    const modifiedFiles = await detectSessionModifiedFiles(params.sessionId, context);
    
    const auditResult = await auditSession({
      sessionId: params.sessionId,
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
    // Don't fail session-end if audit fails, but log it clearly
    if (!auditResult.success) {
      steps.audit.output += '\n⚠️ Audit completed with issues. Review audit report.';
    }
  } catch (error) {
    steps.audit = {
      success: false,
      output: `Audit failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
        `You can run /audit-session ${params.sessionId} manually.`,
    };
    // Don't fail session-end if audit fails
  }
  
  // Step 10: Check if this is the last session in phase and prompt for phase-end
  try {
    const context = await WorkflowCommandContext.getCurrent();
    const isLastSession = await isLastSessionInPhase(context.feature.name, params.sessionId);
    if (isLastSession) {
      const phase = getPhaseFromSessionId(params.sessionId);
      steps.phaseEndPrompt = {
        success: true,
        output: `\n✅ **Last session in Phase ${phase} completed!**\n\n` +
          `All sessions in Phase ${phase} are now complete. Consider running /phase-end ${phase} to:\n` +
          `- Update phase log with completion summary\n` +
          `- Verify tests exist or justification documented\n` +
          `- Update phase handoff\n` +
          `- Close phase\n`,
      };
    } else {
      steps.phaseEndPrompt = {
        success: true,
        output: 'Not the last session in phase - phase-end not needed yet',
      };
    }
  } catch (error) {
    steps.phaseEndPrompt = {
      success: false,
      output: `Phase-end check failed (non-critical): ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  
  return { success: true, steps };
}

