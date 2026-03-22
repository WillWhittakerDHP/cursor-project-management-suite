/**
 * Canonical tier start step runner: runs validate → branch → tierDownDocs → read → gather → governance → extras → audit → plan → fillTierDown → cascade.
 * Types live in tiers/shared/tier-start-workflow-types.ts; step logic in tier-start-steps.ts.
 */

import type { TierStartWorkflowContext, TierStartWorkflowHooks, TierStartWorkflowResult } from '../tiers/shared/tier-start-workflow-types';
import type { TierStartResult } from '../utils/tier-outcome';
import type { PlanningTier } from '../utils/planning-doc-paths';
import { recoverPlanningArtifactsAfterCheckout } from '../git/shared/git-manager';
import {
  stepAppendHeaderAndBranchHierarchy,
  stepAppendBranchHierarchy,
  stepValidateStart,
  stepReadContextLight,
  stepContextGathering,
  stepEnsureStartBranch,
  stepEnsureGuideFromPlan,
  stepReadStartContext,
  stepFillDirectTierDown,
  stepGatherContext,
  stepGovernanceContext,
  stepRunExtras,
  stepStartAudit,
  stepRunTierPlan,
  stepBuildStartCascade,
  isGuideFilled,
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

/** Step order for resume: when resumeAfterStep is set, we skip all steps before this one (proceed without starting over). */
const START_WORKFLOW_STEP_IDS = [
  'header_branch',
  'validate',
  'read_context_light',
  'context_gathering',
  'ensure_branch',
  'ensure_guide_from_plan',
  'read_start_context',
  'gather_context',
  'governance',
  'extras',
  'audit',
  'plan',
  'fill_tier_down',
  'cascade',
] as const;

/**
 * Run the shared start workflow. Tier impls supply context and hooks; steps run in order.
 * When ctx.runRecorder and ctx.runTraceHandle are set, step events and stepPath are recorded (shadow mode).
 * When options.resumeAfterStep is set, steps before that step are skipped so the command can proceed past a gate without re-running from the top.
 */
export async function runTierStartWorkflow(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<TierStartWorkflowResult> {
  runStartMs = Date.now();
  if (ctx.stepPath == null) ctx.stepPath = [];

  const guideFillComplete = ctx.options?.guideFillComplete === true;
  const resumeAfterStep = ctx.options?.resumeAfterStep;
  const firstStepIndex =
    resumeAfterStep != null
      ? Math.max(0, START_WORKFLOW_STEP_IDS.indexOf(resumeAfterStep as (typeof START_WORKFLOW_STEP_IDS)[number]))
      : 0;

  const partAStepIds = new Set([
    'header_branch',
    'validate',
    'read_context_light',
    'context_gathering',
    'ensure_branch',
    'ensure_guide_from_plan',
  ]);
  const shouldRunStep = (stepId: string): boolean => {
    if (guideFillComplete && partAStepIds.has(stepId)) return false;
    const idx = START_WORKFLOW_STEP_IDS.indexOf(stepId as (typeof START_WORKFLOW_STEP_IDS)[number]);
    return idx >= 0 && idx >= firstStepIndex;
  };

  // When resuming past context_gathering, set planning doc path so later steps have it.
  if (resumeAfterStep && firstStepIndex > START_WORKFLOW_STEP_IDS.indexOf('context_gathering')) {
    if (!ctx.planningDocPath) {
      ctx.planningDocPath = ctx.context.documents.getPlanningDocRelativePath(
        ctx.config.name as PlanningTier,
        ctx.identifier
      );
    }
  }

  if (!guideFillComplete) {
    if (shouldRunStep('header_branch')) {
      logStepTiming('header_branch', 'enter');
      await recordStep(ctx, 'header_branch', 'enter');
      stepAppendHeaderAndBranchHierarchy(ctx, hooks);
      if (hooks.ensureBranch) {
        await stepAppendBranchHierarchy(ctx, hooks);
      }
      await recordStep(ctx, 'header_branch', 'exit_success');
      logStepTiming('header_branch', 'exit');
    }

    if (shouldRunStep('validate')) {
      logStepTiming('validate', 'enter');
      await recordStep(ctx, 'validate', 'enter');
      const validationExit = await stepValidateStart(ctx, hooks);
      await recordStep(ctx, 'validate', validationExit ? 'exit_failure' : 'exit_success');
      logStepTiming('validate', 'exit');
      if (validationExit) return attachShadowPayload(ctx, validationExit);
    }

    if (shouldRunStep('read_context_light')) {
      logStepTiming('read_context_light', 'enter');
      await recordStep(ctx, 'read_context_light', 'enter');
      await stepReadContextLight(ctx, hooks);
      await recordStep(ctx, 'read_context_light', 'exit_success');
      logStepTiming('read_context_light', 'exit');
    }

    if (shouldRunStep('context_gathering')) {
      logStepTiming('context_gathering', 'enter');
      await recordStep(ctx, 'context_gathering', 'enter');
      const contextExit = await stepContextGathering(ctx, hooks);
      await recordStep(ctx, 'context_gathering', contextExit ? 'exit_success' : 'exit_success');
      logStepTiming('context_gathering', 'exit');
      if (contextExit) return attachShadowPayload(ctx, contextExit);
    }

    if (shouldRunStep('ensure_branch')) {
      logStepTiming('ensure_branch', 'enter');
      await recordStep(ctx, 'ensure_branch', 'enter');
      const branchExit = await stepEnsureStartBranch(ctx, hooks);
      await recordStep(ctx, 'ensure_branch', branchExit ? 'exit_failure' : 'exit_success');
      logStepTiming('ensure_branch', 'exit');
      if (branchExit) return attachShadowPayload(ctx, branchExit);
      await recoverPlanningArtifactsAfterCheckout(ctx, ctx.branchEnsureResult?.autoCommittedPaths);
    }

    if (shouldRunStep('ensure_guide_from_plan')) {
      logStepTiming('ensure_guide_from_plan', 'enter');
      await recordStep(ctx, 'ensure_guide_from_plan', 'enter');
      try {
        const ensureExit = await stepEnsureGuideFromPlan(ctx, hooks);
        if (ensureExit) {
          await recordStep(ctx, 'ensure_guide_from_plan', 'exit_failure');
          return attachShadowPayload(ctx, ensureExit);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await recordStep(ctx, 'ensure_guide_from_plan', 'exit_failure');
        return attachShadowPayload(ctx, {
          success: false,
          output: `${ctx.output.join('\n\n')}\n\n## Guide materialization error\n\n${msg}`,
          outcome: {
            status: 'failed',
            reasonCode: 'guide_materialization_failed',
            nextAction:
              'Fix the error above (planning doc, paths, write guard), then re-run tier-start in execute mode.',
          },
        });
      }
      await recordStep(ctx, 'ensure_guide_from_plan', 'exit_success');
      logStepTiming('ensure_guide_from_plan', 'exit');
    }

    // Option A: for phase/session return guide_fill_pending only when the guide is not yet filled; otherwise continue to Part B.
    const tier = ctx.config.name;
    if (tier === 'phase' || tier === 'session') {
      const guidePath =
        tier === 'phase'
          ? ctx.context.paths.getPhaseGuidePath(ctx.identifier)
          : ctx.context.paths.getSessionGuidePath(ctx.identifier);
      const guideAlreadyFilled = await isGuideFilled(tier, ctx.identifier, ctx.context);
      if (!guideAlreadyFilled) {
        return attachShadowPayload(ctx, {
          success: true,
          output: ctx.output.join('\n\n'),
          outcome: {
            status: 'plan',
            reasonCode: 'guide_fill_pending',
            guidePath,
            nextAction: `The agent must fill the guide (${guidePath}) with concrete Goal, Files, Approach, and Checkpoint for each tierDown block using the planning doc as context; then **the user** runs /accepted-proceed again. Do not run the command yourself.`,
            deliverables:
              'Step 2 — Actual planning: the agent fills the guide with concrete Goal, Files, Approach, and Checkpoint for each session/task using the planning doc as context; then **the user** runs /accepted-proceed again.',
          },
        });
      }
    }
  }

  if (shouldRunStep('read_start_context')) {
    logStepTiming('read_start_context', 'enter');
    await recordStep(ctx, 'read_start_context', 'enter');
    await stepReadStartContext(ctx, hooks);
    await recordStep(ctx, 'read_start_context', 'exit_success');
    logStepTiming('read_start_context', 'exit');
  }

  if (shouldRunStep('gather_context')) {
    logStepTiming('gather_context', 'enter');
    await recordStep(ctx, 'gather_context', 'enter');
    await stepGatherContext(ctx, hooks);
    await recordStep(ctx, 'gather_context', 'exit_success');
    logStepTiming('gather_context', 'exit');
  }

  if (shouldRunStep('governance')) {
    logStepTiming('governance', 'enter');
    await recordStep(ctx, 'governance', 'enter');
    await stepGovernanceContext(ctx, hooks);
    await recordStep(ctx, 'governance', 'exit_success');
    logStepTiming('governance', 'exit');
  }

  if (shouldRunStep('extras')) {
    logStepTiming('extras', 'enter');
    await recordStep(ctx, 'extras', 'enter');
    await stepRunExtras(ctx, hooks);
    await recordStep(ctx, 'extras', 'exit_success');
    logStepTiming('extras', 'exit');
  }

  if (shouldRunStep('audit')) {
    logStepTiming('audit', 'enter');
    await recordStep(ctx, 'audit', 'enter');
    const auditExit = await stepStartAudit(ctx, hooks);
    await recordStep(ctx, 'audit', auditExit ? 'exit_failure' : 'exit_success');
    logStepTiming('audit', 'exit');
    if (auditExit) return attachShadowPayload(ctx, auditExit);
  }

  if (shouldRunStep('plan')) {
    logStepTiming('plan', 'enter');
    await recordStep(ctx, 'plan', 'enter');
    await stepRunTierPlan(ctx, hooks);
    await recordStep(ctx, 'plan', 'exit_success');
    logStepTiming('plan', 'exit');
  }

  if (shouldRunStep('fill_tier_down')) {
    logStepTiming('fill_tier_down', 'enter');
    await recordStep(ctx, 'fill_tier_down', 'enter');
    try {
      await stepFillDirectTierDown(ctx, hooks);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await recordStep(ctx, 'fill_tier_down', 'exit_failure');
      return attachShadowPayload(ctx, {
        success: false,
        output: `${ctx.output.join('\n\n')}\n\n## Fill tierDown error\n\n${msg}`,
        outcome: {
          status: 'failed',
          reasonCode: 'fill_tier_down_failed',
          nextAction: 'Fix the error above and re-run tier-start in execute mode.',
        },
      });
    }
    await recordStep(ctx, 'fill_tier_down', 'exit_success');
    logStepTiming('fill_tier_down', 'exit');
  }

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
