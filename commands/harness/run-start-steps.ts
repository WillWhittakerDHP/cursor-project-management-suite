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

const startWorkflowTiming = typeof process !== 'undefined' && process.env.TIER_START_TIMING === '1';
function logStepTiming(stepId: string, phase: 'enter' | 'exit'): void {
  if (!startWorkflowTiming || typeof process === 'undefined') return;
  const t = ((Date.now() - (runStartMs ?? Date.now())) / 1000).toFixed(1);
  process.stderr.write(`[${t}s] tier-start: ${stepId} ${phase}\n`);
}
let runStartMs: number | undefined;

/**
 * Run the shared start workflow. Tier impls supply context and hooks; steps run in order.
 * When ctx.runRecorder and ctx.runTraceHandle are set, step events and stepPath are recorded (shadow mode).
 */
export async function runTierStartWorkflow(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<TierStartWorkflowResult> {
  runStartMs = Date.now();
  if (ctx.stepPath == null) ctx.stepPath = [];
  logStepTiming('header_branch', 'enter');
  await recordStep(ctx, 'header_branch', 'enter');
  stepAppendHeaderAndBranchHierarchy(ctx, hooks);
  if (hooks.ensureBranch) {
    await stepAppendBranchHierarchy(ctx, hooks);
  }
  await recordStep(ctx, 'header_branch', 'exit_success');
  logStepTiming('header_branch', 'exit');

  logStepTiming('validate', 'enter');
  await recordStep(ctx, 'validate', 'enter');
  const validationExit = await stepValidateStart(ctx, hooks);
  await recordStep(ctx, 'validate', validationExit ? 'exit_failure' : 'exit_success');
  logStepTiming('validate', 'exit');
  if (validationExit) return attachShadowPayload(ctx, validationExit);

  logStepTiming('read_context_light', 'enter');
  await recordStep(ctx, 'read_context_light', 'enter');
  await stepReadContextLight(ctx, hooks);
  await recordStep(ctx, 'read_context_light', 'exit_success');
  logStepTiming('read_context_light', 'exit');

  logStepTiming('context_gathering', 'enter');
  await recordStep(ctx, 'context_gathering', 'enter');
  const contextExit = await stepContextGatheringPlanMode(ctx, hooks);
  await recordStep(ctx, 'context_gathering', contextExit ? 'exit_success' : 'exit_success');
  logStepTiming('context_gathering', 'exit');
  if (contextExit) return attachShadowPayload(ctx, contextExit);

  logStepTiming('plan_mode_exit', 'enter');
  await recordStep(ctx, 'plan_mode_exit', 'enter');
  const planExit = await stepPlanModeExit(ctx, hooks);
  await recordStep(ctx, 'plan_mode_exit', planExit ? 'exit_success' : 'exit_success');
  logStepTiming('plan_mode_exit', 'exit');
  if (planExit) return attachShadowPayload(ctx, planExit);

  logStepTiming('ensure_branch', 'enter');
  await recordStep(ctx, 'ensure_branch', 'enter');
  const branchExit = await stepEnsureStartBranch(ctx, hooks);
  await recordStep(ctx, 'ensure_branch', branchExit ? 'exit_failure' : 'exit_success');
  logStepTiming('ensure_branch', 'exit');
  if (branchExit) return attachShadowPayload(ctx, branchExit);

  logStepTiming('sync_planned_tier_down_to_guide', 'enter');
  await recordStep(ctx, 'sync_planned_tier_down_to_guide', 'enter');
  await stepSyncPlannedTierDownToGuide(ctx, hooks);
  await recordStep(ctx, 'sync_planned_tier_down_to_guide', 'exit_success');
  logStepTiming('sync_planned_tier_down_to_guide', 'exit');

  logStepTiming('ensure_tier_down_docs', 'enter');
  await recordStep(ctx, 'ensure_tier_down_docs', 'enter');
  await stepEnsureTierDownDocs(ctx, hooks);
  await recordStep(ctx, 'ensure_tier_down_docs', 'exit_success');
  logStepTiming('ensure_tier_down_docs', 'exit');

  logStepTiming('sync_guide_from_planning', 'enter');
  await recordStep(ctx, 'sync_guide_from_planning', 'enter');
  await stepSyncGuideFromPlanningDoc(ctx, hooks);
  await recordStep(ctx, 'sync_guide_from_planning', 'exit_success');
  logStepTiming('sync_guide_from_planning', 'exit');

  logStepTiming('read_start_context', 'enter');
  await recordStep(ctx, 'read_start_context', 'enter');
  await stepReadStartContext(ctx, hooks);
  await recordStep(ctx, 'read_start_context', 'exit_success');
  logStepTiming('read_start_context', 'exit');

  logStepTiming('gather_context', 'enter');
  await recordStep(ctx, 'gather_context', 'enter');
  await stepGatherContext(ctx, hooks);
  await recordStep(ctx, 'gather_context', 'exit_success');
  logStepTiming('gather_context', 'exit');

  logStepTiming('governance', 'enter');
  await recordStep(ctx, 'governance', 'enter');
  await stepGovernanceContext(ctx, hooks);
  await recordStep(ctx, 'governance', 'exit_success');
  logStepTiming('governance', 'exit');

  logStepTiming('extras', 'enter');
  await recordStep(ctx, 'extras', 'enter');
  await stepRunExtras(ctx, hooks);
  await recordStep(ctx, 'extras', 'exit_success');
  logStepTiming('extras', 'exit');

  logStepTiming('audit', 'enter');
  await recordStep(ctx, 'audit', 'enter');
  const auditExit = await stepStartAudit(ctx, hooks);
  await recordStep(ctx, 'audit', auditExit ? 'exit_failure' : 'exit_success');
  logStepTiming('audit', 'exit');
  if (auditExit) return attachShadowPayload(ctx, auditExit);

  logStepTiming('plan', 'enter');
  await recordStep(ctx, 'plan', 'enter');
  await stepRunTierPlan(ctx, hooks);
  await recordStep(ctx, 'plan', 'exit_success');
  logStepTiming('plan', 'exit');

  logStepTiming('fill_tier_down', 'enter');
  await recordStep(ctx, 'fill_tier_down', 'enter');
  await stepFillDirectTierDown(ctx, hooks);
  await recordStep(ctx, 'fill_tier_down', 'exit_success');
  logStepTiming('fill_tier_down', 'exit');

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
