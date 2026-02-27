/**
 * Reusable step modules for the tier reopen workflow.
 */

import { getCurrentDate } from '../../utils/utils';
import { updateTierScope } from '../../utils/tier-scope';
import type {
  TierReopenWorkflowContext,
  TierReopenWorkflowHooks,
  TierReopenResult,
} from './tier-reopen-workflow';

/** Replace **Status:** Complete with **Status:** Reopened in guide/log content. */
export function flipCompleteToReopened(content: string): string {
  return content.replace(/(\*\*Status:\*\*)\s*Complete/i, '$1 Reopened');
}

/** Build the standard reopen log entry line. */
export function formatReopenEntry(reason: string | undefined): string {
  return `\n\n## Reopen - ${getCurrentDate()}\n**Reason:** ${reason ?? 'Additional work needed'}\n**Status:** Reopened\n`;
}

/** Call hooks.validate(ctx); if non-null return it, else return null. */
export async function stepValidateReopen(
  ctx: TierReopenWorkflowContext,
  hooks: TierReopenWorkflowHooks
): Promise<TierReopenResult | null> {
  return hooks.validate(ctx);
}

/** Write controlDoc status to 'reopened' and push status message to ctx.output. */
export async function stepWriteReopenedStatus(
  ctx: TierReopenWorkflowContext,
  hooks: TierReopenWorkflowHooks
): Promise<void> {
  await ctx.config.controlDoc.writeStatus(ctx.context, ctx.identifier, 'reopened');
  ctx.output.push(hooks.getStatusUpdateMessage(ctx));
}

/** Call hooks.updateGuideAndLog if present. */
export async function stepUpdateGuideAndLog(
  ctx: TierReopenWorkflowContext,
  hooks: TierReopenWorkflowHooks
): Promise<void> {
  if (hooks.updateGuideAndLog) await hooks.updateGuideAndLog(ctx);
}

/** Call hooks.ensureBranch if present. */
export async function stepEnsureBranch(
  ctx: TierReopenWorkflowContext,
  hooks: TierReopenWorkflowHooks
): Promise<void> {
  if (hooks.ensureBranch) await hooks.ensureBranch(ctx);
}

/** Resolve scope via getScope, call updateTierScope, push "**{tier} {id} reopened.**" */
export async function stepUpdateScope(
  ctx: TierReopenWorkflowContext,
  hooks: TierReopenWorkflowHooks
): Promise<void> {
  const scope = await hooks.getScope(ctx);
  await updateTierScope(ctx.config.name, scope);
  ctx.output.push(`\n**${ctx.config.name.charAt(0).toUpperCase() + ctx.config.name.slice(1)} ${scope.id} reopened.**`);
}

/** Append the "Next:" line using getNextActionChildTier. */
export function stepAppendNextAction(
  ctx: TierReopenWorkflowContext,
  hooks: TierReopenWorkflowHooks
): void {
  const childTier = hooks.getNextActionChildTier(ctx);
  if (childTier) {
    ctx.output.push(`\n**Next:** Plan child ${childTier} via \`/plan-${childTier} <id>\` or \`/${childTier}-start <id>\`.`);
  } else {
    ctx.output.push(`\n**Next:** Make changes and run the appropriate tier-end when done.`);
  }
}
