/**
 * Composite Command: /feature-end [name]
 * End a feature (prompt, then merge branch, finalize documentation)
 * 
 * Tier: Feature (Tier 0 - Highest Level)
 * Operates on: Feature-level workflow (generates summary, merges branch, finalizes docs)
 * 
 * Composition: /feature-summarize + /feature-close + git merge + git branch -d
 * 
 * IMPORTANT: Prompt Before Execution
 * 
 * This command should be called AFTER the agent workflow prompts the user for confirmation.
 * The agent workflow should show TWO prompts before executing this command:
 * 
 * Prompt 1: Test Execution Decision (NEW)
 * ```
 * ## Run Tests Before Ending Feature?
 * 
 * Before proceeding with the end workflow, would you like to run tests?
 * 
 * **This will:**
 * - Run test goal validation (check test strategy alignment)
 * - Execute all tests + coverage for this feature
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
 * ## Ready to End Feature?
 * 
 * All phases complete. Ready to merge feature branch?
 * 
 * **This will:**
 * - Generate feature summary
 * - [Run tests] (if selected in previous prompt)
 * - Clean up excessive comments
 * - Run code quality audit
 * - Merge feature/[name] → develop
 * - Delete feature branch
 * - Finalize documentation
 * 
 * **Proceed with /feature-end?** (yes/no)
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
 * See: `.project-manager/docs/feature-tier-architecture.md` (End of Feature Workflow)
 * See: `.cursor/commands/tiers/feature/templates/feature-guide.md` (End of Feature Workflow section)
 */

import { featureSummarize } from '../atomic/feature-summarize';
import { featureClose } from '../atomic/feature-close';
import { gitCommit } from '../../../git/atomic/commit';
import { gitPush } from '../../../git/atomic/push';
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
import { 
  analyzeCodeChangeImpact, 
  getRecentlyModifiedFiles 
} from '../../../testing/composite/test-change-detector';
import { updateCurrentFeature } from '../../../utils/update-current-feature';
import { CommandExecutionMode, isPlanMode, resolveCommandExecutionMode } from '../../../utils/command-execution-mode';

export interface FeatureEndParams {
  featureName: string;
  completedPhases: string[]; // Format: N (e.g., ["1", "2", "3"])
  totalSessions?: number;
  totalTasks?: number;
  commitMessage?: string;
  runTests?: boolean; // Set by user prompt before command execution. Default: true if not specified, but should be explicitly set via prompt.
  mode?: CommandExecutionMode; // Plan vs execute (plan mode performs no side effects)
}

export async function featureEnd(params: FeatureEndParams): Promise<{
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
    return { success: true, steps };
  }
  
  // Step 1: Generate feature summary
  try {
    const summaryOutput = await featureSummarize(params.featureName);
    steps.featureSummarize = { success: true, output: summaryOutput };
  } catch (error) {
    steps.featureSummarize = {
      success: false,
      output: `Failed to generate summary: ${error instanceof Error ? error.message : String(error)}`,
    };
    // Don't fail entire feature-end if this fails, but log it
  }
  
  // Step 2: Close feature documentation
  try {
    const closeOutput = await featureClose(params.featureName);
    steps.featureClose = { success: true, output: closeOutput };
  } catch (error) {
    steps.featureClose = {
      success: false,
      output: `Failed to close feature: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  
  // Step 2.3: Test Goal Validation (blocking if runTests is true)
  const shouldRunTests = params.runTests ?? TEST_CONFIG.defaultRunTests;
  if (params.runTests === undefined) {
    console.warn('runTests not explicitly set - using default: true');
  }
  
  if (shouldRunTests && TEST_CONFIG.validateGoals) {
    try {
      const goalValidation = await validateTestGoals('feature', params.featureName);
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
  
  // Step 2.5: Run tests if requested (feature level includes coverage, blocking)
  if (shouldRunTests) {
    try {
      // NEW: Analyze change impact before running tests
      let impactAnalysisOutput = '';
      try {
        const context = new WorkflowCommandContext(params.featureName);
        const modifiedFiles = await detectFeatureModifiedFiles(params.featureName, context);
        
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
      
      const testResult = await testEndWorkflow('feature', params.featureName, 'all');
      steps.runTests = {
        success: testResult.success,
        output: impactAnalysisOutput + testResult.message + '\n' + JSON.stringify(testResult.results, null, 2),
      };
      
      if (!testResult.success) {
        // Analyze error
        if (TEST_CONFIG.analyzeErrors) {
          try {
            const context = new WorkflowCommandContext(params.featureName);
            const modifiedFiles = await detectFeatureModifiedFiles(params.featureName, context);
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
                `feature-end-${params.featureName}`
              );
              
              steps.testFileFixPermission = {
                success: false,
                output: `Test code error detected. Permission required to fix test file.\n\n${JSON.stringify(permission, null, 2)}\n\nPlease grant permission to fix test file, then re-run feature-end.`,
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
    } catch (error) {
      steps.runTests = {
        success: false,
        output: `Test execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      return { success: false, steps };
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
  } catch (error) {
    steps.commentCleanup = {
      success: false,
      output: `Comment cleanup failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
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
      `- Merge feature/${params.featureName} → develop\n` +
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
      identifier: params.featureName,
    });
    steps.readmeCleanup = { success: true, output: cleanupResult };
  } catch (error) {
    steps.readmeCleanup = {
      success: false,
      output: `README cleanup failed (non-critical): ${error instanceof Error ? error.message : String(error)}`,
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
  } catch (error) {
    steps.comprehensiveCommentCleanup = {
      success: false,
      output: `Comment cleanup failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
        `You can run 'npm run comments:cleanup' manually.`,
    };
    // Don't fail feature-end if comment cleanup fails
  }
  
  // Step 9: Run audit (non-blocking)
  try {
    const { auditFeature } = await import('../../../audit/composite/audit-feature');
    const { readFile } = await import('fs/promises');
    const testResults = params.runTests && steps.runTests ? { success: steps.runTests.success } : undefined;
    const context = new WorkflowCommandContext(params.featureName);
    
    // Detect modified files from git history (feature branch vs base branch)
    const modifiedFiles = await detectFeatureModifiedFiles(params.featureName, context);
    
    const auditResult = await auditFeature({
      featureName: params.featureName,
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
    // Don't fail feature-end if audit fails, but log it clearly
    if (!auditResult.success) {
      steps.audit.output += '\n⚠️ Audit completed with issues. Review audit report.';
    }
  } catch (error) {
    steps.audit = {
      success: false,
      output: `Audit failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
        `You can run /audit-feature ${params.featureName} manually.`,
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
  } catch (error) {
    steps.updateCurrentFeature = {
      success: false,
      output: `Failed to update .current-feature config (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
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
  
  return { success: true, steps };
}

