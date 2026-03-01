/**
 * Canonical tier end step runner: runs plan_mode_exit → resolve_run_tests → pre_work → tests → mid_work → cleanup → git → audit → clearScope → cascade.
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
  stepTierGit,
  stepVerificationCheck,
  stepEndAudit,
  stepAfterAudit,
  stepClearScope,
  stepBuildEndCascade,
} from '../tiers/shared/tier-end-steps';

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

function attachEndShadowPayload(
  ctx: TierEndWorkflowContext,
  result: TierEndWorkflowResult
): TierEndWorkflowResult | TierEndWorkflowResultWithShadow {
  if (ctx.runTraceHandle != null) {
    return { ...result, __traceHandle: ctx.runTraceHandle, __stepPath: [...(ctx.stepPath ?? [])] };
  }
  return result;
}

/**
 * Run the shared end workflow. Tier impls supply context and hooks; steps run in order.
 * When ctx.runRecorder and ctx.runTraceHandle are set, step events and stepPath are recorded (shadow mode).
 */
export async function runTierEndWorkflow(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<TierEndWorkflowResult | TierEndWorkflowResultWithShadow> {
  if (ctx.stepPath == null) ctx.stepPath = [];

  await recordEndStep(ctx, 'plan_mode_exit', 'enter');
  const planExit = stepPlanModeExit(ctx, hooks);
  await recordEndStep(ctx, 'plan_mode_exit', planExit ? 'exit_success' : 'exit_success');
  if (planExit) return attachEndShadowPayload(ctx, planExit);

  await recordEndStep(ctx, 'resolve_run_tests', 'enter');
  const resolveExit = stepResolveRunTests(ctx, hooks);
  await recordEndStep(ctx, 'resolve_run_tests', resolveExit ? 'exit_failure' : 'exit_success');
  if (resolveExit) return attachEndShadowPayload(ctx, resolveExit);

  await recordEndStep(ctx, 'pre_work', 'enter');
  const preExit = await stepTierPreWork(ctx, hooks);
  await recordEndStep(ctx, 'pre_work', preExit ? 'exit_failure' : 'exit_success');
  if (preExit) return attachEndShadowPayload(ctx, preExit);

  await recordEndStep(ctx, 'test_goal_validation', 'enter');
  const goalExit = await stepTestGoalValidation(ctx, hooks);
  await recordEndStep(ctx, 'test_goal_validation', goalExit ? 'exit_failure' : 'exit_success');
  if (goalExit) return attachEndShadowPayload(ctx, goalExit);

  await recordEndStep(ctx, 'run_tests', 'enter');
  const testsExit = await stepRunTests(ctx, hooks);
  await recordEndStep(ctx, 'run_tests', testsExit ? 'exit_failure' : 'exit_success');
  if (testsExit) return attachEndShadowPayload(ctx, testsExit);

  await recordEndStep(ctx, 'mid_work', 'enter');
  const midExit = await stepTierMidWork(ctx, hooks);
  await recordEndStep(ctx, 'mid_work', midExit ? 'exit_failure' : 'exit_success');
  if (midExit) return attachEndShadowPayload(ctx, midExit);

  await recordEndStep(ctx, 'comment_cleanup', 'enter');
  const commentExit = await stepCommentCleanup(ctx, hooks);
  await recordEndStep(ctx, 'comment_cleanup', commentExit ? 'exit_failure' : 'exit_success');
  if (commentExit) return attachEndShadowPayload(ctx, commentExit);

  await recordEndStep(ctx, 'readme_cleanup', 'enter');
  await stepReadmeCleanup(ctx, hooks);
  await recordEndStep(ctx, 'readme_cleanup', 'exit_success');

  await recordEndStep(ctx, 'git', 'enter');
  const gitExit = await stepTierGit(ctx, hooks);
  await recordEndStep(ctx, 'git', gitExit ? 'exit_failure' : 'exit_success');
  if (gitExit) return attachEndShadowPayload(ctx, gitExit);

  await recordEndStep(ctx, 'verification_check', 'enter');
  const verificationExit = await stepVerificationCheck(ctx, hooks);
  await recordEndStep(ctx, 'verification_check', verificationExit ? 'exit_success' : 'exit_success');
  if (verificationExit) return attachEndShadowPayload(ctx, verificationExit);

  await recordEndStep(ctx, 'end_audit', 'enter');
  await stepEndAudit(ctx, hooks);
  await recordEndStep(ctx, 'end_audit', 'exit_success');

  await recordEndStep(ctx, 'after_audit', 'enter');
  const afterAuditExit = await stepAfterAudit(ctx, hooks);
  await recordEndStep(ctx, 'after_audit', afterAuditExit ? 'exit_failure' : 'exit_success');
  if (afterAuditExit) return attachEndShadowPayload(ctx, afterAuditExit);

  await recordEndStep(ctx, 'clear_scope', 'enter');
  await stepClearScope(ctx);
  await recordEndStep(ctx, 'clear_scope', 'exit_success');

  await recordEndStep(ctx, 'cascade', 'enter');
  await stepBuildEndCascade(ctx, hooks);
  await recordEndStep(ctx, 'cascade', 'exit_success');

  const outcome = hooks.getSuccessOutcome(ctx);
  const result: TierEndWorkflowResult = {
    success: true,
    output: ctx.output.join('\n\n'),
    steps: ctx.steps,
    outcome,
  };
  return attachEndShadowPayload(ctx, result);
}
