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
 * The prompt should be shown by the agent's workflow logic (not by this command) after completing
 * all phases in a feature.
 * 
 * Prompt format (shown by agent workflow):
 * ```
 * ## Ready to End Feature?
 * 
 * All phases complete. Ready to merge feature branch?
 * 
 * **This will:**
 * - Generate feature summary
 * - Merge feature/[name] → develop
 * - Delete feature branch
 * - Finalize documentation
 * 
 * **Proceed with /feature-end?** (yes/no)
 * ```
 * 
 * If user says "yes": Execute this command automatically
 * If user says "no": Address concerns, then re-prompt
 * 
 * See: `.cursor/project-manager/docs/feature-tier-architecture.md` (End of Feature Workflow)
 * See: `.cursor/commands/tiers/feature/templates/feature-guide.md` (End of Feature Workflow section)
 */

import { featureSummarize } from '../atomic/feature-summarize';
import { featureClose } from '../atomic/feature-close';
import { gitCommit } from '../../../git/atomic/commit';
import { gitPush } from '../../../git/atomic/push';
import { runCommand } from '../../../utils/utils';
import { workflowCleanupReadmes } from '../../../readme/composite/readme-workflow-cleanup';
import { testEndWorkflow } from '../../../testing/composite/test-end-workflow';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { detectFeatureModifiedFiles } from '../../../utils/detect-modified-files';

export interface FeatureEndParams {
  featureName: string;
  completedPhases: string[]; // Format: N (e.g., ["1", "2", "3"])
  totalSessions?: number;
  totalTasks?: number;
  commitMessage?: string;
  runTests?: boolean; // If true, run all tests + coverage before ending feature
}

export async function featureEnd(params: FeatureEndParams): Promise<{
  success: boolean;
  steps: Record<string, { success: boolean; output: string }>;
}> {
  const steps: Record<string, { success: boolean; output: string }> = {};
  
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
  
  // Step 2.5: Run tests if requested (feature level includes coverage)
  if (params.runTests) {
    try {
      const testResult = await testEndWorkflow('feature', params.featureName, 'all');
      steps.runTests = {
        success: testResult.success,
        output: testResult.message + '\n' + JSON.stringify(testResult.results, null, 2),
      };
      // Don't fail feature-end if tests fail, but log it clearly
      if (!testResult.success) {
        steps.runTests.output += '\n⚠️ Tests failed, but continuing with feature end. Review test output above.';
      }
    } catch (error) {
      steps.runTests = {
        success: false,
        output: `Test execution failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
          `You can run tests manually with /test-run all`,
      };
      // Don't fail feature-end if test execution fails
    }
  }
  
  // Step 3: Commit changes
  const commitMessage = params.commitMessage || `Feature ${params.featureName} complete`;
  const commitResult = await gitCommit(commitMessage);
  steps.gitCommit = commitResult;
  if (!commitResult.success) {
    return { success: false, steps };
  }
  
  // Step 4: Checkout develop
  const checkoutDevelop = await runCommand('git checkout develop');
  steps.checkoutDevelop = {
    success: checkoutDevelop.success,
    output: checkoutDevelop.success ? 'Switched to develop' : (checkoutDevelop.error || checkoutDevelop.output),
  };
  if (!checkoutDevelop.success) {
    return { success: false, steps };
  }
  
  // Step 5: Merge feature branch
  const branchName = `feature/${params.featureName}`;
  const mergeResult = await runCommand(`git merge ${branchName}`);
  steps.gitMerge = {
    success: mergeResult.success,
    output: mergeResult.success ? `Merged ${branchName} into develop` : (mergeResult.error || mergeResult.output),
  };
  if (!mergeResult.success) {
    return { success: false, steps };
  }
  
  // Step 6: Delete feature branch
  const deleteBranch = await runCommand(`git branch -d ${branchName}`);
  steps.deleteBranch = {
    success: deleteBranch.success,
    output: deleteBranch.success ? `Deleted branch ${branchName}` : (deleteBranch.error || deleteBranch.output),
  };
  // Don't fail if branch deletion fails (might already be deleted)
  
  // Step 7: Push to remote
  const pushResult = await gitPush();
  steps.gitPush = pushResult;
  if (!pushResult.success) {
    return { success: false, steps };
  }
  
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
  
  return { success: true, steps };
}

