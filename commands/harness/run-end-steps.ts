/**
 * Canonical tier end step runner: runs plan_mode_exit → resolve_run_tests → pre_work → tests → mid_work → cleanup → git → verification → config_fix → audit → cascade.
 * Types live in tiers/shared/tier-end-workflow-types.ts; step logic in tier-end-steps.ts.
 */

import type {
  TierEndWorkflowContext,
  TierEndWorkflowHooks,
  TierEndWorkflowResult,
  TierEndWorkflowResultWithShadow,
} from '../tiers/shared/tier-end-workflow-types';
import {
  stepPlanModeExit,
  stepResolveRunTests,
  stepTierPreWork,
  stepTestGoalValidation,
  stepRunTests,
  stepTierMidWork,
  stepCommentCleanup,
  stepReadmeCleanup,
  stepCommitUncommittedNonCursor,
  stepDeliverablesAndPlanningHints,
  stepTierGit,
  stepPropagateShared,
  stepVerificationCheck,
  stepConfigFix,
  stepEndAudit,
  stepAfterAudit,
  stepBuildEndCascade,
} from '../tiers/shared/tier-end-steps';
import { runTierAuditsParallel } from '../audit/atomic/audit-tier-quality';
import type { AuditTier } from '../audit/types';
import { scanHarnessRootsForConflictMarkers } from '../utils/conflict-marker-guard';
import { buildTierEndOutcome } from '../utils/tier-outcome';
import {
  buildWorkflowFrictionEntryFromOrchestrator,
  recordWorkflowFriction,
  shouldAppendWorkflowFriction,
} from '../utils/workflow-friction-log';

/** Ordered step IDs after `conflict_marker_guard` (guard always runs when resuming). */
const END_WORKFLOW_STEP_IDS = [
  'plan_mode_exit',
  'resolve_run_tests',
  'pre_work',
  'test_goal_validation',
  'run_tests',
  'mid_work',
  'comment_cleanup',
  'readme_cleanup',
  'deliverables_check',
  'commit_remaining',
  'git',
  'propagate_shared',
  'verification_check',
  'config_fix',
  'end_audit',
  'after_audit',
  'cascade',
] as const;

/** Narrow allowlist: control plane must only suggest these for `resumeEndAfterStep`. */
const RESUMABLE_END_STEP_IDS = new Set<string>(['commit_remaining', 'git', 'end_audit']);

async function recordEndStep(
  ctx: TierEndWorkflowContext,
  stepId: string,
  phase: 'enter' | 'exit_success' | 'exit_failure' | 'skip'
): Promise<void> {
  if (!ctx.runRecorder || !ctx.runTraceHandle) return;
  await ctx.runRecorder.step(ctx.runTraceHandle, {
    step: stepId,
    phase,
    ts: new Date().toISOString(),
  });
  if (phase !== 'enter') (ctx.stepPath = ctx.stepPath ?? []).push(stepId);
}

function shouldRunEndStep(ctx: TierEndWorkflowContext, stepId: string): boolean {
  const resume = ctx.options?.resumeEndAfterStep?.trim();
  if (resume == null || resume === '') {
    return true;
  }
  if (!RESUMABLE_END_STEP_IDS.has(resume)) {
    console.warn(
      `[run-tier-end-workflow] Ignoring resumeEndAfterStep (not allowlisted): ${JSON.stringify(resume)} — running full pipeline.`
    );
    return true;
  }
  const resumeIdx = (END_WORKFLOW_STEP_IDS as readonly string[]).indexOf(resume);
  const stepIdx = (END_WORKFLOW_STEP_IDS as readonly string[]).indexOf(stepId);
  if (resumeIdx < 0 || stepIdx < 0) {
    return true;
  }
  return stepIdx >= resumeIdx;
}

function attachEndShadowPayload(
  ctx: TierEndWorkflowContext,
  result: TierEndWorkflowResult
): TierEndWorkflowResult | TierEndWorkflowResultWithShadow {
  if (!result.success && result.outcome) {
    const reasonCodeRaw = String(result.outcome.reasonCode ?? '');
    if (shouldAppendWorkflowFriction({ success: false, reasonCodeRaw })) {
      recordWorkflowFriction(
        buildWorkflowFrictionEntryFromOrchestrator({
          action: 'end',
          tier: ctx.config.name,
          identifier: ctx.identifier,
          featureName: ctx.context.feature.name,
          reasonCodeRaw,
          stepPath: ctx.stepPath,
          nextAction: result.outcome.nextAction,
          deliverablesExcerpt: result.outcome.deliverables,
        })
      );
    }
  }
  if (ctx.runTraceHandle != null) {
    return { ...result, __traceHandle: ctx.runTraceHandle, __stepPath: [...(ctx.stepPath ?? [])] };
  }
  return result;
}

/**
 * Run the shared end workflow. Tier impls supply context and hooks; steps run in order.
 * When ctx.runRecorder and ctx.runTraceHandle are set, step events and stepPath are recorded (shadow mode).
 * When options.resumeEndAfterStep is an allowlisted id, earlier steps (except conflict_marker_guard) are skipped.
 */
export async function runTierEndWorkflow(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<TierEndWorkflowResult | TierEndWorkflowResultWithShadow> {
  if (ctx.stepPath == null) ctx.stepPath = [];

  await recordEndStep(ctx, 'conflict_marker_guard', 'enter');
  const markerScan = await scanHarnessRootsForConflictMarkers();
  await recordEndStep(ctx, 'conflict_marker_guard', markerScan.ok ? 'exit_success' : 'exit_failure');
  if (!markerScan.ok) {
    ctx.output.push(markerScan.message);
    ctx.steps.conflict_marker_guard = { success: false, output: markerScan.message };
    return attachEndShadowPayload(ctx, {
      success: false,
      output: ctx.output.join('\n\n'),
      steps: ctx.steps,
      outcome: buildTierEndOutcome(
        'blocked_fix_required',
        'conflict_markers_in_tree',
        'Remove <<<<<<< / ======= / >>>>>>> markers from the listed paths, then re-run tier-end.',
        undefined,
        markerScan.relativePaths.join('\n')
      ),
    });
  }
  ctx.steps.conflict_marker_guard = { success: true, output: 'No conflict markers in .project-manager, client, or server.' };

  // Pre-warm: spawn all tier audit scripts in parallel immediately (outside resume guards).
  // They run concurrently with the rest of the pipeline; stepEndAudit awaits the result.
  if (hooks.runEndAudit === true && !ctx.auditPrewarmPromise) {
    const tier = ctx.config.name as AuditTier;
    ctx.auditPrewarmPromise = runTierAuditsParallel(tier);
  }

  if (shouldRunEndStep(ctx, 'plan_mode_exit')) {
    await recordEndStep(ctx, 'plan_mode_exit', 'enter');
    const planExit = stepPlanModeExit(ctx, hooks);
    await recordEndStep(ctx, 'plan_mode_exit', planExit ? 'exit_success' : 'exit_success');
    if (planExit) return attachEndShadowPayload(ctx, planExit);
  } else {
    await recordEndStep(ctx, 'plan_mode_exit', 'skip');
  }

  if (shouldRunEndStep(ctx, 'resolve_run_tests')) {
    await recordEndStep(ctx, 'resolve_run_tests', 'enter');
    const resolveExit = stepResolveRunTests(ctx, hooks);
    await recordEndStep(ctx, 'resolve_run_tests', resolveExit ? 'exit_failure' : 'exit_success');
    if (resolveExit) return attachEndShadowPayload(ctx, resolveExit);
  } else {
    await recordEndStep(ctx, 'resolve_run_tests', 'skip');
  }

  if (shouldRunEndStep(ctx, 'pre_work')) {
    await recordEndStep(ctx, 'pre_work', 'enter');
    const preExit = await stepTierPreWork(ctx, hooks);
    await recordEndStep(ctx, 'pre_work', preExit ? 'exit_failure' : 'exit_success');
    if (preExit) return attachEndShadowPayload(ctx, preExit);
  } else {
    await recordEndStep(ctx, 'pre_work', 'skip');
  }

  if (shouldRunEndStep(ctx, 'test_goal_validation')) {
    await recordEndStep(ctx, 'test_goal_validation', 'enter');
    const goalExit = await stepTestGoalValidation(ctx, hooks);
    await recordEndStep(ctx, 'test_goal_validation', goalExit ? 'exit_failure' : 'exit_success');
    if (goalExit) return attachEndShadowPayload(ctx, goalExit);
  } else {
    await recordEndStep(ctx, 'test_goal_validation', 'skip');
  }

  if (shouldRunEndStep(ctx, 'run_tests')) {
    await recordEndStep(ctx, 'run_tests', 'enter');
    const testsExit = await stepRunTests(ctx, hooks);
    await recordEndStep(ctx, 'run_tests', testsExit ? 'exit_failure' : 'exit_success');
    if (testsExit) return attachEndShadowPayload(ctx, testsExit);
  } else {
    await recordEndStep(ctx, 'run_tests', 'skip');
  }

  if (shouldRunEndStep(ctx, 'mid_work')) {
    await recordEndStep(ctx, 'mid_work', 'enter');
    const midExit = await stepTierMidWork(ctx, hooks);
    await recordEndStep(ctx, 'mid_work', midExit ? 'exit_failure' : 'exit_success');
    if (midExit) return attachEndShadowPayload(ctx, midExit);
  } else {
    await recordEndStep(ctx, 'mid_work', 'skip');
  }

  if (shouldRunEndStep(ctx, 'comment_cleanup')) {
    await recordEndStep(ctx, 'comment_cleanup', 'enter');
    const commentExit = await stepCommentCleanup(ctx, hooks);
    await recordEndStep(ctx, 'comment_cleanup', commentExit ? 'exit_failure' : 'exit_success');
    if (commentExit) return attachEndShadowPayload(ctx, commentExit);
  } else {
    await recordEndStep(ctx, 'comment_cleanup', 'skip');
  }

  if (shouldRunEndStep(ctx, 'readme_cleanup')) {
    await recordEndStep(ctx, 'readme_cleanup', 'enter');
    await stepReadmeCleanup(ctx, hooks);
    await recordEndStep(ctx, 'readme_cleanup', 'exit_success');
  } else {
    await recordEndStep(ctx, 'readme_cleanup', 'skip');
  }

  if (shouldRunEndStep(ctx, 'deliverables_check')) {
    await recordEndStep(ctx, 'deliverables_check', 'enter');
    await stepDeliverablesAndPlanningHints(ctx);
    await recordEndStep(ctx, 'deliverables_check', 'exit_success');
  } else {
    await recordEndStep(ctx, 'deliverables_check', 'skip');
  }

  if (shouldRunEndStep(ctx, 'commit_remaining')) {
    await recordEndStep(ctx, 'commit_remaining', 'enter');
    const commitExit = await stepCommitUncommittedNonCursor(ctx);
    await recordEndStep(ctx, 'commit_remaining', commitExit ? 'exit_failure' : 'exit_success');
    if (commitExit) return attachEndShadowPayload(ctx, commitExit);
  } else {
    await recordEndStep(ctx, 'commit_remaining', 'skip');
  }

  if (shouldRunEndStep(ctx, 'git')) {
    await recordEndStep(ctx, 'git', 'enter');
    const gitExit = await stepTierGit(ctx, hooks);
    await recordEndStep(ctx, 'git', gitExit ? 'exit_failure' : 'exit_success');
    if (gitExit) return attachEndShadowPayload(ctx, gitExit);
  } else {
    await recordEndStep(ctx, 'git', 'skip');
  }

  if (shouldRunEndStep(ctx, 'propagate_shared')) {
    await recordEndStep(ctx, 'propagate_shared', 'enter');
    await stepPropagateShared(ctx);
    await recordEndStep(ctx, 'propagate_shared', 'exit_success');
  } else {
    await recordEndStep(ctx, 'propagate_shared', 'skip');
  }

  if (shouldRunEndStep(ctx, 'verification_check')) {
    await recordEndStep(ctx, 'verification_check', 'enter');
    const verificationExit = await stepVerificationCheck(ctx, hooks);
    await recordEndStep(ctx, 'verification_check', verificationExit ? 'exit_success' : 'exit_success');
    if (verificationExit) return attachEndShadowPayload(ctx, verificationExit);
  } else {
    await recordEndStep(ctx, 'verification_check', 'skip');
  }

  if (shouldRunEndStep(ctx, 'config_fix')) {
    await recordEndStep(ctx, 'config_fix', 'enter');
    await stepConfigFix(ctx, hooks);
    await recordEndStep(ctx, 'config_fix', 'exit_success');
  } else {
    await recordEndStep(ctx, 'config_fix', 'skip');
  }

  if (shouldRunEndStep(ctx, 'end_audit')) {
    await recordEndStep(ctx, 'end_audit', 'enter');
    const auditExit = await stepEndAudit(ctx, hooks);
    await recordEndStep(ctx, 'end_audit', auditExit ? 'exit_failure' : 'exit_success');
    if (auditExit) return attachEndShadowPayload(ctx, auditExit);
  } else {
    await recordEndStep(ctx, 'end_audit', 'skip');
  }

  if (shouldRunEndStep(ctx, 'after_audit')) {
    await recordEndStep(ctx, 'after_audit', 'enter');
    const afterAuditExit = await stepAfterAudit(ctx, hooks);
    await recordEndStep(ctx, 'after_audit', afterAuditExit ? 'exit_failure' : 'exit_success');
    if (afterAuditExit) return attachEndShadowPayload(ctx, afterAuditExit);
  } else {
    await recordEndStep(ctx, 'after_audit', 'skip');
  }

  if (shouldRunEndStep(ctx, 'cascade')) {
    await recordEndStep(ctx, 'cascade', 'enter');
    await stepBuildEndCascade(ctx, hooks);
    await recordEndStep(ctx, 'cascade', 'exit_success');
  } else {
    await recordEndStep(ctx, 'cascade', 'skip');
  }

  const outcome = hooks.getSuccessOutcome(ctx);
  const result: TierEndWorkflowResult = {
    success: true,
    output: ctx.output.join('\n\n'),
    steps: ctx.steps,
    outcome,
  };
  return attachEndShadowPayload(ctx, result);
}
