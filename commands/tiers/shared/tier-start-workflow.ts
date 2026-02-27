/**
 * Shared tier start workflow: single orchestrator + reusable step contract.
 * Tier impls supply hooks; this module runs validate → branch → read → gather → audit → plan → cascade.
 */

import type { TierConfig } from './types';
import type { WorkflowCommandContext } from '../../utils/command-context';
import type { TierStartResult, CascadeInfo } from '../../utils/tier-outcome';
import type { EnsureTierBranchResult } from '../../git/shared/tier-branch-manager';
import type { FormatBranchHierarchyOptions } from '../../utils/tier-start-utils';
import type { CommandExecutionOptions } from '../../utils/command-execution-mode';
import {
  stepAppendHeaderAndBranchHierarchy,
  stepAppendBranchHierarchy,
  stepValidateStart,
  stepPlanModeExit,
  stepEnsureStartBranch,
  stepReadStartContext,
  stepGatherContext,
  stepRunExtras,
  stepStartAudit,
  stepRunTierPlan,
  stepBuildStartCascade,
} from './tier-start-steps';

/** Context passed through the start workflow (mutable output array). */
export interface TierStartWorkflowContext {
  config: TierConfig;
  identifier: string;
  /** Resolved display identifier (e.g. feature name, session id). */
  resolvedId: string;
  options?: CommandExecutionOptions;
  context: WorkflowCommandContext;
  output: string[];
  /** Resolved description for scope/display (session/phase/feature/task name). */
  resolvedDescription?: string;
  /** Set by read-context step; used by plan step. */
  readResult?: TierStartReadResult;
}

/** Result of validation step. */
export interface TierStartValidationResult {
  canStart: boolean;
  validationMessage: string;
}

/** Result of read-context step (handoff, guide, optional label). */
export interface TierStartReadResult {
  handoff?: string;
  guide?: string;
  label?: string;
  sectionTitle?: string;
}

/**
 * Tier-specific hooks for the start workflow.
 * Orchestrator calls only the hooks that are provided; optional steps are skipped when hook is missing.
 */
export interface TierStartWorkflowHooks {
  /** Build header lines (title, date, command). */
  buildHeader(ctx: TierStartWorkflowContext): string[];
  /** Options for formatBranchHierarchy (featureName, phase?, sessionId?). */
  getBranchHierarchyOptions(ctx: TierStartWorkflowContext): FormatBranchHierarchyOptions;
  /** Validate tier can be started; return canStart and message to append. */
  validate(ctx: TierStartWorkflowContext): Promise<TierStartValidationResult>;
  /** Plan-mode preview steps (bullets). */
  getPlanModeSteps(ctx: TierStartWorkflowContext): string[];
  /** Ensure branch (git). If not provided, step is skipped (e.g. task). */
  ensureBranch?(ctx: TierStartWorkflowContext): Promise<EnsureTierBranchResult>;
  /** Called after successful ensureBranch (e.g. updateTierScope). */
  afterBranch?(ctx: TierStartWorkflowContext): Promise<void>;
  /** Read handoff/guide/label for display. If not provided, step is skipped. */
  readContext?(ctx: TierStartWorkflowContext): Promise<TierStartReadResult>;
  /** Gather and return formatted context string (e.g. auto-gathered files). Empty string skips section. */
  gatherContext?(ctx: TierStartWorkflowContext): Promise<string>;
  /** Optional tier-specific block (e.g. featureLoad + checkpoint, server refresh). Returns extra output. */
  runExtras?(ctx: TierStartWorkflowContext): Promise<string>;
  /** First child id for cascade (e.g. sessionId.1 for session). Null/undefined = no cascade. */
  getFirstChildId?(ctx: TierStartWorkflowContext): Promise<string | null>;
  /** Compact prompt line (optional). */
  getCompactPrompt?(ctx: TierStartWorkflowContext): string;
  /** If false/undefined, start audit is skipped (e.g. task). Default true for feature/phase/session. */
  runStartAudit?: boolean;
  /** Optional output appended after the plan step (e.g. task "Implementation Orders"). */
  getTrailingOutput?(ctx: TierStartWorkflowContext): Promise<string>;
}

export type { TierStartResult, CascadeInfo };

/**
 * Run the shared start workflow: validate → branch → read → gather → audit → plan → cascade.
 * Tier impls supply hooks; step modules in tier-start-steps.ts run the pipeline.
 */
export async function runTierStartWorkflow(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<TierStartResult> {
  stepAppendHeaderAndBranchHierarchy(ctx, hooks);
  if (hooks.ensureBranch) {
    await stepAppendBranchHierarchy(ctx, hooks);
  }

  const validationExit = await stepValidateStart(ctx, hooks);
  if (validationExit) return validationExit;

  const planExit = stepPlanModeExit(ctx, hooks);
  if (planExit) return planExit;

  const branchExit = await stepEnsureStartBranch(ctx, hooks);
  if (branchExit) return branchExit;

  await stepReadStartContext(ctx, hooks);
  await stepGatherContext(ctx, hooks);
  await stepRunExtras(ctx, hooks);
  await stepStartAudit(ctx, hooks);
  await stepRunTierPlan(ctx, hooks);
  if (hooks.getTrailingOutput) {
    const trailing = await hooks.getTrailingOutput(ctx);
    if (trailing) ctx.output.push(trailing);
  }
  const { cascade, nextAction } = await stepBuildStartCascade(ctx, hooks);
  return {
    success: true,
    output: ctx.output.join('\n\n'),
    outcome: {
      status: 'completed',
      reasonCode: 'start_ok',
      nextAction,
      ...(cascade !== undefined && { cascade }),
    },
  };
}
