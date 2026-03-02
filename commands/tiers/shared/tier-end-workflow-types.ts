/**
 * Types for the tier end workflow (context, hooks, results).
 * Step execution lives in harness/run-end-steps.ts; step logic in tier-end-steps.ts.
 */

import type { TierConfig } from './types';
import type { WorkflowCommandContext } from '../../utils/command-context';
import type { TierEndOutcome, CascadeInfo } from '../../utils/tier-outcome';
import type { AutofixResult } from '../../audit/types';
import type { RunRecorder, RunTraceHandle } from '../../harness/contracts';
import type { CommandExecutionOptions } from '../../utils/command-execution-mode';

/** Step record shape used by feature/phase/session end results. */
export type TierEndStepRecord = Record<string, { success: boolean; output: string }>;

/**
 * Context passed through the end workflow.
 * params is tier-specific; impls cast when building hooks.
 * options: execution toggles (same contract as tier-start); resolve from params.options ?? { mode: params.mode }.
 */
export interface TierEndWorkflowContext {
  config: TierConfig;
  identifier: string;
  params: unknown;
  /** Execution mode options; same contract as tier-start (params.options). Default execute when omitted. */
  options?: CommandExecutionOptions;
  context: WorkflowCommandContext;
  output: string[];
  steps: TierEndStepRecord;
  shouldRunTests: boolean;
  outcome: TierEndOutcome;
  auditPayload?: unknown;
  autofixResult?: AutofixResult;
  runRecorder?: RunRecorder;
  runTraceHandle?: RunTraceHandle;
  stepPath?: string[];
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
  getPlanModeSteps(ctx: TierEndWorkflowContext): string[];
  requireExplicitRunTests?: boolean;
  runPreWork?(ctx: TierEndWorkflowContext): Promise<StepExitResult>;
  runMidWork?(ctx: TierEndWorkflowContext): Promise<StepExitResult>;
  runGit?(ctx: TierEndWorkflowContext): Promise<StepExitResult>;
  runTestGoalValidation?(ctx: TierEndWorkflowContext): Promise<StepExitResult>;
  runTests?(ctx: TierEndWorkflowContext): Promise<StepExitResult>;
  runCommentCleanup?(ctx: TierEndWorkflowContext): Promise<StepExitResult>;
  runReadmeCleanup?: boolean;
  runEndAudit?: boolean;
  runBeforeAudit?(ctx: TierEndWorkflowContext): Promise<void>;
  runAfterAudit?(ctx: TierEndWorkflowContext): Promise<StepExitResult>;
  runVerificationCheck?(ctx: TierEndWorkflowContext): Promise<{
    suggested: boolean;
    checklist?: string;
    productChecklist?: string;
    artifactChecklist?: string;
  } | null>;
  getCascade?(ctx: TierEndWorkflowContext): Promise<CascadeInfo | null>;
  getSuccessOutcome(ctx: TierEndWorkflowContext): TierEndOutcome;
}

export type { TierEndOutcome, CascadeInfo };

/** Result with optional shadow trace baggage (stripped before returning to agent). */
export type TierEndWorkflowResultWithShadow = TierEndWorkflowResult & {
  __traceHandle?: RunTraceHandle;
  __stepPath?: string[];
};
