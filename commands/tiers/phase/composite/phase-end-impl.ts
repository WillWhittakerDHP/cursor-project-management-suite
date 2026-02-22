/**
 * Phase-end implementation. Used by tier-end and by phase-end (thin wrapper).
 */

import { createBranch } from '../../../git/atomic/create-branch';
import { gitCommit } from '../../../git/atomic/commit';
import { gitPush } from '../../../git/atomic/push';
import { markPhaseComplete, MarkPhaseCompleteParams } from './phase';
import { workflowCleanupReadmes } from '../../../readme/composite/readme-workflow-cleanup';
import { testEndWorkflow } from '../../../testing/composite/test-end-workflow';
import { phaseCommentCleanup } from '../../../comments/atomic/phase-comment-cleanup';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { WorkflowId } from '../../../utils/id-utils';
import { detectPhaseModifiedFiles } from '../../../utils/detect-modified-files';
import { gitMerge } from '../../../git/atomic/merge';
import { runCommand, branchExists, getCurrentDate, readProjectFile, writeProjectFile } from '../../../utils/utils';
import { validateTestGoals } from '../../../testing/composite/test-goal-validator';
import { analyzeTestError } from '../../../testing/composite/test-error-analyzer';
import { requestTestFileFixPermission } from '../../../testing/composite/test-file-fix-permission';
import { TEST_CONFIG } from '../../../testing/utils/test-config';
import { analyzeCodeChangeImpact } from '../../../testing/composite/test-change-detector';
import { CommandExecutionMode, isPlanMode, resolveCommandExecutionMode } from '../../../utils/command-execution-mode';
import { auditCodeQuality } from '../../../audit/atomic/audit-code-quality';
import { buildTierEndOutcome, type TierEndOutcome } from '../../../utils/tier-outcome';
import { resolveRunTests, buildPlanModeResult } from '../../../utils/tier-end-utils';
import { isLastPhaseInFeature } from '../../../utils/phase-session-utils';
import { PHASE_CONFIG } from '../../configs/phase';
import { FEATURE_CONFIG } from '../../configs/feature';

const FRONTEND_ROOT = 'client';

export interface PhaseEndParams {
  phaseId: string; // Format: X.Y (e.g., "4.1")
  completedSessions: string[]; // Format: X.Y.Z (e.g., ["4.1.1", "4.1.2", "4.1.3"])
  nextPhase?: string; // Format: X.Y (e.g., "4.2")
  totalTasks?: number; // Total tasks completed in phase
  createNewBranch?: boolean;
  newBranchName?: string;
  commitMessage?: string;
  runTests?: boolean; // Set by user prompt before command execution. Default: true if not specified, but should be explicitly set via prompt.
  testTarget?: string; // Test target: vue/server/all (default: vue)
  mode?: CommandExecutionMode; // Plan vs execute (plan mode performs no side effects)
  skipGit?: boolean; // Skip git operations (for testing)
  // Feature name is auto-detected from git branch or config file - no parameter needed
}

export interface PhaseEndResult {
  success: boolean;
  steps: Record<string, { success: boolean; output: string }>;
  outcome: TierEndOutcome;
}

export async function phaseEndImpl(params: PhaseEndParams): Promise<PhaseEndResult> {
  const steps: Record<string, { success: boolean; output: string }> = {};
  const mode = resolveCommandExecutionMode(params);

  if (isPlanMode(mode)) {
    const planModeSteps = [
      'Mode: plan (no side effects).',
      '',
      'Would execute:',
      '- markPhaseComplete (phase guide/log/handoff updates)',
      '- run code quality audit (npm run audit:all - includes duplication, hardcoding, typecheck, security)',
      '- optional: validate test goals + run tests',
      '- backup commit before comment cleanup',
      '- phase comment cleanup',
      '- README workflow cleanup',
      '- merge all session branches into phase branch',
      '- commit/push phase branch',
      '- merge phase branch into feature branch',
      '- commit/push feature branch',
      '- optional: delete merged branches',
      '- optional: create new branch (if requested)',
    ];
    const { steps: planStepsRecord, outcome } = buildPlanModeResult(planModeSteps, 'Execute phase-end in execute mode to run workflow.');
    steps.plan = planStepsRecord.plan;
    return { success: true, steps, outcome };
  }
  
  // Step 1: Mark phase complete in phase guide (update checkboxes and phase log)
  try {
    const markCompleteParams: MarkPhaseCompleteParams = {
      phase: params.phaseId,
      sessionsCompleted: params.completedSessions,
      totalTasks: params.totalTasks,
    };
    const markCompleteOutput = await markPhaseComplete(markCompleteParams);
    steps.markPhaseComplete = { success: true, output: markCompleteOutput };
  } catch (_error) {
    steps.markPhaseComplete = {
      success: false,
      output: `Failed to mark phase complete: ${_error instanceof Error ? _error.message : String(_error)}`,
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
      identifier: params.phaseId,
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
      
      steps.codeQualityAudit.output += `\n\nReview detailed reports in: ${FRONTEND_ROOT}/.audit-reports/`;
    }
  } catch (_error) {
    steps.codeQualityAudit = {
      success: false,
      output: `Code quality audit failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}\n` +
        `You can run manually: cd ${FRONTEND_ROOT} && npm run audit:all`,
    };
    // Don't fail phase-end if code quality audit fails
  }
  
  // Step 2.3: Test Goal Validation (blocking if runTests is true)
  const { shouldRunTests, blockedOutcome } = resolveRunTests(params);
  if (blockedOutcome) {
    return { success: false, steps, outcome: blockedOutcome };
  }
  if (params.runTests === undefined) {
    console.warn('runTests not explicitly set - using config value');
  }

  if (shouldRunTests && TEST_CONFIG.validateGoals) {
    try {
      const goalValidation = await validateTestGoals('phase', params.phaseId);
      steps.testGoalValidation = {
        success: goalValidation.success,
        output: goalValidation.message + '\n' +
          (goalValidation.aligned.length > 0 ? `\n✅ Aligned:\n${goalValidation.aligned.map(a => `  - ${a.goal}: ${a.testFiles.length} file(s)`).join('\n')}` : '') +
          (goalValidation.gaps.length > 0 ? `\n❌ Gaps:\n${goalValidation.gaps.map(g => `  - ${g.goal}: Missing test files`).join('\n')}` : '') +
          (goalValidation.extras.length > 0 ? `\nℹ️ Extra:\n${goalValidation.extras.map(e => `  - ${e.testFile}: ${e.reason}`).join('\n')}` : ''),
      };
      
      if (!goalValidation.success) {
        return {
          success: false,
          steps,
          outcome: buildTierEndOutcome('blocked_fix_required', 'test_goal_validation_failed', 'Address test goal gaps; then re-run /phase-end.'),
        };
      }
    } catch (_error) {
      steps.testGoalValidation = {
        success: false,
        output: `Test goal validation failed: ${_error instanceof Error ? _error.message : String(_error)}`,
      };
      return {
        success: false,
        steps,
        outcome: buildTierEndOutcome('failed', 'test_goal_validation_error', 'Fix test goal validation; then re-run /phase-end.'),
      };
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
          params.phaseId,
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
      } catch (_error) {
        console.warn('Phase end: change detection failed (non-fatal)', _error);
      }
      
      const testResult = await testEndWorkflow('phase', params.phaseId, testTarget);
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
              params.phaseId,
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
                `phase-end-${params.phaseId}`
              );
              
              steps.testFileFixPermission = {
                success: false,
                output: `Test code error detected. Permission required to fix test file.\n\n${JSON.stringify(permission, null, 2)}\n\nPlease grant permission to fix test file, then re-run phase-end.`,
              };
              
              // Block workflow
              return { success: false, steps, outcome: buildTierEndOutcome('blocked_needs_input', 'test_file_fix_permission', 'Grant permission or fix test file; then re-run /phase-end.') };
            } else if (errorAnalysis.isTestCodeError) {
              // Test code error but fixes not allowed
              steps.testFileFixPermission = {
                success: false,
                output: `Test code error detected but test file fixes are disabled. Please fix test file manually.`,
              };
              return { success: false, steps, outcome: buildTierEndOutcome('blocked_fix_required', 'test_code_error', 'Fix test file manually; then re-run /phase-end.') };
            } else {
              // App code error - block workflow
              return { success: false, steps, outcome: buildTierEndOutcome('blocked_fix_required', 'test_failed', 'Fix failing tests; then re-run /phase-end.') };
            }
          } catch (_error) {
            // Error analysis failed - block workflow to be safe
            steps.testErrorAnalysis = {
              success: false,
              output: `Error analysis failed: ${_error instanceof Error ? _error.message : String(_error)}`,
            };
            return { success: false, steps, outcome: buildTierEndOutcome('failed', 'test_error_analysis', 'Fix test errors; then re-run /phase-end.') };
          }
        } else {
          // Error analysis disabled - block workflow
          return { success: false, steps, outcome: buildTierEndOutcome('blocked_fix_required', 'test_failed', 'Fix failing tests; then re-run /phase-end.') };
        }
      }
      
      // Step 2.6: Track test execution
      try {
        const context = await WorkflowCommandContext.getCurrent();
        const phaseLogPath = context.paths.getPhaseLogPath(params.phaseId);
        let phaseLogContent = '';
        try {
          phaseLogContent = await readProjectFile(phaseLogPath);
        } catch (err) {
          console.warn('Phase end: could not read phase log, using empty', phaseLogPath, err);
          phaseLogContent = `# Phase ${params.phaseId} Log\n\n`;
        }
        
        const testExecutionRecord = `\n**Tests Run:** ${getCurrentDate()} ${testTarget} ${testResult.success ? 'PASSED' : 'FAILED'}\n`;
        phaseLogContent += testExecutionRecord;
        await writeProjectFile(phaseLogPath, phaseLogContent);
        
        steps.testExecutionTracking = {
          success: true,
          output: 'Test execution recorded in phase log',
        };
      } catch (_error) {
        steps.testExecutionTracking = {
          success: false,
          output: `Failed to record test execution: ${_error instanceof Error ? _error.message : String(_error)}`,
        };
      }
    } catch (_error) {
      steps.runTests = {
        success: false,
        output: `Test execution failed: ${_error instanceof Error ? _error.message : String(_error)}`,
      };
      return { success: false, steps, outcome: buildTierEndOutcome('blocked_fix_required', 'test_execution_failed', 'Fix test failures; then re-run /phase-end.') };
    }
  }

  // Step 2.6: Verify test strategy or justification exists
  try {
    const context = await WorkflowCommandContext.getCurrent();
    const phaseGuide = await context.readPhaseGuide(params.phaseId.toString());
    
    // Check if test strategy section exists
    const hasTestStrategy = /## Test Strategy|test.*strategy|test.*requirements/i.test(phaseGuide);
    const hasTestJustification = /test.*justification|tests.*deferred|why.*tests.*not.*created/i.test(phaseGuide);
    
    // Also check session guides for test documentation
    const phaseGuideContent = phaseGuide;
    const sessionMatches = phaseGuideContent.matchAll(/Session\s+(\d+\.\d+\.\d+):/g);
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
        } catch (err) {
          console.warn('Phase end: session guide not found or unreadable', sessionId, err);
        }
      }
    }
    
    if (!hasTestStrategy && !hasTestJustification && sessionsWithTestDocs === 0) {
      steps.testVerification = {
        success: false,
        output: `⚠️ **WARNING: No test strategy or justification found for Phase ${params.phaseId}**\n\n` +
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
  } catch (_error) {
    steps.testVerification = {
      success: false,
      output: `Test verification check failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}`,
    };
  }
  
  // Step 2.6.5: Backup commit before audits (non-blocking)
  // Create a backup commit of current state before running audits
  // This allows easy rollback if audit fixes cause issues
  if (!params.skipGit) {
    try {
      // Check if there are uncommitted changes
      const statusResult = await runCommand('git status --porcelain');
      if (statusResult.success && statusResult.output.trim()) {
        const backupCommitMessage = `Phase ${params.phaseId} pre-audit backup: ${params.completedSessions.length} session(s) completed`;
        const backupCommitResult = await gitCommit(backupCommitMessage);
        
        steps.backupCommit = {
          success: backupCommitResult.success,
          output: backupCommitResult.success
            ? `Backup commit created: ${backupCommitMessage}`
            : `No changes to commit for backup (already committed)`,
        };
      } else {
        steps.backupCommit = {
          success: true,
          output: 'No uncommitted changes - backup commit skipped',
        };
      }
    } catch (_error) {
      steps.backupCommit = {
        success: false,
        output: `Backup commit failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}\n` +
          `Continuing with audits...`,
      };
      // Don't fail phase-end if backup commit fails
    }
  } else {
    steps.backupCommit = { success: true, output: 'Skipped (skipGit=true)' };
  }
  
  // Step 2.7: Clean up session notes from comments (only in phase-modified files)
  try {
    const context = await WorkflowCommandContext.getCurrent();
    // Detect files modified in this phase
    const modifiedFiles = await detectPhaseModifiedFiles(
      params.phaseId,
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
  } catch (_error) {
    steps.commentCleanup = {
      success: false,
      output: `Comment cleanup failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}\n` +
        `You can run /phase-comment-cleanup manually.`,
    };
  }
  
  // Create new branch if requested
  if (params.createNewBranch && params.newBranchName) {
    const branchResult = await createBranch(params.newBranchName);
    steps.createBranch = branchResult;
    if (!branchResult.success) {
      return { success: false, steps, outcome: buildTierEndOutcome('blocked_fix_required', 'create_branch_failed', 'Fix branch creation; then re-run /phase-end.') };
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
    const phaseBranchName = PHASE_CONFIG.getBranchName(context, params.phaseId);
    const featureBranchName = FEATURE_CONFIG.getBranchName(context, context.feature.name);
    if (!phaseBranchName || !featureBranchName) {
      steps.findSessionBranches = {
        success: false,
        output: 'Could not resolve phase or feature branch name from tier config.',
      };
      throw new Error('Cannot proceed: phase or feature branch name from config is null');
    }

    // Step 4.1: Find all session branches for this phase
    const sessionBranchPattern = `${phaseBranchName}-session-*`;
    const listBranchesResult = await runCommand(`git branch --list ${sessionBranchPattern}`);
    const sessionBranches: string[] = [];

    if (listBranchesResult.success && listBranchesResult.output) {
      sessionBranches.push(...listBranchesResult.output
        .split('\n')
        .map(line => line.trim().replace(/^\*\s*/, ''))
        .filter((branch): branch is string => Boolean(branch && branch.startsWith(`${phaseBranchName}-session-`)))
      );
    }
    
    steps.findSessionBranches = {
      success: true,
      output: `Found ${sessionBranches.length} session branch(es) for Phase ${params.phaseId}: ${sessionBranches.length > 0 ? sessionBranches.join(', ') : 'none'}`,
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
      } catch (_error) {
        failedSessions.push(sessionBranch);
        steps[`mergeSession_${sessionBranch}`] = {
          success: false,
          output: `Error merging ${sessionBranch}: ${_error instanceof Error ? _error.message : String(_error)}`,
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
    const phaseCommitMessage = params.commitMessage || `Phase ${params.phaseId} completion: ${params.completedSessions.length} session(s) completed`;
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
        const featureCommitMessage = `Merge Phase ${params.phaseId} into feature branch: ${params.completedSessions.length} session(s) completed`;
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
  } catch (_error) {
    steps.gitOperations = {
      success: false,
      output: `Git operations failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}\n` +
        `You can complete git operations manually.`,
    };
    // Don't fail entire phase-end if git operations fail
  }
  
  // Cleanup temporary READMEs (non-blocking)
  try {
    const cleanupResult = await workflowCleanupReadmes({
      tier: 'phase',
      identifier: params.phaseId,
    });
    steps.readmeCleanup = { success: true, output: cleanupResult };
  } catch (_error) {
    steps.readmeCleanup = {
      success: false,
      output: `README cleanup failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}`,
    };
    // Don't fail entire phase-end if cleanup fails
  }
  
  // Step 5: GitHub PR Validation Prompt (informational)
  steps.githubValidation = {
    success: true,
    output: `\n🔍 **Phase ${params.phaseId} Complete - GitHub Validation Required**\n\n` +
      `Please visit GitHub to verify all session PRs from this phase are merged:\n` +
      `🔗 https://github.com/WillWhittakerDHP/DHP_Differential_Scheduler/pulls\n\n` +
      `**Validation Checklist:**\n` +
      `☐ All session PRs from Phase ${params.phaseId} are merged\n` +
      `☐ No outstanding review comments\n` +
      `☐ Phase branch is clean and up-to-date with main\n` +
      `☐ Ready to merge phase to main (if applicable)\n\n` +
      `**Note:** This is a manual verification step. The agent cannot automatically check PR status.\n`,
  };

  // tierUp: when no next phase at tier, suggest feature-end (parent tier)
  let isLastPhase = false;
  try {
    const phaseEndContext = await WorkflowCommandContext.getCurrent();
    isLastPhase = await isLastPhaseInFeature(phaseEndContext.feature.name, params.phaseId);
    if (isLastPhase) {
      steps.featureEndPrompt = {
        success: true,
        output: `\n✅ **Last phase in feature completed!**\n\n` +
          `All phases in this feature are now complete. Consider running /feature-end to:\n` +
          `- Generate feature summary\n` +
          `- Merge feature branch to develop\n` +
          `- Finalize documentation\n`,
      };
    } else {
      steps.featureEndPrompt = {
        success: true,
        output: 'Not the last phase in feature - feature-end not needed yet',
      };
    }
  } catch (_error) {
    steps.featureEndPrompt = {
      success: false,
      output: `Feature-end check failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}`,
    };
  }

  // CRITICAL: After push, agent MUST show the user the prompt to begin the next step (last thing)
  const nextPhase = params.nextPhase ?? '';
  const nextAction = isLastPhase
    ? `Prompt user for push if needed, then show steps.featureEndPrompt.output and suggest running /feature-end to complete the feature.`
    : nextPhase
      ? `Prompt user for push if needed, then show: To start the next phase run /phase-start ${nextPhase} (or first session of Phase ${nextPhase}).`
      : `Prompt user for push if needed, then show: If all phases complete run /feature-end; otherwise /phase-start [nextPhase].`;
  steps.afterPushShowNextStep = {
    success: true,
    output: `**After push:** As the last thing, show the user the prompt to begin the next step.\n` +
      (nextPhase
        ? `Example: "To start the next phase (Phase ${nextPhase}), run: /phase-start ${nextPhase} or start the first session of Phase ${nextPhase}."\n`
        : `Example: "If all phases are complete, run: /feature-end. Otherwise start the next phase (e.g. /phase-start [nextPhase])."\n`),
  };

  return {
    success: true,
    steps,
    outcome: buildTierEndOutcome('completed', 'pending_push_confirmation', nextAction),
  };
}

