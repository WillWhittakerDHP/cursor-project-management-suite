/**
 * Composite Command: /phase-end [phase]
 * Composition: /mark-complete + /update-handoff + /git-merge + /git-commit + /git-push
 * 
 * Tier: Phase (Tier 1 - High-Level)
 * Operates on: Phase-level workflow (completes phase, updates phase log/handoff)
 * 
 * Git Branch Operations:
 * This command systematically handles git branch operations:
 * 1. Finds all session branches for the phase (pattern: {feature}-phase-{phase}-session-*)
 * 2. Merges each session branch into the phase branch
 * 3. Commits changes on the phase branch
 * 4. Pushes the phase branch to remote
 * 5. Merges the phase branch into the feature branch
 * 6. Commits changes on the feature branch
 * 7. Pushes the feature branch to remote
 * 8. Optionally deletes phase and session branches after successful merge
 * 
 * IMPORTANT: Prompt Before Execution
 * 
 * This command should be called AFTER the agent workflow prompts the user for confirmation.
 * The agent workflow should show TWO prompts before executing this command:
 * 
 * Prompt 1: Test Execution Decision (NEW)
 * ```
 * ## Run Tests Before Ending Phase?
 * 
 * Before proceeding with the end workflow, would you like to run tests?
 * 
 * **This will:**
 * - Run test goal validation (check test strategy alignment)
 * - Execute full test suite for this phase
 * - Block workflow if tests fail (unless test code error with permission)
 * 
 * **Options:**
 * - **Yes** - Run tests (recommended)
 * - **No** - Skip tests and proceed
 * 
 * **Run tests?** (yes/no)
 * ```
 * 
 * Prompt 2: End Workflow Confirmation (EXISTING - Updated)
 * ```
 * ## Ready to Complete Phase?
 * 
 * All sessions complete. Ready to run phase-completion workflow?
 * 
 * **This will:**
 * - Mark phase complete (update checkboxes and status)
 * - Update phase log with completion summary
 * - Update main handoff document
 * - [Run tests] (if selected in previous prompt)
 * - Merge all session branches into phase branch
 * - Commit and push phase branch
 * - Merge phase branch into feature branch
 * - Commit and push feature branch
 * 
 * **Proceed with /phase-end?** (yes/no)
 * ```
 * 
 * Agent workflow should:
 * 1. Show test execution prompt FIRST
 * 2. Capture user response (yes/no)
 * 3. Set `runTests` parameter based on response
 * 4. Show end workflow confirmation prompt (updated to include test status)
 * 5. Execute this command with `runTests` parameter set
 * 
 * If user says "yes" to both: Execute this command automatically
 * If user says "no": Address concerns, then re-prompt
 * 
 * See: `.cursor/rules/USER_CODING_RULES.md` (Rule 19: End of Phase)
 * See: `.cursor/commands/tiers/phase/templates/phase-guide.md` (End of Phase Workflow section)
 */

import { markComplete } from '../../task/atomic/mark-complete';
import { createBranch } from '../../../git/atomic/create-branch';
import { gitCommit } from '../../../git/atomic/commit';
import { gitPush } from '../../../git/atomic/push';
import { markPhaseComplete, MarkPhaseCompleteParams } from './mark-phase-complete';
import { workflowCleanupReadmes } from '../../../readme/composite/readme-workflow-cleanup';
import { testEndWorkflow } from '../../../testing/composite/test-end-workflow';
import { phaseCommentCleanup } from '../../../comments/atomic/phase-comment-cleanup';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { WorkflowId } from '../../../utils/id-utils';
import { detectPhaseModifiedFiles } from '../../../utils/detect-modified-files';
import { gitMerge } from '../../../git/atomic/merge';
import { getCurrentBranch, runCommand, branchExists, getCurrentDate, readProjectFile, writeProjectFile } from '../../../utils/utils';
import { validateTestGoals } from '../../../testing/composite/test-goal-validator';
import { analyzeTestError } from '../../../testing/composite/test-error-analyzer';
import { requestTestFileFixPermission } from '../../../testing/composite/test-file-fix-permission';
import { TEST_CONFIG } from '../../../testing/utils/test-config';
import { 
  analyzeCodeChangeImpact, 
  getRecentlyModifiedFiles 
} from '../../../testing/composite/test-change-detector';
import { CommandExecutionMode, isPlanMode, resolveCommandExecutionMode } from '../../../utils/command-execution-mode';
import { auditCodeQuality } from '../../../audit/atomic/audit-code-quality';

export interface PhaseEndParams {
  phase: string; // Format: N (e.g., "1")
  completedSessions: string[]; // Format: X.Y (e.g., ["1.1", "1.2", "1.3"])
  nextPhase?: string; // Format: N (e.g., "2")
  totalTasks?: number; // Total tasks completed in phase
  createNewBranch?: boolean;
  newBranchName?: string;
  commitMessage?: string;
  runTests?: boolean; // Set by user prompt before command execution. Default: true if not specified, but should be explicitly set via prompt.
  testTarget?: string; // Test target: vue/server/all (default: vue)
  mode?: CommandExecutionMode; // Plan vs execute (plan mode performs no side effects)
  // Feature name is auto-detected from git branch or config file - no parameter needed
}

export async function phaseEnd(params: PhaseEndParams): Promise<{
  success: boolean;
  steps: Record<string, { success: boolean; output: string }>;
}> {
  const steps: Record<string, { success: boolean; output: string }> = {};
  const mode = resolveCommandExecutionMode(params);

  if (isPlanMode(mode)) {
    steps.plan = {
      success: true,
      output:
        [
          'Mode: plan (no side effects).',
          '',
        'Would execute:',
        '- markPhaseComplete (phase guide/log/handoff updates)',
        '- run code quality audit (npm run audit:all - duplication, hardcoding, typecheck, etc.)',
        '- optional: validate test goals + run tests',
          '- phase comment cleanup',
          '- README workflow cleanup',
          '- merge all session branches into phase branch',
          '- commit/push phase branch',
          '- merge phase branch into feature branch',
          '- commit/push feature branch',
          '- optional: delete merged branches',
          '- optional: create new branch (if requested)',
        ].join('\n'),
    };
    return { success: true, steps };
  }
  
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
  
  // Step 2: Update handoff (handled by markPhaseComplete above)
  steps.updateHandoff = { success: true, output: 'Phase handoff updated by markPhaseComplete' };
  
  // Step 2.2: Code quality audit (non-blocking - runs npm run audit:all)
  try {
    const context = await WorkflowCommandContext.getCurrent();
    const codeQualityAudit = await auditCodeQuality({
      tier: 'phase',
      identifier: params.phase,
      featureName: context.feature.name,
    });
    steps.codeQualityAudit = {
      success: codeQualityAudit.status !== 'fail',
      output: codeQualityAudit.summary || `Code quality audit: ${codeQualityAudit.status}`,
    };
    
    // Log findings but don't block workflow
    if (codeQualityAudit.findings && codeQualityAudit.findings.length > 0) {
      const errorCount = codeQualityAudit.findings.filter(f => f.type === 'error').length;
      const warningCount = codeQualityAudit.findings.filter(f => f.type === 'warning').length;
      steps.codeQualityAudit.output += `\n\nFindings: ${errorCount} error(s), ${warningCount} warning(s)`;
      
      if (codeQualityAudit.recommendations && codeQualityAudit.recommendations.length > 0) {
        steps.codeQualityAudit.output += `\n\nRecommendations:\n${codeQualityAudit.recommendations.map(r => `  - ${r}`).join('\n')}`;
      }
      
      steps.codeQualityAudit.output += `\n\nReview detailed reports in: client/.audit-reports/`;
    }
  } catch (error) {
    steps.codeQualityAudit = {
      success: false,
      output: `Code quality audit failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
        `You can run manually: cd client && npm run audit:all`,
    };
    // Don't fail phase-end if code quality audit fails
  }
  
  // Step 2.3: Test Goal Validation (blocking if runTests is true)
  const shouldRunTests = params.runTests ?? TEST_CONFIG.defaultRunTests;
  if (params.runTests === undefined) {
    console.warn('runTests not explicitly set - using default: true');
  }
  
  if (shouldRunTests && TEST_CONFIG.validateGoals) {
    try {
      const goalValidation = await validateTestGoals('phase', params.phase);
      steps.testGoalValidation = {
        success: goalValidation.success,
        output: goalValidation.message + '\n' +
          (goalValidation.aligned.length > 0 ? `\n✅ Aligned:\n${goalValidation.aligned.map(a => `  - ${a.goal}: ${a.testFiles.length} file(s)`).join('\n')}` : '') +
          (goalValidation.gaps.length > 0 ? `\n❌ Gaps:\n${goalValidation.gaps.map(g => `  - ${g.goal}: Missing test files`).join('\n')}` : '') +
          (goalValidation.extras.length > 0 ? `\nℹ️ Extra:\n${goalValidation.extras.map(e => `  - ${e.testFile}: ${e.reason}`).join('\n')}` : ''),
      };
      
      if (!goalValidation.success) {
        return { success: false, steps };
      }
    } catch (error) {
      steps.testGoalValidation = {
        success: false,
        output: `Test goal validation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      return { success: false, steps };
    }
  }
  
  // Step 2.5: Run tests if requested (blocking)
  if (shouldRunTests) {
    try {
      const testTarget = params.testTarget || TEST_CONFIG.defaultTarget;
      
      // NEW: Analyze change impact before running tests
      let impactAnalysisOutput = '';
      try {
        const context = await WorkflowCommandContext.getCurrent();
        const modifiedFiles = await detectPhaseModifiedFiles(
          params.phase,
          params.completedSessions,
          context
        );
        
        if (modifiedFiles.length > 0) {
          const impact = await analyzeCodeChangeImpact(modifiedFiles, {
            includeUncommitted: true,
            detailedAnalysis: true,
          });
          
          if (impact.affectedTests.length > 0) {
            impactAnalysisOutput = `\n📊 Change Impact Analysis:\n`;
            impactAnalysisOutput += `  - Change Type: ${impact.changeType} (${impact.confidence} confidence)\n`;
            impactAnalysisOutput += `  - Affected Tests: ${impact.affectedTests.length}\n`;
            
            if (impact.predictions.length > 0) {
              impactAnalysisOutput += `  - Predicted Failures: ${impact.predictions.length}\n`;
            }
            
            if (impact.changeType === 'breaking' && impact.confidence === 'high') {
              impactAnalysisOutput += `  ⚠️  Breaking changes detected - tests may need updates\n`;
            }
            
            // Add impact analysis as a step
            steps.changeImpactAnalysis = {
              success: true,
              output: impactAnalysisOutput,
            };
          }
        }
      } catch (error) {
        // Non-fatal: If change detection fails, continue without it
        console.error('Change detection failed (non-fatal):', error);
      }
      
      const testResult = await testEndWorkflow('phase', params.phase, testTarget);
      steps.runTests = {
        success: testResult.success,
        output: impactAnalysisOutput + testResult.message + '\n' + JSON.stringify(testResult.results, null, 2),
      };
      
      if (!testResult.success) {
        // Analyze error
        if (TEST_CONFIG.analyzeErrors) {
          try {
            const context = await WorkflowCommandContext.getCurrent();
            const modifiedFiles = await detectPhaseModifiedFiles(
              params.phase,
              params.completedSessions,
              context
            );
            const testFiles = modifiedFiles.filter(f => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f));
            const appFiles = modifiedFiles.filter(f => !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f));
            
            const errorAnalysis = await analyzeTestError(
              testResult.results.run.output,
              testFiles,
              appFiles
            );
            
            steps.testErrorAnalysis = {
              success: true,
              output: `Error Analysis:\n` +
                `- Type: ${errorAnalysis.errorType}\n` +
                `- Confidence: ${errorAnalysis.confidence}\n` +
                `- Is Test Code Error: ${errorAnalysis.isTestCodeError}\n` +
                `- Recommendation: ${errorAnalysis.recommendation}\n` +
                `- Affected Files: ${errorAnalysis.affectedFiles.join(', ')}`,
            };
            
            // If test code error and fixes allowed, request permission
            if (errorAnalysis.isTestCodeError && TEST_CONFIG.allowTestFileFixes) {
              const permission = await requestTestFileFixPermission(
                errorAnalysis,
                `phase-end-${params.phase}`
              );
              
              steps.testFileFixPermission = {
                success: false,
                output: `Test code error detected. Permission required to fix test file.\n\n${JSON.stringify(permission, null, 2)}\n\nPlease grant permission to fix test file, then re-run phase-end.`,
              };
              
              // Block workflow
              return { success: false, steps };
            } else if (errorAnalysis.isTestCodeError) {
              // Test code error but fixes not allowed
              steps.testFileFixPermission = {
                success: false,
                output: `Test code error detected but test file fixes are disabled. Please fix test file manually.`,
              };
              return { success: false, steps };
            } else {
              // App code error - block workflow
              return { success: false, steps };
            }
          } catch (error) {
            // Error analysis failed - block workflow to be safe
            steps.testErrorAnalysis = {
              success: false,
              output: `Error analysis failed: ${error instanceof Error ? error.message : String(error)}`,
            };
            return { success: false, steps };
          }
        } else {
          // Error analysis disabled - block workflow
          return { success: false, steps };
        }
      }
      
      // Step 2.6: Track test execution
      try {
        const context = await WorkflowCommandContext.getCurrent();
        const phaseLogPath = context.paths.getPhaseLogPath(params.phase);
        let phaseLogContent = '';
        try {
          phaseLogContent = await readProjectFile(phaseLogPath);
        } catch {
          phaseLogContent = `# Phase ${params.phase} Log\n\n`;
        }
        
        const testExecutionRecord = `\n**Tests Run:** ${getCurrentDate()} ${testTarget} ${testResult.success ? 'PASSED' : 'FAILED'}\n`;
        phaseLogContent += testExecutionRecord;
        await writeProjectFile(phaseLogPath, phaseLogContent);
        
        steps.testExecutionTracking = {
          success: true,
          output: 'Test execution recorded in phase log',
        };
      } catch (error) {
        steps.testExecutionTracking = {
          success: false,
          output: `Failed to record test execution: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    } catch (error) {
      steps.runTests = {
        success: false,
        output: `Test execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      return { success: false, steps };
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
  
  // Step 2.7: Clean up session notes from comments (only in phase-modified files)
  try {
    const context = await WorkflowCommandContext.getCurrent();
    // Detect files modified in this phase
    const modifiedFiles = await detectPhaseModifiedFiles(
      params.phase,
      params.completedSessions,
      context
    );
    
    const cleanupResult = await phaseCommentCleanup({ 
      dryRun: false,
      paths: modifiedFiles.length > 0 ? modifiedFiles : undefined // Only process modified files if available
    });
    steps.commentCleanup = {
      success: cleanupResult.success,
      output: cleanupResult.summary + '\n' + 
        `Files processed: ${cleanupResult.filesProcessed.length}\n` +
        `Files modified: ${cleanupResult.filesModified}\n` +
        `Comments removed: ${cleanupResult.commentsRemoved}`,
    };
  } catch (error) {
    steps.commentCleanup = {
      success: false,
      output: `Comment cleanup failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
        `You can run /phase-comment-cleanup manually.`,
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
  
  // Step 4: Systematic Git Branch Operations
  // This step systematically:
  // 1. Finds all session branches for the phase
  // 2. Merges each session branch into the phase branch
  // 3. Commits changes on the phase branch
  // 4. Pushes the phase branch
  // 5. Merges the phase branch into the feature branch
  // 6. Commits and pushes the feature branch
  try {
    const context = await WorkflowCommandContext.getCurrent();
    const currentBranch = await getCurrentBranch();
    const phaseBranchName = `${context.feature.name}-phase-${params.phase}`;
    const featureBranchName = `feature/${context.feature.name}`;
    
    // Step 4.1: Find all session branches for this phase
    const sessionBranchPattern = `${context.feature.name}-phase-${params.phase}-session-*`;
    const listBranchesResult = await runCommand(`git branch --list ${sessionBranchPattern}`);
    const sessionBranches: string[] = [];
    
    if (listBranchesResult.success && listBranchesResult.output) {
      // Parse branch names from git branch output (removes leading * and whitespace)
      sessionBranches.push(...listBranchesResult.output
        .split('\n')
        .map(line => line.trim().replace(/^\*\s*/, ''))
        .filter(branch => branch && branch.startsWith(`${context.feature.name}-phase-${params.phase}-session-`))
      );
    }
    
    steps.findSessionBranches = {
      success: true,
      output: `Found ${sessionBranches.length} session branch(es) for Phase ${params.phase}: ${sessionBranches.length > 0 ? sessionBranches.join(', ') : 'none'}`,
    };
    
    // Step 4.2: Ensure we're on the phase branch (create if it doesn't exist)
    if (!(await branchExists(phaseBranchName))) {
      // Create phase branch from feature branch if it doesn't exist
      const checkoutFeatureResult = await runCommand(`git checkout ${featureBranchName}`);
      if (!checkoutFeatureResult.success) {
        steps.ensurePhaseBranch = {
          success: false,
          output: `Failed to checkout feature branch ${featureBranchName}: ${checkoutFeatureResult.error || checkoutFeatureResult.output}`,
        };
        throw new Error(`Cannot proceed: phase branch ${phaseBranchName} does not exist and cannot checkout feature branch`);
      }
      
      const createPhaseBranchResult = await createBranch(phaseBranchName);
      if (!createPhaseBranchResult.success) {
        steps.ensurePhaseBranch = {
          success: false,
          output: `Failed to create phase branch ${phaseBranchName}: ${createPhaseBranchResult.output}`,
        };
        throw new Error(`Cannot proceed: failed to create phase branch ${phaseBranchName}`);
      }
      
      steps.ensurePhaseBranch = {
        success: true,
        output: `Created phase branch: ${phaseBranchName}`,
      };
    } else {
      // Switch to phase branch
      const checkoutPhaseResult = await runCommand(`git checkout ${phaseBranchName}`);
      if (!checkoutPhaseResult.success) {
        steps.ensurePhaseBranch = {
          success: false,
          output: `Failed to checkout phase branch ${phaseBranchName}: ${checkoutPhaseResult.error || checkoutPhaseResult.output}`,
        };
        throw new Error(`Cannot proceed: cannot checkout phase branch ${phaseBranchName}`);
      }
      
      steps.ensurePhaseBranch = {
        success: true,
        output: `Switched to phase branch: ${phaseBranchName}`,
      };
    }
    
    // Step 4.3: Merge all session branches into phase branch
    const mergedSessions: string[] = [];
    const failedSessions: string[] = [];
    
    for (const sessionBranch of sessionBranches) {
      try {
        const mergeResult = await gitMerge({
          sourceBranch: sessionBranch,
          targetBranch: phaseBranchName,
        });
        
        if (mergeResult.success) {
          mergedSessions.push(sessionBranch);
          
          // Optionally delete session branch after successful merge
          const deleteBranchResult = await runCommand(`git branch -d ${sessionBranch}`);
          if (deleteBranchResult.success) {
            steps[`deleteSessionBranch_${sessionBranch}`] = {
              success: true,
              output: `Deleted session branch: ${sessionBranch}`,
            };
          }
        } else {
          failedSessions.push(sessionBranch);
          steps[`mergeSession_${sessionBranch}`] = {
            success: false,
            output: `Failed to merge ${sessionBranch}: ${mergeResult.output}`,
          };
        }
      } catch (error) {
        failedSessions.push(sessionBranch);
        steps[`mergeSession_${sessionBranch}`] = {
          success: false,
          output: `Error merging ${sessionBranch}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    
    steps.mergeSessionBranches = {
      success: failedSessions.length === 0,
      output: `Merged ${mergedSessions.length}/${sessionBranches.length} session branch(es) into phase branch.\n` +
        (mergedSessions.length > 0 ? `✅ Merged: ${mergedSessions.join(', ')}\n` : '') +
        (failedSessions.length > 0 ? `❌ Failed: ${failedSessions.join(', ')}\n` : ''),
    };
    
    // Step 4.4: Commit changes on phase branch
    const phaseCommitMessage = params.commitMessage || `Phase ${params.phase} completion: ${params.completedSessions.length} session(s) completed`;
    const phaseCommitResult = await gitCommit(phaseCommitMessage);
    
    steps.gitCommitPhase = {
      success: phaseCommitResult.success,
      output: phaseCommitResult.success
        ? `Committed changes on phase branch: ${phaseCommitMessage}`
        : `Failed to commit on phase branch: ${phaseCommitResult.output}`,
    };
    
    if (!phaseCommitResult.success) {
      // Don't fail entire phase-end if commit fails, but log it clearly
      steps.gitCommitPhase.output += '\n⚠️ Phase branch commit failed, but continuing. You can commit manually later.';
    }
    
    // Step 4.5: Push phase branch
    const phasePushResult = await gitPush();
    
    steps.gitPushPhase = {
      success: phasePushResult.success,
      output: phasePushResult.success
        ? `Pushed phase branch ${phaseBranchName} to remote`
        : `Failed to push phase branch: ${phasePushResult.output}`,
    };
    
    if (!phasePushResult.success) {
      // Don't fail entire phase-end if push fails, but log it clearly
      steps.gitPushPhase.output += '\n⚠️ Phase branch push failed, but continuing. You can push manually later.';
    }
    
    // Step 4.6: Merge phase branch into feature branch
    const checkoutFeatureResult = await runCommand(`git checkout ${featureBranchName}`);
    if (!checkoutFeatureResult.success) {
      steps.gitMergePhaseToFeature = {
        success: false,
        output: `Failed to checkout feature branch ${featureBranchName}: ${checkoutFeatureResult.error || checkoutFeatureResult.output}`,
      };
      // Don't fail entire phase-end if checkout fails
    } else {
      const mergeResult = await gitMerge({
        sourceBranch: phaseBranchName,
        targetBranch: featureBranchName,
      });
      
      steps.gitMergePhaseToFeature = {
        success: mergeResult.success,
        output: mergeResult.output,
      };
      
      if (!mergeResult.success) {
        // Don't fail entire phase-end if merge fails, but log it clearly
        steps.gitMergePhaseToFeature.output += '\n⚠️ Phase branch merge into feature branch failed, but continuing. Review merge output above.';
      } else {
        // Step 4.7: Commit feature branch (merge commit already created, but ensure any other changes are committed)
        const featureCommitMessage = `Merge Phase ${params.phase} into feature branch: ${params.completedSessions.length} session(s) completed`;
        const featureCommitResult = await gitCommit(featureCommitMessage);
        
        steps.gitCommitFeature = {
          success: featureCommitResult.success,
          output: featureCommitResult.success
            ? `Committed changes on feature branch: ${featureCommitMessage}`
            : `No changes to commit on feature branch (merge commit may have been created automatically)`,
        };
        
        // Step 4.8: Push feature branch
        const featurePushResult = await gitPush();
        
        steps.gitPushFeature = {
          success: featurePushResult.success,
          output: featurePushResult.success
            ? `Pushed feature branch ${featureBranchName} to remote`
            : `Failed to push feature branch: ${featurePushResult.output}`,
        };
        
        if (!featurePushResult.success) {
          // Don't fail entire phase-end if push fails, but log it clearly
          steps.gitPushFeature.output += '\n⚠️ Feature branch push failed, but continuing. You can push manually later.';
        }
        
        // Step 4.9: Optionally delete phase branch after successful merge
        const deletePhaseBranchResult = await runCommand(`git branch -d ${phaseBranchName}`);
        if (deletePhaseBranchResult.success) {
          steps.deletePhaseBranch = {
            success: true,
            output: `Deleted phase branch: ${phaseBranchName}`,
          };
        } else {
          // Don't fail if branch deletion fails (might be protected or already deleted)
          steps.deletePhaseBranch = {
            success: false,
            output: `Could not delete phase branch (non-critical): ${deletePhaseBranchResult.error || deletePhaseBranchResult.output}`,
          };
        }
      }
    }
  } catch (error) {
    steps.gitOperations = {
      success: false,
      output: `Git operations failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
        `You can complete git operations manually.`,
    };
    // Don't fail entire phase-end if git operations fail
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
  
  // Step: GitHub PR Validation Prompt (informational)
  steps.githubValidation = {
    success: true,
    output: `\n🔍 **Phase ${params.phase} Complete - GitHub Validation Required**\n\n` +
      `Please visit GitHub to verify all session PRs from this phase are merged:\n` +
      `🔗 https://github.com/WillWhittakerDHP/DHP_Differential_Scheduler/pulls\n\n` +
      `**Validation Checklist:**\n` +
      `☐ All session PRs from Phase ${params.phase} are merged\n` +
      `☐ No outstanding review comments\n` +
      `☐ Phase branch is clean and up-to-date with main\n` +
      `☐ Ready to merge phase to main (if applicable)\n\n` +
      `**Note:** This is a manual verification step. The agent cannot automatically check PR status.\n`,
  };
  
  return { success: true, steps };
}

