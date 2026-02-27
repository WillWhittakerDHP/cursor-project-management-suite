/**
 * Phase-end implementation. Thin adapter: builds context + hooks, runs shared tier end workflow.
 */

import { createBranch } from '../../../git/atomic/create-branch';
import { gitCommit } from '../../../git/atomic/commit';
import { ensureTierBranch, mergeTierBranch } from '../../../git/shared/tier-branch-manager';
import { markPhaseComplete, MarkPhaseCompleteParams } from './phase';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { WorkflowId } from '../../../utils/id-utils';
import { detectPhaseModifiedFiles } from '../../../utils/detect-modified-files';
import { gitMerge } from '../../../git/atomic/merge';
import { runCommand, runWithLintVerification, getCurrentDate, readProjectFile, writeProjectFile } from '../../../utils/utils';
import { validateTestGoals } from '../../../testing/composite/test-goal-validator';
import { analyzeTestError } from '../../../testing/composite/test-error-analyzer';
import { requestTestFileFixPermission } from '../../../testing/composite/test-file-fix-permission';
import { TEST_CONFIG } from '../../../testing/utils/test-config';
import { analyzeCodeChangeImpact } from '../../../testing/composite/test-change-detector';
import { CommandExecutionMode } from '../../../utils/command-execution-mode';
import { buildTierEndOutcome, type TierEndOutcome } from '../../../utils/tier-outcome';
import { buildCascadeUp, buildCascadeAcross } from '../../../utils/tier-cascade';
import { isLastPhaseInFeature } from '../../../utils/phase-session-utils';
import { PHASE_CONFIG } from '../../configs/phase';
import { FEATURE_CONFIG } from '../../configs/feature';
import { readTierScope, formatScopeCommitPrefix } from '../../../utils/tier-scope';
import { phaseCommentCleanup } from '../../../comments/commentCleanup';
import { testEndWorkflow } from '../../../testing/composite/test-end-workflow';
import type {
  TierEndWorkflowContext,
  TierEndWorkflowHooks,
  TierEndWorkflowResult,
  StepExitResult,
} from '../../shared/tier-end-workflow';
import { runTierEndWorkflow } from '../../shared/tier-end-workflow';

export interface PhaseEndParams {
  phaseId: string;
  completedSessions: string[];
  nextPhase?: string;
  totalTasks?: number;
  createNewBranch?: boolean;
  newBranchName?: string;
  commitMessage?: string;
  runTests?: boolean;
  testTarget?: string;
  mode?: CommandExecutionMode;
  skipGit?: boolean;
}

export interface PhaseEndResult {
  success: boolean;
  steps: Record<string, { success: boolean; output: string }>;
  outcome: TierEndOutcome;
}

const CLEANUP_FILE_THRESHOLD = 100;
const CLEANUP_COMMENT_THRESHOLD = 500;

export async function phaseEndImpl(params: PhaseEndParams): Promise<PhaseEndResult> {
  const context = await WorkflowCommandContext.getCurrent();
  const steps: Record<string, { success: boolean; output: string }> = {};
  const outcome = buildTierEndOutcome('completed', 'pending_push_confirmation', '');

  const ctx: TierEndWorkflowContext = {
    config: PHASE_CONFIG,
    identifier: params.phaseId,
    params,
    context,
    output: [],
    steps,
    shouldRunTests: false,
    outcome,
  };

  const hooks: TierEndWorkflowHooks = {
    getPlanModeSteps() {
      return [
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
    },

    async runPreWork(c): Promise<StepExitResult> {
      const p = c.params as PhaseEndParams;
      try {
        const markCompleteParams: MarkPhaseCompleteParams = {
          phase: p.phaseId,
          sessionsCompleted: p.completedSessions,
          totalTasks: p.totalTasks,
        };
        const markCompleteOutput = await markPhaseComplete(markCompleteParams);
        c.steps.markPhaseComplete = { success: true, output: markCompleteOutput };
      } catch (_error) {
        c.steps.markPhaseComplete = {
          success: false,
          output: `Failed to mark phase complete: ${_error instanceof Error ? _error.message : String(_error)}`,
        };
      }
      c.steps.updateHandoff = { success: true, output: 'Phase handoff updated by markPhaseComplete' };
      return null;
    },

    async runTestGoalValidation(c): Promise<StepExitResult> {
      if (!c.shouldRunTests || !TEST_CONFIG.validateGoals) return null;
      const p = c.params as PhaseEndParams;
      try {
        const goalValidation = await validateTestGoals('phase', p.phaseId);
        c.steps.testGoalValidation = {
          success: goalValidation.success,
          output: goalValidation.message + '\n' +
            (goalValidation.aligned.length > 0 ? `\n✅ Aligned:\n${goalValidation.aligned.map(a => `  - ${a.goal}: ${a.testFiles.length} file(s)`).join('\n')}` : '') +
            (goalValidation.gaps.length > 0 ? `\n❌ Gaps:\n${goalValidation.gaps.map(g => `  - ${g.goal}: Missing test files`).join('\n')}` : '') +
            (goalValidation.extras.length > 0 ? `\nℹ️ Extra:\n${goalValidation.extras.map(e => `  - ${e.testFile}: ${e.reason}`).join('\n')}` : ''),
        };
        if (!goalValidation.success) {
          return {
            success: false,
            output: c.output.join('\n'),
            steps: c.steps,
            outcome: buildTierEndOutcome('blocked_fix_required', 'test_goal_validation_failed', 'Address test goal gaps; then re-run /phase-end.'),
          };
        }
      } catch (_error) {
        c.steps.testGoalValidation = {
          success: false,
          output: `Test goal validation failed: ${_error instanceof Error ? _error.message : String(_error)}`,
        };
        return {
          success: false,
          output: c.output.join('\n'),
          steps: c.steps,
          outcome: buildTierEndOutcome('failed', 'test_goal_validation_error', 'Fix test goal validation; then re-run /phase-end.'),
        };
      }
      return null;
    },

    async runTests(c): Promise<StepExitResult> {
      if (!c.shouldRunTests) return null;
      const p = c.params as PhaseEndParams;
      const testTarget = p.testTarget ?? TEST_CONFIG.defaultTarget;
      let impactAnalysisOutput = '';

      try {
        const modifiedFiles = await detectPhaseModifiedFiles(p.phaseId, p.completedSessions, c.context);
        if (modifiedFiles.length > 0) {
          const impact = await analyzeCodeChangeImpact(modifiedFiles, {
            includeUncommitted: true,
            detailedAnalysis: true,
          });
          if (impact.affectedTests.length > 0) {
            impactAnalysisOutput = `\n📊 Change Impact Analysis:\n  - Change Type: ${impact.changeType} (${impact.confidence} confidence)\n  - Affected Tests: ${impact.affectedTests.length}\n`;
            if (impact.predictions.length > 0) impactAnalysisOutput += `  - Predicted Failures: ${impact.predictions.length}\n`;
            if (impact.changeType === 'breaking' && impact.confidence === 'high') impactAnalysisOutput += `  ⚠️  Breaking changes detected - tests may need updates\n`;
            c.steps.changeImpactAnalysis = { success: true, output: impactAnalysisOutput };
          }
        }
      } catch (_err) {
        console.warn('Phase end: change detection failed (non-fatal)', _err);
      }

      const testResult = await testEndWorkflow('phase', p.phaseId, testTarget);
      c.steps.runTests = {
        success: testResult.success,
        output: impactAnalysisOutput + testResult.message + '\n' + JSON.stringify(testResult.results, null, 2),
      };

      if (!testResult.success) {
        if (TEST_CONFIG.analyzeErrors) {
          try {
            const modifiedFiles = await detectPhaseModifiedFiles(p.phaseId, p.completedSessions, c.context);
            const testFiles = modifiedFiles.filter(f => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f));
            const appFiles = modifiedFiles.filter(f => !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f));
            const errorAnalysis = await analyzeTestError(testResult.results.run.output, testFiles, appFiles);
            c.steps.testErrorAnalysis = {
              success: true,
              output: `Error Analysis:\n- Type: ${errorAnalysis.errorType}\n- Confidence: ${errorAnalysis.confidence}\n- Is Test Code Error: ${errorAnalysis.isTestCodeError}\n- Recommendation: ${errorAnalysis.recommendation}\n- Affected Files: ${errorAnalysis.affectedFiles.join(', ')}`,
            };
            if (errorAnalysis.isTestCodeError && TEST_CONFIG.allowTestFileFixes) {
              const permission = await requestTestFileFixPermission(errorAnalysis, `phase-end-${p.phaseId}`);
              c.steps.testFileFixPermission = {
                success: false,
                output: `Test code error detected. Permission required to fix test file.\n\n${JSON.stringify(permission, null, 2)}\n\nPlease grant permission to fix test file, then re-run phase-end.`,
              };
              return { success: false, output: c.output.join('\n'), steps: c.steps, outcome: buildTierEndOutcome('blocked_needs_input', 'test_file_fix_permission', 'Grant permission or fix test file; then re-run /phase-end.') };
            }
            if (errorAnalysis.isTestCodeError) {
              c.steps.testFileFixPermission = { success: false, output: 'Test code error detected but test file fixes are disabled. Please fix test file manually.' };
              return { success: false, output: c.output.join('\n'), steps: c.steps, outcome: buildTierEndOutcome('blocked_fix_required', 'test_code_error', 'Fix test file manually; then re-run /phase-end.') };
            }
            return { success: false, output: c.output.join('\n'), steps: c.steps, outcome: buildTierEndOutcome('blocked_fix_required', 'test_failed', 'Fix failing tests; then re-run /phase-end.') };
          } catch (_error) {
            c.steps.testErrorAnalysis = { success: false, output: `Error analysis failed: ${_error instanceof Error ? _error.message : String(_error)}` };
            return { success: false, output: c.output.join('\n'), steps: c.steps, outcome: buildTierEndOutcome('failed', 'test_error_analysis', 'Fix test errors; then re-run /phase-end.') };
          }
        }
        return { success: false, output: c.output.join('\n'), steps: c.steps, outcome: buildTierEndOutcome('blocked_fix_required', 'test_failed', 'Fix failing tests; then re-run /phase-end.') };
      }

      try {
        const phaseLogPath = c.context.paths.getPhaseLogPath(p.phaseId);
        let phaseLogContent = '';
        try {
          phaseLogContent = await readProjectFile(phaseLogPath);
        } catch {
          phaseLogContent = `# Phase ${p.phaseId} Log\n\n`;
        }
        phaseLogContent += `\n**Tests Run:** ${getCurrentDate()} ${testTarget} ${testResult.success ? 'PASSED' : 'FAILED'}\n`;
        await writeProjectFile(phaseLogPath, phaseLogContent);
        c.steps.testExecutionTracking = { success: true, output: 'Test execution recorded in phase log' };
      } catch (_error) {
        c.steps.testExecutionTracking = { success: false, output: `Failed to record test execution: ${_error instanceof Error ? _error.message : String(_error)}` };
      }
      return null;
    },

    async runMidWork(c): Promise<StepExitResult> {
      const p = c.params as PhaseEndParams;
      try {
        const phaseGuide = await c.context.readPhaseGuide(p.phaseId.toString());
        const hasTestStrategy = /## Test Strategy|test.*strategy|test.*requirements/i.test(phaseGuide);
        const hasTestJustification = /test.*justification|tests.*deferred|why.*tests.*not.*created/i.test(phaseGuide);
        const phaseGuideContent = phaseGuide;
        const sessionMatches = phaseGuideContent.matchAll(/Session\s+(\d+\.\d+\.\d+):/g);
        let sessionsWithTestDocs = 0;
        let totalSessions = 0;
        for (const match of sessionMatches) {
          const sessionId = match[1];
          if (WorkflowId.isValidSessionId(sessionId)) {
            totalSessions++;
            try {
              const sessionGuide = await c.context.readSessionGuide(sessionId);
              if (/## Test Strategy|test.*strategy|test.*justification|tests.*deferred/i.test(sessionGuide)) sessionsWithTestDocs++;
            } catch {
              // ignore
            }
          }
        }
        if (!hasTestStrategy && !hasTestJustification && sessionsWithTestDocs === 0) {
          c.steps.testVerification = {
            success: false,
            output: `⚠️ **WARNING: No test strategy or justification found for Phase ${p.phaseId}**\n\n- Phase guide has no test strategy section\n- No test justification documented\n- ${totalSessions > 0 ? `${totalSessions - sessionsWithTestDocs}/${totalSessions} sessions missing test documentation` : 'No sessions found'}\n\n**Recommendation:** Add a "Test Strategy" section to the phase guide.`,
          };
        } else {
          c.steps.testVerification = {
            success: true,
            output: `Test documentation verified:\n- Phase guide: ${hasTestStrategy || hasTestJustification ? 'Has test strategy/justification' : 'No test strategy'}\n- Sessions: ${sessionsWithTestDocs}/${totalSessions} have test documentation`,
          };
        }
      } catch (_error) {
        c.steps.testVerification = { success: false, output: `Test verification check failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}` };
      }

      if (!p.skipGit) {
        try {
          const statusResult = await runCommand('git status --porcelain');
          if (statusResult.success && statusResult.output.trim()) {
            const backupCommitMessage = `Phase ${p.phaseId} pre-audit backup: ${p.completedSessions.length} session(s) completed`;
            const backupCommitResult = await gitCommit(backupCommitMessage);
            c.steps.backupCommit = {
              success: backupCommitResult.success,
              output: backupCommitResult.success ? `Backup commit created: ${backupCommitMessage}` : 'No changes to commit for backup (already committed)',
            };
          } else {
            c.steps.backupCommit = { success: true, output: 'No uncommitted changes - backup commit skipped' };
          }
        } catch (_error) {
          c.steps.backupCommit = { success: false, output: `Backup commit failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}\nContinuing with audits...` };
        }
      } else {
        c.steps.backupCommit = { success: true, output: 'Skipped (skipGit=true)' };
      }

      try {
        const modifiedInPhase = await detectPhaseModifiedFiles(p.phaseId, p.completedSessions, c.context);
        const composableOrComponent = (file: string) =>
          (file.startsWith('client/src/composables/') && /\.(ts|js)$/.test(file)) ||
          (file.startsWith('client/src/components/') && file.endsWith('.vue'));
        const touched = modifiedInPhase.filter(composableOrComponent);
        let annotations: Record<string, unknown> = {};
        try {
          const raw = await readProjectFile('client/.audit-reports/inventory-annotations.json');
          annotations = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          // no annotations file or invalid JSON
        }
        const annotatedPaths = new Set(Object.keys(annotations).filter((k) => k !== '_meta'));
        const unannotated = touched.filter((file) => !annotatedPaths.has(file));
        if (unannotated.length > 0) {
          const example = {
            purpose: 'One-line description of what this composable/component does',
            domain: 'e.g. admin, booking, root',
            reuseTier: 'shared | feature | local',
            tags: ['from valid tag list in inventory-annotations.json _meta.validTags'],
          };
          c.steps.inventoryAnnotations = {
            success: true,
            output:
              `## New Composables/Components Created or Modified This Phase\n\n` +
              `The following ${unannotated.length} file(s) were touched this phase and don't have inventory annotations yet:\n\n` +
              unannotated.map((f) => `- \`${f}\``).join('\n') +
              `\n\nConsider adding entries to \`client/.audit-reports/inventory-annotations.json\` for these files.\n` +
              `Each entry needs: \`purpose\`, \`domain\` (optional), \`reuseTier\`, \`tags\` (from \`_meta.validTags\`).\n\n` +
              `Example:\n\`\`\`json\n${JSON.stringify({ [unannotated[0]]: example }, null, 2)}\n\`\`\``,
          };
        } else {
          c.steps.inventoryAnnotations = { success: true, output: 'No new or unannotated composables/components in this phase.' };
        }
      } catch (_err) {
        c.steps.inventoryAnnotations = {
          success: false,
          output: `Inventory annotation check skipped (non-critical): ${_err instanceof Error ? _err.message : String(_err)}`,
        };
      }

      return null;
    },

    async runCommentCleanup(c): Promise<StepExitResult> {
      const p = c.params as PhaseEndParams;
      const modifiedFiles = await detectPhaseModifiedFiles(p.phaseId, p.completedSessions, c.context);
      const cleanupPaths = modifiedFiles.length > 0 ? modifiedFiles : undefined;

      const dryRunResult = await phaseCommentCleanup({ dryRun: true, paths: cleanupPaths });
      const exceedsThreshold = dryRunResult.filesModified > CLEANUP_FILE_THRESHOLD || dryRunResult.commentsRemoved > CLEANUP_COMMENT_THRESHOLD;
      c.steps.commentCleanupDryRun = {
        success: dryRunResult.success,
        output: `Dry-run: ${dryRunResult.filesModified} files, ${dryRunResult.commentsRemoved} comments would be modified.` +
          (exceedsThreshold ? `\n⚠️ Exceeds safety threshold (${CLEANUP_FILE_THRESHOLD} files / ${CLEANUP_COMMENT_THRESHOLD} comments). Skipping automatic cleanup — run /phase-comment-cleanup manually with review.` : ''),
      };

      if (exceedsThreshold) {
        c.steps.commentCleanup = {
          success: false,
          output: `Skipped: cleanup scope (${dryRunResult.filesModified} files / ${dryRunResult.commentsRemoved} comments) exceeds safety thresholds. Run /phase-comment-cleanup manually.`,
        };
        return null;
      }

      if (!p.skipGit) {
        try {
          const preCleanupStatus = await runCommand('git status --porcelain');
          if (preCleanupStatus.success && preCleanupStatus.output.trim()) {
            await gitCommit(`Phase ${p.phaseId} pre-comment-cleanup backup`);
          }
        } catch {
          // non-blocking
        }
      }

      if (p.skipGit) {
        const cleanupResult = await phaseCommentCleanup({ dryRun: false, paths: cleanupPaths });
        c.steps.commentCleanup = {
          success: cleanupResult.success,
          output: cleanupResult.summary + '\n' + `Files processed: ${cleanupResult.filesProcessed.length}\n` + `Files modified: ${cleanupResult.filesModified}\n` + `Comments removed: ${cleanupResult.commentsRemoved}`,
        };
        c.steps.commentCleanupLintGate = { success: true, output: 'Skipped (skipGit).' };
      } else {
        const verified = await runWithLintVerification(
          () => phaseCommentCleanup({ dryRun: false, paths: cleanupPaths }),
          () => runCommand('git checkout -- .')
        );
        const cleanupResult = verified.cleanupResult;
        c.steps.commentCleanup = {
          success: verified.skippedCleanup ? false : (verified.reverted ? false : (cleanupResult?.success ?? false)),
          output: verified.skippedCleanup
            ? `Pre-cleanup typecheck failed; cleanup skipped.\n${verified.preCleanupLint.truncatedOutput}`
            : verified.reverted
              ? `Comment cleanup was reverted due to post-cleanup lint failures.\n${verified.postCleanupLint.truncatedOutput}`
              : (cleanupResult ? cleanupResult.summary + '\n' + `Files processed: ${cleanupResult.filesProcessed.length}\n` + `Files modified: ${cleanupResult.filesModified}\n` + `Comments removed: ${cleanupResult.commentsRemoved}` : ''),
        };
        c.steps.commentCleanupLintGate = {
          success: verified.skippedCleanup ? false : (verified.reverted ? false : verified.postCleanupLint.success),
          output: verified.skippedCleanup ? 'Pre-cleanup lint failed; cleanup not run.' : verified.reverted ? `Lint/typecheck failed after comment cleanup — changes reverted.\n${verified.postCleanupLint.truncatedOutput}` : 'Post-cleanup typecheck passed.',
        };
      }
      return null;
    },

    runReadmeCleanup: true,
    runEndAudit: true,

    async runGit(c): Promise<StepExitResult> {
      const p = c.params as PhaseEndParams;

      if (p.createNewBranch && p.newBranchName) {
        const branchResult = await createBranch(p.newBranchName);
        c.steps.createBranch = branchResult;
        if (!branchResult.success) {
          return {
            success: false,
            output: c.output.join('\n'),
            steps: c.steps,
            outcome: buildTierEndOutcome('blocked_fix_required', 'create_branch_failed', 'Fix branch creation; then re-run /phase-end.'),
          };
        }
      }

      try {
        const phaseBranchName = PHASE_CONFIG.getBranchName(c.context, p.phaseId);
        const featureBranchName = FEATURE_CONFIG.getBranchName(c.context, c.context.feature.name);
        if (!phaseBranchName || !featureBranchName) {
          c.steps.findSessionBranches = { success: false, output: 'Could not resolve branch names from config.' };
          throw new Error('Cannot proceed: branch names from config are null');
        }

        const sessionBranchPattern = `${phaseBranchName}-session-*`;
        const listResult = await runCommand(`git branch --list ${sessionBranchPattern}`);
        const sessionBranches = listResult.success && listResult.output
          ? listResult.output.split('\n').map(l => l.trim().replace(/^\*\s*/, '')).filter(Boolean)
          : [];
        c.steps.findSessionBranches = { success: true, output: `Found ${sessionBranches.length} session branch(es): ${sessionBranches.join(', ') || 'none'}` };

        const ensureResult = await ensureTierBranch(PHASE_CONFIG, p.phaseId, c.context, { createIfMissing: true });
        c.steps.ensurePhaseBranch = { success: ensureResult.success, output: ensureResult.messages.join('\n') };
        if (!ensureResult.success) throw new Error('Cannot proceed: could not ensure phase branch');

        const mergedSessions: string[] = [];
        const failedSessions: string[] = [];
        for (const sessionBranch of sessionBranches) {
          try {
            const mergeResult = await gitMerge({ sourceBranch: sessionBranch, targetBranch: phaseBranchName });
            if (mergeResult.success) {
              mergedSessions.push(sessionBranch);
              const del = await runCommand(`git branch -d ${sessionBranch}`);
              if (del.success) c.steps[`deleteSessionBranch_${sessionBranch}`] = { success: true, output: `Deleted: ${sessionBranch}` };
            } else failedSessions.push(sessionBranch);
          } catch {
            failedSessions.push(sessionBranch);
          }
        }
        c.steps.mergeSessionBranches = { success: failedSessions.length === 0, output: `Merged ${mergedSessions.length}/${sessionBranches.length} session branch(es).` };

        const scopeConfig = await readTierScope();
        const commitPrefix = formatScopeCommitPrefix(scopeConfig, 'phase');
        const phaseCommitMessage = p.commitMessage || `${commitPrefix} completion`;
        const phaseCommitResult = await gitCommit(phaseCommitMessage);
        c.steps.gitCommitPhase = { success: phaseCommitResult.success, output: phaseCommitResult.output };
        const { gitPush } = await import('../../../git/atomic/push');
        const phasePushResult = await gitPush();
        c.steps.gitPushPhase = { success: phasePushResult.success, output: phasePushResult.output };

        const mergeToFeature = await mergeTierBranch(PHASE_CONFIG, p.phaseId, c.context, { deleteBranch: true, push: true });
        c.steps.gitMergePhaseToFeature = { success: mergeToFeature.success, output: mergeToFeature.messages.join('\n') };
      } catch (_error) {
        c.steps.gitOperations = {
          success: false,
          output: `Git operations failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}`,
        };
      }

      c.steps.githubValidation = {
        success: true,
        output: `\n🔍 **Phase ${p.phaseId} Complete - GitHub Validation Required**\n\nPlease visit GitHub to verify all session PRs from this phase are merged:\n🔗 https://github.com/WillWhittakerDHP/DHP_Differential_Scheduler/pulls\n\n**Validation Checklist:**\n☐ All session PRs from Phase ${p.phaseId} are merged\n☐ No outstanding review comments\n☐ Phase branch is clean and up-to-date with main\n☐ Ready to merge phase to main (if applicable)\n\n**Note:** This is a manual verification step. The agent cannot automatically check PR status.\n`,
      };
      return null;
    },

    async getCascade(c): Promise<{ reasonCode: string; nextIdentifier: string } | null> {
      const p = c.params as PhaseEndParams;
      let isLastPhase = false;
      let featureNameForCascade = '';
      try {
        featureNameForCascade = c.context.feature.name;
        isLastPhase = await isLastPhaseInFeature(c.context.feature.name, p.phaseId);
        if (isLastPhase) {
          c.steps.featureEndPrompt = { success: true, output: `\n✅ **Last phase in feature completed!**\n\nAll phases in this feature are now complete. Use outcome.cascade to run the parent tier end.` };
        } else {
          c.steps.featureEndPrompt = { success: true, output: 'Not the last phase in feature - parent tier end not needed yet' };
        }
      } catch (_error) {
        c.steps.featureEndPrompt = { success: false, output: `Parent tier check failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}` };
      }
      const nextPhase = p.nextPhase ?? '';
      const cascadeUp = isLastPhase ? buildCascadeUp('phase', featureNameForCascade) : undefined;
      const cascadeAcross = nextPhase ? buildCascadeAcross('phase', nextPhase) : undefined;
      c.steps.afterPushShowNextStep = { success: true, output: 'Push complete. Check outcome.cascade for next step.' };
      return cascadeUp ?? cascadeAcross ?? null;
    },

    getSuccessOutcome(_c): TierEndOutcome {
      return buildTierEndOutcome('completed', 'pending_push_confirmation', 'Push pending. Then cascade if present.');
    },
  };

  const result: TierEndWorkflowResult = await runTierEndWorkflow(ctx, hooks);
  return {
    success: result.success,
    steps: result.steps,
    outcome: result.outcome,
  };
}
