/**
 * Shared tier end workflow: single orchestrator + reusable step contract.
 * Tier impls supply hooks; this module runs plan exit → resolveRunTests → preWork → tests → midWork → cleanup → git → audit → clearScope → cascade.
 */

import type { TierConfig } from './types';
import type { WorkflowCommandContext } from '../../utils/command-context';
import type { TierEndOutcome, CascadeInfo } from '../../utils/tier-outcome';
import type { AutofixResult } from '../../audit/types';

/** Step record shape used by feature/phase/session end results. */
export type TierEndStepRecord = Record<string, { success: boolean; output: string }>;

/**
 * Context passed through the end workflow.
 * params is tier-specific; impls cast when building hooks.
 */
export interface TierEndWorkflowContext {
  config: TierConfig;
  /** Tier identifier (e.g. feature name, phaseId, sessionId, taskId). */
  identifier: string;
  /** Tier-specific end params (FeatureEndParams | PhaseEndParams | SessionEndParams | TaskEndParams). */
  params: unknown;
  context: WorkflowCommandContext;
  /** Accumulated output lines (for task-style single output). */
  output: string[];
  /** Per-step record for feature/phase/session; task can use empty or synthetic. */
  steps: TierEndStepRecord;
  /** Resolved from resolveRunTests; set by stepResolveRunTests. */
  shouldRunTests: boolean;
  /** Outcome to fill (status, reasonCode, nextAction, cascade); steps mutate this. */
  outcome: TierEndOutcome;
  /** Optional payload for end audit (e.g. modifiedFiles, testResults); set by hooks before stepEndAudit. */
  auditPayload?: unknown;
  /** Set by stepEndAudit when composite returns autofixResult; used by runAfterAudit to commit. */
  autofixResult?: AutofixResult;
}

/** Early-exit result from a step; null means continue. */
export interface TierEndWorkflowResult {
  success: boolean;
  output: string;
  steps: TierEndStepRecord;
  outcome: TierEndOutcome;
}

export type StepExitResult = TierEndWorkflowResult | null;

/**
 * Tier-specific hooks for the end workflow.
 * Optional hooks are skipped when not provided.
 */
export interface TierEndWorkflowHooks {
  /** Plan-mode step lines (bullets). */
  getPlanModeSteps(ctx: TierEndWorkflowContext): string[];
  /** When true, resolveRunTests returns blocked if params.runTests is undefined (session-end). */
  requireExplicitRunTests?: boolean;
  /** Pre-work: e.g. featureSummarize+featureClose, markPhaseComplete, session verify+audit gate, task vue gate+markComplete. Can return early exit. */
  runPreWork?(ctx: TierEndWorkflowContext): Promise<StepExitResult>;
  /** Mid-work after tests: e.g. phase test verification, session docs, task comment review. Can return early exit. */
  runMidWork?(ctx: TierEndWorkflowContext): Promise<StepExitResult>;
  /** Git operations: feature = pending-only recorder, phase = full merge chain, session = merge+PR, task = scope-labeled commit only (no push). Can return early exit. */
  runGit?(ctx: TierEndWorkflowContext): Promise<StepExitResult>;
  /** Test goal validation (when shouldRunTests and TEST_CONFIG.validateGoals). Can return early exit. */
  runTestGoalValidation?(ctx: TierEndWorkflowContext): Promise<StepExitResult>;
  /** Run tests (change-impact, testEndWorkflow, error analysis). Can return early exit; appends to ctx.steps. */
  runTests?(ctx: TierEndWorkflowContext): Promise<StepExitResult>;
  /** Comment cleanup (feature, phase). Can return early exit; appends to ctx.steps. */
  runCommentCleanup?(ctx: TierEndWorkflowContext): Promise<StepExitResult>;
  /** Whether to run README cleanup (feature, phase, session). */
  runReadmeCleanup?: boolean;
  /** Whether to run end audit via runEndAuditForTier (feature, phase, session, task). */
  runEndAudit?: boolean;
  /** Called just before stepEndAudit so tier can set ctx.auditPayload (e.g. modifiedFiles, testResults). */
  runBeforeAudit?(ctx: TierEndWorkflowContext): Promise<void>;
  /** Called after stepEndAudit to run autofix commit (e.g. commitAutofixChanges using ctx.autofixResult). */
  runAfterAudit?(ctx: TierEndWorkflowContext): Promise<StepExitResult>;
  /** Cascade: build up or across; null = no cascade (feature). */
  getCascade?(ctx: TierEndWorkflowContext): Promise<CascadeInfo | null>;
  /** Final outcome reasonCode and nextAction when successful (e.g. pending_push_confirmation). */
  getSuccessOutcome(ctx: TierEndWorkflowContext): TierEndOutcome;
}

export type { TierEndOutcome, CascadeInfo };

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
  stepEndAudit,
  stepAfterAudit,
  stepClearScope,
  stepBuildEndCascade,
} from './tier-end-steps';

/**
 * Run the shared end workflow. Tier impls supply hooks; steps run in order.
 * Returns unified result (success, output, steps, outcome).
 */
export async function runTierEndWorkflow(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<TierEndWorkflowResult> {
  const planExit = stepPlanModeExit(ctx, hooks);
  if (planExit) return planExit;

  const resolveExit = stepResolveRunTests(ctx, hooks);
  if (resolveExit) return resolveExit;

  const preExit = await stepTierPreWork(ctx, hooks);
  if (preExit) return preExit;

  const goalExit = await stepTestGoalValidation(ctx, hooks);
  if (goalExit) return goalExit;

  const testsExit = await stepRunTests(ctx, hooks);
  if (testsExit) return testsExit;

  const midExit = await stepTierMidWork(ctx, hooks);
  if (midExit) return midExit;

  const commentExit = await stepCommentCleanup(ctx, hooks);
  if (commentExit) return commentExit;

  await stepReadmeCleanup(ctx, hooks);

  const gitExit = await stepTierGit(ctx, hooks);
  if (gitExit) return gitExit;

  await stepEndAudit(ctx, hooks);
  const afterAuditExit = await stepAfterAudit(ctx, hooks);
  if (afterAuditExit) return afterAuditExit;
  await stepClearScope(ctx);
  await stepBuildEndCascade(ctx, hooks);

  const outcome = hooks.getSuccessOutcome(ctx);
  return {
    success: true,
    output: ctx.output.join('\n\n'),
    steps: ctx.steps,
    outcome,
  };
}
