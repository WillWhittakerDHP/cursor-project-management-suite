/**
 * Shared tier reopen workflow: single orchestrator + reusable step contract.
 * Tier impls supply hooks; this module runs validate → writeStatus → updateGuideAndLog → ensureBranch → updateScope → appendNextAction.
 */

import type { TierConfig } from './types';
import type { TierName } from './types';
import type { WorkflowCommandContext } from '../../utils/command-context';

export interface TierReopenParams {
  identifier: string;
  reason?: string;
}

export interface TierReopenResult {
  success: boolean;
  output: string;
  previousStatus: string;
  newStatus: string;
  modeGate: string;
  planContent?: string;
  planFilePath?: string;
}

/**
 * Context passed through the reopen workflow.
 */
export interface TierReopenWorkflowContext {
  config: TierConfig;
  identifier: string;
  params: TierReopenParams;
  context: WorkflowCommandContext;
  output: string[];
  modeGate: string;
}

/**
 * Tier-specific hooks for the reopen workflow.
 */
export interface TierReopenWorkflowHooks {
  /** Return a TierReopenResult to exit early (e.g. not complete, invalid ID); null = continue. */
  validate(ctx: TierReopenWorkflowContext): Promise<TierReopenResult | null>;
  /** Short line pushed to output after writing status. */
  getStatusUpdateMessage(ctx: TierReopenWorkflowContext): string;
  /** Feature: guide + log + handoff. Phase: phase log. Session: no-op. */
  updateGuideAndLog?(ctx: TierReopenWorkflowContext): Promise<void>;
  /** Feature: checkout if needed. Phase/session: ensureTierBranch. */
  ensureBranch?(ctx: TierReopenWorkflowContext): Promise<void>;
  /** Scope entry for updateTierScope (id + display name). Feature uses context.feature.name for id. */
  getScope(ctx: TierReopenWorkflowContext): Promise<{ id: string; name: string }>;
  /** tierDown(config.name) for the "Next:" line. */
  getNextActionChildTier(ctx: TierReopenWorkflowContext): TierName | null;
}

const MODE_STEP_SEPARATOR = '\n\n---\n\n';

import {
  stepValidateReopen,
  stepWriteReopenedStatus,
  stepUpdateGuideAndLog,
  stepEnsureBranch,
  stepUpdateScope,
  stepAppendNextAction,
} from './tier-reopen-steps';

/**
 * Run the shared reopen workflow. If validate returns non-null, return it; otherwise run steps and return success result.
 */
export async function runTierReopenWorkflow(
  ctx: TierReopenWorkflowContext,
  hooks: TierReopenWorkflowHooks
): Promise<TierReopenResult> {
  const validateExit = await stepValidateReopen(ctx, hooks);
  if (validateExit) return validateExit;

  await stepWriteReopenedStatus(ctx, hooks);
  await stepUpdateGuideAndLog(ctx, hooks);
  await stepEnsureBranch(ctx, hooks);
  await stepUpdateScope(ctx, hooks);
  stepAppendNextAction(ctx, hooks);

  return {
    success: true,
    output: ctx.modeGate + MODE_STEP_SEPARATOR + ctx.output.join('\n'),
    previousStatus: 'Complete',
    newStatus: 'Reopened',
    modeGate: ctx.modeGate,
  };
}
