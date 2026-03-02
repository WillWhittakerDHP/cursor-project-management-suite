/**
 * Canonical tier start step runner: runs validate → branch → tierDownDocs → read → gather → governance → extras → audit → plan → fillTierDown → cascade.
 * Types live in tiers/shared/tier-start-workflow-types.ts; step logic in tier-start-steps.ts.
 */

import type { TierStartWorkflowContext, TierStartWorkflowHooks, TierStartWorkflowResult } from '../tiers/shared/tier-start-workflow-types';
import type { TierStartResult } from '../utils/tier-outcome';
import {
  stepAppendHeaderAndBranchHierarchy,
  stepAppendBranchHierarchy,
  stepValidateStart,
  stepReadContextLight,
  stepContextGatheringPlanMode,
  stepPlanModeExit,
  stepEnsureStartBranch,
  stepSyncPlannedTierDownToGuide,
  stepEnsureTierDownDocs,
  stepSyncGuideFromPlanningDoc,
  stepReadStartContext,
  stepFillDirectTierDown,
  stepGatherContext,
  stepGovernanceContext,
  stepRunExtras,
  stepStartAudit,
  stepRunTierPlan,
  stepBuildStartCascade,
} from '../tiers/shared/tier-start-steps';

async function recordStep(
  ctx: TierStartWorkflowContext,
  stepId: string,
  phase: 'enter' | 'exit_success' | 'exit_failure' | 'skip'
): Promise<void> {
  if (!ctx.runRecorder || !ctx.runTraceHandle) return;
  await ctx.runRecorder.step(ctx.runTraceHandle, {
    step: stepId,
    phase,
    ts: new Date().toISOString(),
  });
  if (phase !== 'enter') ctx.stepPath!.push(stepId);
}

function attachShadowPayload(ctx: TierStartWorkflowContext, result: TierStartResult): TierStartWorkflowResult {
  if (ctx.runTraceHandle != null) {
    return { ...result, __traceHandle: ctx.runTraceHandle, __stepPath: [...(ctx.stepPath ?? [])] };
  }
  return result;
}

/**
 * Run the shared start workflow. Tier impls supply context and hooks; steps run in order.
 * When ctx.runRecorder and ctx.runTraceHandle are set, step events and stepPath are recorded (shadow mode).
 */
export async function runTierStartWorkflow(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<TierStartWorkflowResult> {
  if (ctx.stepPath == null) ctx.stepPath = [];
  await recordStep(ctx, 'header_branch', 'enter');
  stepAppendHeaderAndBranchHierarchy(ctx, hooks);
  if (hooks.ensureBranch) {
    await stepAppendBranchHierarchy(ctx, hooks);
  }
  await recordStep(ctx, 'header_branch', 'exit_success');

  await recordStep(ctx, 'validate', 'enter');
  const validationExit = await stepValidateStart(ctx, hooks);
  await recordStep(ctx, 'validate', validationExit ? 'exit_failure' : 'exit_success');
  if (validationExit) return attachShadowPayload(ctx, validationExit);

  await recordStep(ctx, 'read_context_light', 'enter');
  await stepReadContextLight(ctx, hooks);
  await recordStep(ctx, 'read_context_light', 'exit_success');

  await recordStep(ctx, 'context_gathering', 'enter');
  const contextExit = await stepContextGatheringPlanMode(ctx, hooks);
  await recordStep(ctx, 'context_gathering', contextExit ? 'exit_success' : 'exit_success');
  if (contextExit) return attachShadowPayload(ctx, contextExit);

  await recordStep(ctx, 'plan_mode_exit', 'enter');
  const planExit = await stepPlanModeExit(ctx, hooks);
  await recordStep(ctx, 'plan_mode_exit', planExit ? 'exit_success' : 'exit_success');
  if (planExit) return attachShadowPayload(ctx, planExit);

  await recordStep(ctx, 'ensure_branch', 'enter');
  const branchExit = await stepEnsureStartBranch(ctx, hooks);
  await recordStep(ctx, 'ensure_branch', branchExit ? 'exit_failure' : 'exit_success');
  if (branchExit) return attachShadowPayload(ctx, branchExit);

  await recordStep(ctx, 'sync_planned_tier_down_to_guide', 'enter');
  await stepSyncPlannedTierDownToGuide(ctx, hooks);
  await recordStep(ctx, 'sync_planned_tier_down_to_guide', 'exit_success');

  await recordStep(ctx, 'ensure_tier_down_docs', 'enter');
  await stepEnsureTierDownDocs(ctx, hooks);
  await recordStep(ctx, 'ensure_tier_down_docs', 'exit_success');

  await recordStep(ctx, 'sync_guide_from_planning', 'enter');
  await stepSyncGuideFromPlanningDoc(ctx, hooks);
  await recordStep(ctx, 'sync_guide_from_planning', 'exit_success');

  await recordStep(ctx, 'read_start_context', 'enter');
  await stepReadStartContext(ctx, hooks);
  await recordStep(ctx, 'read_start_context', 'exit_success');

  await recordStep(ctx, 'gather_context', 'enter');
  await stepGatherContext(ctx, hooks);
  await recordStep(ctx, 'gather_context', 'exit_success');

  await recordStep(ctx, 'governance', 'enter');
  await stepGovernanceContext(ctx, hooks);
  await recordStep(ctx, 'governance', 'exit_success');

  await recordStep(ctx, 'extras', 'enter');
  await stepRunExtras(ctx, hooks);
  await recordStep(ctx, 'extras', 'exit_success');

  await recordStep(ctx, 'audit', 'enter');
  const auditExit = await stepStartAudit(ctx, hooks);
  await recordStep(ctx, 'audit', auditExit ? 'exit_failure' : 'exit_success');
  if (auditExit) return attachShadowPayload(ctx, auditExit);

  await recordStep(ctx, 'plan', 'enter');
  await stepRunTierPlan(ctx, hooks);
  await recordStep(ctx, 'plan', 'exit_success');

  await recordStep(ctx, 'fill_tier_down', 'enter');
  await stepFillDirectTierDown(ctx, hooks);
  await recordStep(ctx, 'fill_tier_down', 'exit_success');

  if (hooks.getTrailingOutput) {
    const trailing = await hooks.getTrailingOutput(ctx);
    if (trailing) ctx.output.push(trailing);
  }

  await recordStep(ctx, 'cascade', 'enter');
  const { cascade, nextAction } = await stepBuildStartCascade(ctx, hooks);
  await recordStep(ctx, 'cascade', 'exit_success');

  const result: TierStartResult = {
    success: true,
    output: ctx.output.join('\n\n'),
    outcome: {
      status: 'completed',
      reasonCode: 'start_ok',
      nextAction,
      ...(cascade !== undefined && { cascade }),
    },
  };
  return attachShadowPayload(ctx, result);
}
