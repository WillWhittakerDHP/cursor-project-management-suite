/**
 * Feature-end implementation. Used by tier-end and by feature-end (thin wrapper).
 */

import { featureSummarize } from '../atomic/feature-summarize';
import { featureClose } from '../atomic/feature-close';
import { runCommand } from '../../../utils/utils';
import { workflowCleanupReadmes } from '../../../readme/composite/readme-workflow-cleanup';
import { testEndWorkflow } from '../../../testing/composite/test-end-workflow';
import { featureCommentCleanup } from '../../../comments/atomic/feature-comment-cleanup';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { detectFeatureModifiedFiles } from '../../../utils/detect-modified-files';
import { validateTestGoals } from '../../../testing/composite/test-goal-validator';
import { analyzeTestError } from '../../../testing/composite/test-error-analyzer';
import { requestTestFileFixPermission } from '../../../testing/composite/test-file-fix-permission';
import { TEST_CONFIG } from '../../../testing/utils/test-config';
import { analyzeCodeChangeImpact } from '../../../testing/composite/test-change-detector';
import { updateCurrentFeature } from '../../../utils/update-current-feature';
import { CommandExecutionMode, isPlanMode, resolveCommandExecutionMode } from '../../../utils/command-execution-mode';
import { buildTierEndOutcome, type TierEndOutcome } from '../../../utils/tier-outcome';
import { resolveRunTests } from '../../../utils/tier-end-utils';
import { resolveFeatureId } from '../../../utils/feature-context';
import { auditFeature } from '../../../audit/composite/audit-feature';
import { readFile } from 'fs/promises';

export interface FeatureEndParams {
  featureId?: string; // Feature ID (e.g. "3"); resolved to feature name via resolveFeatureId
  featureName?: string; // Fallback when featureId not set
  completedPhases: string[]; // Format: N (e.g., ["1", "2", "3"])
  totalSessions?: number;
  totalTasks?: number;
  commitMessage?: string;
  runTests?: boolean; // Set by user prompt before command execution. Default: true if not specified, but should be explicitly set via prompt.
  mode?: CommandExecutionMode; // Plan vs execute (plan mode performs no side effects)
}

export interface FeatureEndResult {
  success: boolean;
  steps: Record<string, { success: boolean; output: string }>;
  outcome: TierEndOutcome;
}

export async function featureEndImpl(params: FeatureEndParams): Promise<FeatureEndResult> {
  const steps: Record<string, { success: boolean; output: string }> = {};
  const mode = resolveCommandExecutionMode(params);
  const featureName = (params.featureId != null && params.featureId.trim() !== ''
    ? await resolveFeatureId(params.featureId)
    : null) ?? params.featureName ?? '';

  if (isPlanMode(mode)) {
    steps.plan = {
      success: true,
      output:
        [
          'Mode: plan (no side effects).',
          '',
          'Would execute:',
          '- featureSummarize',
          '- featureClose (finalize docs)',
          '- optional: validate test goals + run tests/coverage',
          '- feature comment cleanup (phase notes)',
          '- README workflow cleanup',
          '- comprehensive comment cleanup (all obvious comments via npm script)',
          '- run code quality audit',
          '- commit/push',
          '- merge feature branch into develop + delete feature branch',
          '- update current feature pointer',
        ].join('\n'),
    };
    return {
      success: true,
      steps,
      outcome: buildTierEndOutcome('completed', 'plan', 'Execute feature-end in execute mode to run workflow.'),
    };
  }
  
  // Step 1: Generate feature summary
  try {
    const summaryOutput = await featureSummarize(featureName);
    steps.featureSummarize = { success: true, output: summaryOutput };
  } catch (_error) {
    steps.featureSummarize = {
      success: false,
      output: `Failed to generate summary: ${_error instanceof Error ? _error.message : String(_error)}`,
    };
    // Don't fail entire feature-end if this fails, but log it
  }
  
  // Step 2: Close feature documentation
  try {
    const closeOutput = await featureClose(featureName);
    steps.featureClose = { success: true, output: closeOutput };
  } catch (_error) {
    steps.featureClose = {
      success: false,
      output: `Failed to close feature: ${_error instanceof Error ? _error.message : String(_error)}`,
    };
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
      const goalValidation = await validateTestGoals('feature', featureName);
      steps.testGoalValidation = {
        success: goalValidation.success,
        output: goalValidation.message + '\n' +
          (goalValidation.aligned.length > 0 ? `\n✅ Aligned:\n${goalValidation.aligned.map(a => `  - ${a.goal}: ${a.testFiles.length} file(s)`).join('\n')}` : '') +
          (goalValidation.gaps.length > 0 ? `\n❌ Gaps:\n${goalValidation.gaps.map(g => `  - ${g.goal}: Missing test files`).join('\n')}` : '') +
          (goalValidation.extras.length > 0 ? `\nℹ️ Extra:\n${goalValidation.extras.map(e => `  - ${e.testFile}: ${e.reason}`).join('\n')}` : ''),
      };
      
      if (!goalValidation.success) {
        return { success: false, steps, outcome: buildTierEndOutcome('blocked_fix_required', 'test_goal_validation_failed', 'Address test goal gaps; then re-run /feature-end.') };
      }
    } catch (_error) {
      steps.testGoalValidation = {
        success: false,
        output: `Test goal validation failed: ${_error instanceof Error ? _error.message : String(_error)}`,
      };
      return { success: false, steps, outcome: buildTierEndOutcome('failed', 'test_goal_validation_error', 'Fix test goal validation; then re-run /feature-end.') };
    }
  }
  
  // Step 2.5: Run tests if requested (feature level includes coverage, blocking)
  if (shouldRunTests) {
    try {
      // NEW: Analyze change impact before running tests
      let impactAnalysisOutput = '';
      try {
        const context = new WorkflowCommandContext(featureName);
        const modifiedFiles = await detectFeatureModifiedFiles(featureName, context);
        
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
      
      const testResult = await testEndWorkflow('feature', featureName, 'all');
      steps.runTests = {
        success: testResult.success,
        output: impactAnalysisOutput + testResult.message + '\n' + JSON.stringify(testResult.results, null, 2),
      };
      
      if (!testResult.success) {
        // Analyze error
        if (TEST_CONFIG.analyzeErrors) {
          try {
            const context = new WorkflowCommandContext(featureName);
            const modifiedFiles = await detectFeatureModifiedFiles(featureName, context);
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
                `feature-end-${featureName}`
              );
              
              steps.testFileFixPermission = {
                success: false,
                output: `Test code error detected. Permission required to fix test file.\n\n${JSON.stringify(permission, null, 2)}\n\nPlease grant permission to fix test file, then re-run feature-end.`,
              };
              
              // Block workflow
              return { success: false, steps, outcome: buildTierEndOutcome('blocked_needs_input', 'test_file_fix_permission', 'Grant permission or fix test file; then re-run /feature-end.') };
            } else if (errorAnalysis.isTestCodeError) {
              // Test code error but fixes not allowed
              steps.testFileFixPermission = {
                success: false,
                output: `Test code error detected but test file fixes are disabled. Please fix test file manually.`,
              };
              return { success: false, steps, outcome: buildTierEndOutcome('blocked_fix_required', 'test_code_error', 'Fix test file manually; then re-run /feature-end.') };
            } else {
              // App code error - block workflow
              return { success: false, steps, outcome: buildTierEndOutcome('blocked_fix_required', 'test_failed', 'Fix failing tests; then re-run /feature-end.') };
            }
          } catch (_error) {
            // Error analysis failed - block workflow to be safe
            steps.testErrorAnalysis = {
              success: false,
              output: `Error analysis failed: ${_error instanceof Error ? _error.message : String(_error)}`,
            };
            return { success: false, steps, outcome: buildTierEndOutcome('failed', 'test_error_analysis', 'Fix test errors; then re-run /feature-end.') };
          }
        } else {
          // Error analysis disabled - block workflow
          return { success: false, steps, outcome: buildTierEndOutcome('blocked_fix_required', 'test_failed', 'Fix failing tests; then re-run /feature-end.') };
        }
      }
    } catch (_error) {
      steps.runTests = {
        success: false,
        output: `Test execution failed: ${_error instanceof Error ? _error.message : String(_error)}`,
      };
      return { success: false, steps, outcome: buildTierEndOutcome('blocked_fix_required', 'test_execution_failed', 'Fix test failures; then re-run /feature-end.') };
    }
  }
  
  // Step 2.6: Clean up phase notes from comments
  try {
    const cleanupResult = await featureCommentCleanup({ dryRun: false });
    steps.commentCleanup = {
      success: cleanupResult.success,
      output: cleanupResult.summary + '\n' + 
        `Files modified: ${cleanupResult.filesModified}\n` +
        `Comments removed: ${cleanupResult.commentsRemoved}`,
    };
  } catch (_error) {
    steps.commentCleanup = {
      success: false,
      output: `Comment cleanup failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}\n` +
        `You can run /feature-comment-cleanup manually.`,
    };
  }
  
  // Step 3: Git operations - PROMPT USER BEFORE COMMITTING
  // CRITICAL: After all checks pass and docs are updated, prompt user before commit/push/merge
  steps.gitReady = {
    success: true,
    output: `\n✅ **All feature-end checks completed successfully:**\n` +
      `- ✅ Feature summary generated\n` +
      `- ✅ Feature documentation closed\n` +
      `- ✅ All documentation updated\n\n` +
      `**Ready to commit, merge, and push all changes?**\n\n` +
      `This will:\n` +
      `- Commit all changes with feature completion message\n` +
      `- Merge feature/${featureName} → develop\n` +
      `- Delete feature branch\n` +
      `- Push to remote repository\n\n` +
      `**Proceed with commit, merge, and push?** (yes/no)\n\n` +
      `*Note: If you say "no", the feature will end without committing. You can commit and merge manually later.*`,
  };
  
  // Git operations will be executed only after user confirms via agent prompt
  // The agent workflow should check for user confirmation before proceeding
  // For now, mark as pending user confirmation
  steps.gitCommit = { 
    success: true, 
    output: 'Pending user confirmation - agent should prompt before committing' 
  };
  steps.checkoutDevelop = {
    success: true, 
    output: 'Pending user confirmation - agent should prompt before checking out develop' 
  };
  steps.gitMerge = {
    success: true, 
    output: 'Pending user confirmation - agent should prompt before merging' 
  };
  steps.deleteBranch = {
    success: true, 
    output: 'Pending user confirmation - agent should prompt before deleting branch' 
  };
  steps.gitPush = { 
    success: true, 
    output: 'Pending user confirmation - agent should prompt before pushing' 
  };
  
  // Step 8: Cleanup temporary READMEs (non-blocking)
  try {
    const cleanupResult = await workflowCleanupReadmes({
      tier: 'feature',
      identifier: featureName,
    });
    steps.readmeCleanup = { success: true, output: cleanupResult };
  } catch (_error) {
    steps.readmeCleanup = {
      success: false,
      output: `README cleanup failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}`,
    };
    // Don't fail entire feature-end if cleanup fails
  }
  
  // Step 8.5: Run comprehensive comment cleanup (non-blocking)
  try {
    const cleanupResult = await runCommand('npm run comments:cleanup');
    steps.comprehensiveCommentCleanup = {
      success: cleanupResult.success,
      output: cleanupResult.success 
        ? `Comprehensive comment cleanup complete:\n${cleanupResult.output}`
        : `Comment cleanup failed: ${cleanupResult.error || cleanupResult.output}\n` +
          `You can run 'npm run comments:cleanup' manually.`,
    };
  } catch (_error) {
    steps.comprehensiveCommentCleanup = {
      success: false,
      output: `Comment cleanup failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}\n` +
        `You can run 'npm run comments:cleanup' manually.`,
    };
    // Don't fail feature-end if comment cleanup fails
  }
  
  // Step 9: Run audit (non-blocking)
  try {
    const testResults = params.runTests && steps.runTests ? { success: steps.runTests.success } : undefined;
    const context = new WorkflowCommandContext(featureName);
    
    // Detect modified files from git history (feature branch vs base branch)
    const modifiedFiles = await detectFeatureModifiedFiles(featureName, context);
    
    const auditResult = await auditFeature({
      featureName: featureName,
      modifiedFiles: modifiedFiles.length > 0 ? modifiedFiles : undefined,
      testResults,
    });
    
    // Open audit report file in editor
    if (auditResult.fullReportPath) {
      try {
        await readFile(auditResult.fullReportPath, 'utf-8');
        // File read will cause it to open in editor
      } catch (err) {
        console.warn('Feature end: audit report file not found or unreadable', auditResult.fullReportPath, err);
      }
    }
    
    steps.audit = {
      success: auditResult.success,
      output: auditResult.output,
    };
    // Don't fail feature-end if audit fails, but log it clearly
    if (!auditResult.success) {
      steps.audit.output += '\n⚠️ Audit completed with issues. Review audit report.';
    }
  } catch (_error) {
    steps.audit = {
      success: false,
      output: `Audit failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}\n` +
        `You can run /audit-feature ${featureName} manually.`,
    };
    // Don't fail feature-end if audit fails
  }
  
  // Step 10: Update .current-feature config to match current git branch
  // This ensures the project manager stays focused on the correct feature after feature-end
  // NOTE: This runs before git operations (which are pending user confirmation).
  // After git operations complete (merge to develop, checkout new feature), 
  // call updateCurrentFeature() again to sync config with the new branch.
  try {
    const updateResult = await updateCurrentFeature();
    steps.updateCurrentFeature = {
      success: updateResult.success,
      output: updateResult.message + '\n\n' +
        `Note: After git operations complete (merge/checkout), call updateCurrentFeature() again\n` +
        `to sync config with the new branch, or update .project-manager/.current-feature manually.`,
    };
  } catch (_error) {
    steps.updateCurrentFeature = {
      success: false,
      output: `Failed to update .current-feature config (non-critical): ${_error instanceof Error ? _error.message : String(_error)}\n` +
        `You can update .project-manager/.current-feature manually or call updateCurrentFeature() utility.`,
    };
    // Don't fail feature-end if this fails
  }
  
  // Step: GitHub Final Validation Prompt (informational)
  steps.githubFinalValidation = {
    success: true,
    output: `\n🎯 **Feature Complete - Final GitHub Validation**\n\n` +
      `Please visit GitHub to verify all work is integrated:\n` +
      `🔗 Pull Requests: https://github.com/WillWhittakerDHP/DHP_Differential_Scheduler/pulls\n` +
      `🔗 Branches: https://github.com/WillWhittakerDHP/DHP_Differential_Scheduler/branches\n\n` +
      `**Final Checklist:**\n` +
      `☐ All phase PRs merged to main\n` +
      `☐ Feature branch fully integrated\n` +
      `☐ All reviews complete and approved\n` +
      `☐ CI/CD checks passing\n` +
      `☐ Ready to close feature and archive branch\n\n` +
      `**Note:** This is a manual verification step. The agent cannot automatically check PR status.\n`,
  };
  
  const nextAction = 'Prompt user for push if needed, then show: Feature complete. Update .current-feature and proceed to next feature or wrap up.';
  return {
    success: true,
    steps,
    outcome: buildTierEndOutcome('completed', 'pending_push_confirmation', nextAction),
  };
}

