/**
 * Reusable step modules for the tier start workflow.
 * Each step uses shared primitives (formatBranchHierarchy, runTierPlan, buildCascadeDown, runStartAuditForTier)
 * and tier-supplied hooks. The orchestrator runs these in order; steps that can exit early return a result.
 */

import type { TierStartWorkflowContext, TierStartWorkflowHooks, TierStartReadResult } from './tier-start-workflow';
import type { TierStartResult, CascadeInfo } from '../../utils/tier-outcome';
import type { CannotStartTier } from '../../utils/tier-start-utils';
import { formatBranchHierarchy, formatPlanModePreview, formatCannotStart } from '../../utils/tier-start-utils';
import { resolveCommandExecutionMode, isPlanMode } from '../../utils/command-execution-mode';
import { runTierPlan } from './tier-plan';
import { buildCascadeDown } from '../../utils/tier-cascade';
import { runStartAuditForTier } from '../../audit/run-start-audit-for-tier';
import { fillDirectChildrenInParentGuide } from './fill-direct-children';

/** Early-exit result from a step; null means continue. */
export type StepExitResult = TierStartResult | null;

/** Append header and branch hierarchy (always run first). */
export function stepAppendHeaderAndBranchHierarchy(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): void {
  ctx.output.push(hooks.buildHeader(ctx).join('\n'));
}

export async function stepAppendBranchHierarchy(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  const section = await formatBranchHierarchy(hooks.getBranchHierarchyOptions(ctx));
  ctx.output.push(section);
}

/** Validate start; return result to exit early if cannot start. */
export async function stepValidateStart(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<StepExitResult> {
  const validation = await hooks.validate(ctx);
  if (!validation.canStart) {
    ctx.output.push(validation.validationMessage);
    ctx.output.push(formatCannotStart(ctx.config.name as CannotStartTier, ctx.identifier));
    return {
      success: false,
      output: ctx.output.join('\n\n'),
      outcome: {
        status: 'blocked',
        reasonCode: 'validation_failed',
        nextAction: validation.validationMessage,
      },
    };
  }
  return null;
}

/** If plan mode, append plan preview and return plan result; otherwise null.
 *  - Agent sees: workflow steps (getPlanModeSteps) + content summary (getPlanContentSummary) in ctx.output.
 *  - User sees: deliverables (getTierDeliverables) in AskQuestion via outcome.deliverables.
 */
export async function stepPlanModeExit(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<StepExitResult> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (!isPlanMode(executionMode)) return null;
  const planSteps = hooks.getPlanModeSteps(ctx);
  const rawSummary = await hooks.getPlanContentSummary(ctx);
  const intro = rawSummary?.trim();
  ctx.output.push(formatPlanModePreview(planSteps, intro ? { intro } : undefined));

  const deliverables = await hooks.getTierDeliverables(ctx);

  return {
    success: true,
    output: ctx.output.join('\n\n'),
    outcome: {
      status: 'plan',
      reasonCode: 'plan_mode',
      nextAction: 'Plan preview complete. Awaiting approval to execute.',
      deliverables: deliverables || undefined,
    },
  };
}

/** Ensure branch (optional); push messages and optionally exit on failure. */
export async function stepEnsureStartBranch(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<StepExitResult> {
  if (!hooks.ensureBranch) return null;
  const branchResult = await hooks.ensureBranch(ctx);
  for (const msg of branchResult.messages) {
    ctx.output.push(msg);
  }
  if (!branchResult.success) {
    return {
      success: false,
      output: ctx.output.join('\n\n'),
      outcome: {
        status: 'blocked',
        reasonCode: 'branch_failed',
        nextAction: branchResult.messages.join(' '),
      },
    };
  }
  if (hooks.afterBranch) {
    await hooks.afterBranch(ctx);
  }
  return null;
}

/** Ensure child docs exist (e.g. session guide + task sections). Execute mode only; no-op if hook missing. */
export async function stepEnsureChildDocs(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (isPlanMode(executionMode)) return;
  if (!hooks.ensureChildDocs) return;
  await hooks.ensureChildDocs(ctx);
}

/** Read handoff/guide/label and append to output (optional step). */
export async function stepReadStartContext(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  if (!hooks.readContext) return;
  const readResult: TierStartReadResult = await hooks.readContext(ctx);
  ctx.readResult = readResult;
  if (readResult.label) ctx.output.push(readResult.label);
  if (readResult.handoff) ctx.output.push(readResult.handoff);
  if (readResult.guide) {
    const title = readResult.sectionTitle ?? 'Guide';
    ctx.output.push(`## ${title}\n\n${readResult.guide}`);
  }
}

/** Fill implementation-plan fields for all direct children in parent guide (execute mode only). */
export async function stepFillDirectChildren(
  ctx: TierStartWorkflowContext,
  _hooks: TierStartWorkflowHooks
): Promise<void> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (isPlanMode(executionMode)) return;
  if (ctx.config.name === 'task') return;
  await fillDirectChildrenInParentGuide(ctx);
}

/** Gather context string and append if non-empty (optional step). */
export async function stepGatherContext(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  if (!hooks.gatherContext) return;
  const gathered = await hooks.gatherContext(ctx);
  if (gathered) ctx.output.push(gathered);
}

/** Tier-specific extras (e.g. feature load, server refresh) — optional. */
export async function stepRunExtras(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  if (!hooks.runExtras) return;
  const extra = await hooks.runExtras(ctx);
  if (extra) ctx.output.push(extra);
}

/** Run start audit for tier (single entry point); task skips. */
export async function stepStartAudit(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  if (hooks.runStartAudit === false) return;
  const featureName = ctx.context.feature.name;
  const auditOutput = await runStartAuditForTier({
    tier: ctx.config.name,
    identifier: ctx.identifier,
    featureName,
  });
  if (auditOutput) ctx.output.push(auditOutput);
}

/** Run tier plan and append output. */
export async function stepRunTierPlan(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  const featureName = ctx.context.feature.name;
  const planOutput = await runTierPlan(
    ctx.config,
    ctx.resolvedId,
    ctx.resolvedDescription,
    featureName,
    ctx.readResult?.guide
  );
  ctx.output.push(planOutput);
}

/** Build cascade and nextAction from hooks. */
export async function stepBuildStartCascade(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<{ cascade?: CascadeInfo; nextAction: string }> {
  let cascade: CascadeInfo | undefined;
  if (hooks.getFirstChildId) {
    const firstChildId = await hooks.getFirstChildId(ctx);
    if (firstChildId) {
      cascade = buildCascadeDown(ctx.config.name, firstChildId) ?? undefined;
    }
  }
  const nextAction =
    hooks.getCompactPrompt?.(ctx) ??
    `Proceed with ${ctx.config.name} "${ctx.resolvedId}" using the plan above.`;
  return { cascade, nextAction };
}
