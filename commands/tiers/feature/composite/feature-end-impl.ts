/**
 * Feature-end implementation. Thin adapter: builds hooks and runs shared end workflow.
 */

import { readdir } from 'fs/promises';
import { join } from 'path';
import { featureSummarize } from '../atomic/feature-summarize';
import { featureClose } from '../atomic/feature-close';
import { runWithLintVerification } from '../../../utils/utils';
import { gitCheckout } from '../../../git/shared/git-manager';
import { featureCommentCleanup } from '../../../comments/commentCleanup';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { detectFeatureModifiedFiles } from '../../../utils/detect-modified-files';
import { validateTestGoals } from '../../../testing/composite/test-goal-validator';
import { analyzeTestError } from '../../../testing/composite/test-error-analyzer';
import { requestTestFileFixPermission } from '../../../testing/composite/test-file-fix-permission';
import { TEST_CONFIG } from '../../../testing/utils/test-config';
import { analyzeCodeChangeImpact } from '../../../testing/composite/test-change-detector';
import { testEndWorkflow } from '../../../testing/composite/test-end-workflow';
import { buildTierEndOutcome, type TierEndOutcome } from '../../../utils/tier-outcome';
import { resolveFeatureId } from '../../../utils/feature-context';
import { getOptionsFromParams } from '../../../utils/command-execution-mode';
import { FEATURE_CONFIG } from '../../configs/feature';
import {
  gitCommit,
  gitPush,
  ensureTierBranch,
  mergeTierBranch,
  mergeChildBranches,
  getCurrentBranch,
} from '../../../git/shared/git-manager';
import type {
  TierEndWorkflowContext,
  TierEndWorkflowHooks,
  TierEndWorkflowResultWithShadow,
  StepExitResult,
} from '../../shared/tier-end-workflow-types';
import { runTierEndWorkflow } from '../../../harness/run-end-steps';
import type { RunRecorder, RunTraceHandle } from '../../../harness/contracts';

export type EndShadowContext = { recorder: RunRecorder; handle: RunTraceHandle };
import { proposeVerificationChecklistForFeature } from '../../shared/verification-check';

export interface FeatureEndParams {
  featureId?: string;
  featureName?: string;
  completedPhases: string[];
  totalSessions?: number;
  totalTasks?: number;
  commitMessage?: string;
  runTests?: boolean;
  mode?: import('../../../utils/command-execution-mode').CommandExecutionMode;
  /** When true, verification check step does not return early; used when re-running after verification work or skip. */
  continuePastVerification?: boolean;
}

export interface FeatureEndResult {
  success: boolean;
  output: string;
  steps: Record<string, { success: boolean; output: string }>;
  outcome: TierEndOutcome;
}

const CLEANUP_FILE_THRESHOLD = 100;
const CLEANUP_COMMENT_THRESHOLD = 500;

/**
 * Prefix for local phase branches belonging to this feature (e.g. phase-6.5-foo → phase-6.).
 * WHY: mergeChildBranches lists by prefix; we must not merge another feature's phase-* branches.
 */
async function resolvePhaseBranchPrefixForFeature(
  featureName: string,
  completedPhases: string[] | undefined
): Promise<string | null> {
  const majorFromParams = completedPhases
    ?.map((p) => p.trim().split('.')[0])
    .find((m) => m !== undefined && m !== '' && /^\d+$/.test(m));
  if (majorFromParams) return `phase-${majorFromParams}.`;

  const phasesDir = join(process.cwd(), '.project-manager/features', featureName, 'phases');
  try {
    const entries = await readdir(phasesDir);
    const majors = new Set<string>();
    for (const name of entries) {
      const m = name.match(/^phase-(\d+)\./);
      if (m) majors.add(m[1]);
    }
    if (majors.size === 1) return `phase-${[...majors][0]}.`;
  } catch {
    // Missing or unreadable phases dir — caller skips phase merges.
  }
  return null;
}

/** When provided (e.g. from harness), use this context instead of re-resolving feature. */
export async function featureEndImpl(
  params: FeatureEndParams,
  shadow?: EndShadowContext,
  resolvedContext?: WorkflowCommandContext
): Promise<FeatureEndResult | (FeatureEndResult & TierEndWorkflowResultWithShadow)> {
  const context =
    resolvedContext ??
    new WorkflowCommandContext(
      (params.featureId != null && params.featureId.trim() !== ''
        ? await resolveFeatureId(params.featureId)
        : null) ?? params.featureName ?? ''
    );
  const featureName = context.feature.name;

  const ctx: TierEndWorkflowContext = {
    config: FEATURE_CONFIG,
    identifier: featureName,
    params,
    options: getOptionsFromParams(params),
    context,
    output: [],
    steps: {},
    shouldRunTests: false,
    outcome: buildTierEndOutcome('completed', 'pending_push_confirmation', ''),
    ...(shadow && {
      runRecorder: shadow.recorder,
      runTraceHandle: shadow.handle,
      stepPath: [],
    }),
  };

  const hooks: TierEndWorkflowHooks = {
    getPlanModeSteps() {
      return [
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
        '- optional: propose verification checklist (before audit); pause for add follow-up phase or continue with continuePastVerification',
        '- commit/push',
        '- merge feature branch into develop + delete feature branch',
        '- update current feature pointer',
      ];
    },

    async runPreWork(): Promise<StepExitResult> {
      try {
        const summaryOutput = await featureSummarize(ctx.identifier);
        ctx.steps.featureSummarize = { success: true, output: summaryOutput };
      } catch (e) {
        ctx.steps.featureSummarize = {
          success: false,
          output: `Failed to generate summary: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
      try {
        const closeOutput = await featureClose(ctx.identifier);
        ctx.steps.featureClose = { success: true, output: closeOutput };
      } catch (e) {
        ctx.steps.featureClose = {
          success: false,
          output: `Failed to close feature: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
      return null;
    },

    async runTestGoalValidation(): Promise<StepExitResult> {
      if (!ctx.shouldRunTests || !TEST_CONFIG.validateGoals) return null;
      try {
        const goalValidation = await validateTestGoals('feature', ctx.identifier);
        const output =
          goalValidation.message +
          '\n' +
          (goalValidation.aligned.length > 0
            ? `\n✅ Aligned:\n${goalValidation.aligned.map((a) => `  - ${a.goal}: ${a.testFiles.length} file(s)`).join('\n')}`
            : '') +
          (goalValidation.gaps.length > 0
            ? `\n❌ Gaps:\n${goalValidation.gaps.map((g) => `  - ${g.goal}: Missing test files`).join('\n')}`
            : '') +
          (goalValidation.extras.length > 0
            ? `\nℹ️ Extra:\n${goalValidation.extras.map((e) => `  - ${e.testFile}: ${e.reason}`).join('\n')}`
            : '');
        ctx.steps.testGoalValidation = { success: goalValidation.success, output };
        if (!goalValidation.success) {
          return {
            success: false,
            output: ctx.output.join('\n'),
            steps: ctx.steps,
            outcome: buildTierEndOutcome('blocked_fix_required', 'test_goal_validation_failed', 'Address test goal gaps; then re-run /feature-end.'),
          };
        }
      } catch (e) {
        ctx.steps.testGoalValidation = {
          success: false,
          output: `Test goal validation failed: ${e instanceof Error ? e.message : String(e)}`,
        };
        return {
          success: false,
          output: ctx.output.join('\n'),
          steps: ctx.steps,
          outcome: buildTierEndOutcome('failed', 'test_goal_validation_error', 'Fix test goal validation; then re-run /feature-end.'),
        };
      }
      return null;
    },

    async runTests(): Promise<StepExitResult> {
      if (!ctx.shouldRunTests) return null;
      let impactAnalysisOutput = '';
      try {
        const modifiedFiles = await detectFeatureModifiedFiles(ctx.identifier, ctx.context);
        if (modifiedFiles.length > 0) {
          const impact = await analyzeCodeChangeImpact(modifiedFiles, {
            includeUncommitted: true,
            detailedAnalysis: true,
          });
          if (impact.affectedTests.length > 0) {
            impactAnalysisOutput = `\n📊 Change Impact Analysis:\n  - Change Type: ${impact.changeType} (${impact.confidence} confidence)\n  - Affected Tests: ${impact.affectedTests.length}\n`;
            if (impact.predictions.length > 0) impactAnalysisOutput += `  - Predicted Failures: ${impact.predictions.length}\n`;
            if (impact.changeType === 'breaking' && impact.confidence === 'high')
              impactAnalysisOutput += `  ⚠️  Breaking changes detected - tests may need updates\n`;
            ctx.steps.changeImpactAnalysis = { success: true, output: impactAnalysisOutput };
          }
        }
      } catch (err) {
        console.warn('[feature-end-impl] Change impact analysis failed (non-fatal)', err);
      }
      try {
        const testResult = await testEndWorkflow('feature', ctx.identifier, 'all');
        ctx.steps.runTests = {
          success: testResult.success,
          output: impactAnalysisOutput + testResult.message + '\n' + JSON.stringify(testResult.results, null, 2),
        };
        if (!testResult.success && TEST_CONFIG.analyzeErrors) {
          try {
            const modifiedFiles = await detectFeatureModifiedFiles(ctx.identifier, ctx.context);
            const testFiles = modifiedFiles.filter((f) => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f));
            const appFiles = modifiedFiles.filter((f) => !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f));
            const errorAnalysis = await analyzeTestError(testResult.results.run.output, testFiles, appFiles);
            ctx.steps.testErrorAnalysis = {
              success: true,
              output:
                `Error Analysis:\n- Type: ${errorAnalysis.errorType}\n- Confidence: ${errorAnalysis.confidence}\n- Is Test Code Error: ${errorAnalysis.isTestCodeError}\n- Recommendation: ${errorAnalysis.recommendation}\n- Affected Files: ${errorAnalysis.affectedFiles.join(', ')}`,
            };
            if (errorAnalysis.isTestCodeError && TEST_CONFIG.allowTestFileFixes) {
              const permission = await requestTestFileFixPermission(errorAnalysis, `feature-end-${ctx.identifier}`);
              ctx.steps.testFileFixPermission = {
                success: false,
                output: `Test code error detected. Permission required.\n\n${JSON.stringify(permission, null, 2)}\n\nGrant permission or fix test file, then re-run feature-end.`,
              };
              return {
                success: false,
                output: ctx.output.join('\n'),
                steps: ctx.steps,
                outcome: buildTierEndOutcome('blocked_needs_input', 'test_file_fix_permission', 'Grant permission or fix test file; then re-run /feature-end.'),
              };
            }
            if (errorAnalysis.isTestCodeError) {
              ctx.steps.testFileFixPermission = {
                success: false,
                output: 'Test code error detected but test file fixes are disabled. Fix test file manually.',
              };
              return {
                success: false,
                output: ctx.output.join('\n'),
                steps: ctx.steps,
                outcome: buildTierEndOutcome('blocked_fix_required', 'test_code_error', 'Fix test file manually; then re-run /feature-end.'),
              };
            }
            return {
              success: false,
              output: ctx.output.join('\n'),
              steps: ctx.steps,
              outcome: buildTierEndOutcome('blocked_fix_required', 'test_failed', 'Fix failing tests; then re-run /feature-end.'),
            };
          } catch {
            ctx.steps.testErrorAnalysis = { success: false, output: 'Error analysis failed.' };
            return {
              success: false,
              output: ctx.output.join('\n'),
              steps: ctx.steps,
              outcome: buildTierEndOutcome('failed', 'test_error_analysis', 'Fix test errors; then re-run /feature-end.'),
            };
          }
        }
        if (!testResult.success) {
          return {
            success: false,
            output: ctx.output.join('\n'),
            steps: ctx.steps,
            outcome: buildTierEndOutcome('blocked_fix_required', 'test_failed', 'Fix failing tests; then re-run /feature-end.'),
          };
        }
      } catch (e) {
        ctx.steps.runTests = {
          success: false,
          output: `Test execution failed: ${e instanceof Error ? e.message : String(e)}`,
        };
        return {
          success: false,
          output: ctx.output.join('\n'),
          steps: ctx.steps,
          outcome: buildTierEndOutcome('blocked_fix_required', 'test_execution_failed', 'Fix test failures; then re-run /feature-end.'),
        };
      }
      return null;
    },

    async runCommentCleanup(): Promise<StepExitResult> {
      try {
        const dryRunResult = await featureCommentCleanup({ dryRun: true });
        const exceedsThreshold =
          dryRunResult.filesModified > CLEANUP_FILE_THRESHOLD ||
          dryRunResult.commentsRemoved > CLEANUP_COMMENT_THRESHOLD;
        ctx.steps.commentCleanupDryRun = {
          success: dryRunResult.success,
          output:
            `Dry-run: ${dryRunResult.filesModified} files, ${dryRunResult.commentsRemoved} comments would be modified.` +
            (exceedsThreshold ? '\n⚠️ Exceeds safety threshold. Skipping — run /feature-comment-cleanup manually.' : ''),
        };
        if (exceedsThreshold) {
          ctx.steps.commentCleanup = {
            success: false,
            output: 'Skipped: cleanup scope exceeds safety thresholds. Run /feature-comment-cleanup manually.',
          };
        } else {
          const verified = await runWithLintVerification(
            () => featureCommentCleanup({ dryRun: false }),
            async () => { await gitCheckout('-- .'); }
          );
          const cleanupResult = verified.cleanupResult;
          ctx.steps.commentCleanup = {
            success: verified.skippedCleanup ? false : !verified.reverted && (cleanupResult?.success ?? false),
            output: verified.skippedCleanup
              ? `Pre-cleanup typecheck failed; cleanup skipped.\n${verified.preCleanupLint.truncatedOutput}`
              : verified.reverted
                ? `Comment cleanup reverted due to post-cleanup lint failures.\n${verified.postCleanupLint.truncatedOutput}`
                : cleanupResult
                  ? cleanupResult.summary + '\nFiles modified: ' + cleanupResult.filesModified + '\nComments removed: ' + cleanupResult.commentsRemoved
                  : '',
          };
          ctx.steps.commentCleanupLintGate = {
            success: verified.skippedCleanup ? false : !verified.reverted && verified.postCleanupLint.success,
            output: verified.skippedCleanup
              ? 'Pre-cleanup lint failed; cleanup not run.'
              : verified.reverted
                ? `Lint/typecheck failed after comment cleanup — changes reverted.\n${verified.postCleanupLint.truncatedOutput}`
                : 'Post-cleanup typecheck passed.',
          };
        }
      } catch (e) {
        ctx.steps.commentCleanup = {
          success: false,
          output: `Comment cleanup failed (non-critical): ${e instanceof Error ? e.message : String(e)}\nYou can run /feature-comment-cleanup manually.`,
        };
      }
      return null;
    },

    async runGit(): Promise<StepExitResult> {
      const p = ctx.params as FeatureEndParams;

      ctx.steps.gitReady = {
        success: true,
        output: [
          '✅ All feature-end checks passed:',
          '- Feature summary generated',
          '- Feature documentation closed',
          '- All documentation updated',
        ].join('\n'),
      };

      try {
        const featureBranchName = FEATURE_CONFIG.getBranchName(ctx.context, ctx.identifier);
        if (!featureBranchName) {
          ctx.steps.ensureFeatureBranch = { success: false, output: 'Could not resolve feature branch name from config.' };
          throw new Error('Cannot proceed: feature branch name is null');
        }

        const ensureResult = await ensureTierBranch(FEATURE_CONFIG, ctx.identifier, ctx.context, { createIfMissing: true });
        ctx.steps.ensureFeatureBranch = { success: ensureResult.success, output: ensureResult.messages.join('\n') };
        if (!ensureResult.success) {
          throw new Error('Cannot proceed: could not ensure feature branch');
        }

        const resolvedFeatureBranch = await getCurrentBranch();
        const phasePrefix = await resolvePhaseBranchPrefixForFeature(featureName, p.completedPhases);

        if (phasePrefix) {
          const childResult = await mergeChildBranches(phasePrefix, resolvedFeatureBranch, { deleteMerged: true });
          const allPhaseBranches = [...childResult.merged, ...childResult.failed];
          ctx.steps.findPhaseBranches = {
            success: true,
            output: `Phase branch prefix ${phasePrefix}* — found ${allPhaseBranches.length} branch(es): ${allPhaseBranches.join(', ') || 'none'}`,
          };
          ctx.steps.mergePhaseBranches = {
            success: childResult.failed.length === 0,
            output: `${childResult.messages.join('\n')}\nMerged ${childResult.merged.length}/${allPhaseBranches.length} phase branch(es).`,
          };
          if (childResult.failed.length > 0) {
            return {
              success: false,
              output: ctx.output.join('\n'),
              steps: ctx.steps,
              outcome: buildTierEndOutcome(
                'blocked_fix_required',
                'git_failed',
                `Merging phase branches into feature failed. ${childResult.messages.join(' ')} Fix and re-run /feature-end.`
              ),
            };
          }
        } else {
          ctx.steps.mergePhaseBranches = {
            success: true,
            output:
              'Skipped merging phase-* branches: could not resolve phase prefix (pass completedPhases or ensure .project-manager/features/<feature>/phases/ has phase guides).',
          };
        }

        const commitPrefix = `[feature ${ctx.identifier}]`;
        const featureCommitMessage = p.commitMessage || `${commitPrefix} completion`;
        const featureCommitResult = await gitCommit(featureCommitMessage);
        ctx.steps.gitCommit = { success: featureCommitResult.success, output: featureCommitResult.output };

        const featurePushResult = await gitPush();
        ctx.steps.gitPush = { success: featurePushResult.success, output: featurePushResult.output };

        const mergeToDevelop = await mergeTierBranch(FEATURE_CONFIG, ctx.identifier, ctx.context, {
          push: true,
          deleteBranch: true,
          auditPrewarmPromise: ctx.auditPrewarmPromise,
        });
        ctx.steps.gitMerge = { success: mergeToDevelop.success, output: mergeToDevelop.messages.join('\n') };
        ctx.steps.deleteBranch = {
          success: mergeToDevelop.deletedBranch,
          output: mergeToDevelop.deletedBranch
            ? 'Feature branch deleted locally (and remote delete attempted).'
            : 'Feature branch not deleted (see merge step output).',
        };
        ctx.steps.checkoutDevelop = {
          success: mergeToDevelop.success,
          output: mergeToDevelop.success ? `Merged into ${mergeToDevelop.mergedInto}.` : 'Merge into develop did not complete.',
        };

        if (!mergeToDevelop.success) {
          return {
            success: false,
            output: ctx.output.join('\n'),
            steps: ctx.steps,
            outcome: buildTierEndOutcome(
              'blocked_fix_required',
              'git_failed',
              `Feature merge into develop failed. ${mergeToDevelop.messages.join(' ')} Fix and re-run /feature-end.`
            ),
          };
        }
      } catch (_error) {
        ctx.steps.gitOperations = {
          success: false,
          output: `Git operations failed: ${_error instanceof Error ? _error.message : String(_error)}`,
        };
        return {
          success: false,
          output: ctx.output.join('\n'),
          steps: ctx.steps,
          outcome: buildTierEndOutcome(
            'blocked_fix_required',
            'git_failed',
            `Feature git operations threw an error: ${_error instanceof Error ? _error.message : String(_error)}. Fix and re-run /feature-end.`
          ),
        };
      }

      ctx.steps.githubFinalValidation = {
        success: true,
        output:
          `\n🎯 **Feature Complete - Final GitHub Validation**\n\nPlease visit GitHub to verify all work is integrated.\n` +
          `**Final Checklist:**\n☐ All phase PRs merged to main\n☐ Feature branch fully integrated\n☐ All reviews complete and approved\n☐ CI/CD checks passing\n`,
      };
      return null;
    },

    runReadmeCleanup: true,
    runEndAudit: true,

    async runBeforeAudit() {
      const modifiedFiles = await detectFeatureModifiedFiles(ctx.identifier, ctx.context);
      ctx.auditPayload = {
        modifiedFiles: modifiedFiles.length > 0 ? modifiedFiles : undefined,
        testResults: ctx.steps.runTests ? { success: ctx.steps.runTests.success } : undefined,
      };
    },

    async runVerificationCheck() {
      return proposeVerificationChecklistForFeature(ctx.identifier, ctx.context);
    },

    getSuccessOutcome() {
      return buildTierEndOutcome(
        'completed',
        'pending_push_confirmation',
        'Push pending. Feature complete.',
        ctx.outcome.cascade
      );
    },
  };

  const result = await runTierEndWorkflow(ctx, hooks);
  const withShadow = result as TierEndWorkflowResultWithShadow;
  return {
    success: result.success,
    output: result.output,
    steps: result.steps,
    outcome: result.outcome,
    ...(withShadow.__traceHandle != null && {
      __traceHandle: withShadow.__traceHandle,
      __stepPath: withShadow.__stepPath ?? [],
    }),
  };
}
