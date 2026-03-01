/**
 * Types for the tier start workflow (context, hooks, results).
 * Step execution lives in harness/run-start-steps.ts; step logic in tier-start-steps.ts.
 */

import type { TierConfig } from './types';
import type { WorkflowCommandContext } from '../../utils/command-context';
import type { TierStartResult, CascadeInfo } from '../../utils/tier-outcome';
import type { EnsureTierBranchResult } from '../../git/shared/tier-branch-manager';
import type { FormatBranchHierarchyOptions } from '../../utils/tier-start-utils';
import type { CommandExecutionOptions } from '../../utils/command-execution-mode';
import type { RunRecorder, RunTraceHandle } from '../../harness/contracts';

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
  /** Set by stepContextGathering; path to the living planning doc for iterative Q&A. */
  planningDocPath?: string;
  /** Shadow observability: when set, step events and step-path are recorded. */
  runRecorder?: RunRecorder;
  runTraceHandle?: RunTraceHandle;
  /** Ordered list of step ids that ran (for checksum). Defaults to [] when not provided. */
  stepPath?: string[];
}

/**
 * Single context item for iterative planning Q&A.
 * Rich shape: doc-grounded insight + proposal + decision with explicit options.
 */
export interface ContextQuestion {
  category: 'governance' | 'scope' | 'approach' | 'files' | 'dependencies';
  insight?: string;
  proposal?: string;
  question: string;
  context?: string;
  options?: string[];
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
  /** When set, handoff/guide are from tierUp sources only; tierDown docs are excluded. */
  sourcePolicy?: 'tierUpOnly';
}

/**
 * Tier context source policy: planning reads only from tierUp documents;
 * tierAcross/tierDown content is generated from that source of truth.
 */
export interface TierContextSourcePolicy {
  tierUpOnly: true;
  /** Human-readable description of allowed sources (e.g. "feature guide and phase descriptor only"). */
  allowedSourceDescription?: string;
}

/**
 * Tier-specific hooks for the start workflow.
 * Orchestrator calls only the hooks that are provided; optional steps are skipped when hook is missing.
 */
export interface TierStartWorkflowHooks {
  buildHeader(ctx: TierStartWorkflowContext): string[];
  getBranchHierarchyOptions(ctx: TierStartWorkflowContext): FormatBranchHierarchyOptions;
  validate(ctx: TierStartWorkflowContext): Promise<TierStartValidationResult>;
  getPlanModeSteps(ctx: TierStartWorkflowContext): string[];
  getPlanContentSummary(ctx: TierStartWorkflowContext): Promise<string | undefined>;
  getTierDeliverables(ctx: TierStartWorkflowContext): Promise<string>;
  ensureBranch?(ctx: TierStartWorkflowContext): Promise<EnsureTierBranchResult>;
  afterBranch?(ctx: TierStartWorkflowContext): Promise<void>;
  ensureChildDocs?(ctx: TierStartWorkflowContext): Promise<void>;
  readContext?(ctx: TierStartWorkflowContext): Promise<TierStartReadResult>;
  gatherContext?(ctx: TierStartWorkflowContext): Promise<string>;
  runExtras?(ctx: TierStartWorkflowContext): Promise<string>;
  getFirstChildId?(ctx: TierStartWorkflowContext): Promise<string | null>;
  getCompactPrompt?(ctx: TierStartWorkflowContext): string;
  runStartAudit?: boolean;
  getTrailingOutput?(ctx: TierStartWorkflowContext): Promise<string>;
  getTaskFilePaths?(ctx: TierStartWorkflowContext): Promise<string[]>;
  getContextQuestions?(ctx: TierStartWorkflowContext): Promise<ContextQuestion[]>;
  /**
   * Optional pre-question briefing shown before context decisions:
   * - planningSummary: what the docs indicate we are planning/building this tier.
   * - executionProposal: proposed implementation/code execution approach for this tier.
   * - taskDesign: (task tier only) explicit coding goal, files, pseudocode, snippets, acceptance for "Design Before Execute".
   */
  getContextWorkBrief?(ctx: TierStartWorkflowContext): Promise<{
    planningSummary: string;
    executionProposal: string;
    taskDesign?: {
      codingGoal: string;
      files: string[];
      pseudocodeSteps: string[];
      snippets: string;
      acceptanceChecks: string[];
    };
  }>;
  /**
   * When provided, planning uses strict tierUp-only context; tierDown docs are excluded from loaded context.
   * Enforced in shared steps when building the planning doc.
   */
  getContextSourcePolicy?(ctx: TierStartWorkflowContext): TierContextSourcePolicy;
}

export type { TierStartResult, CascadeInfo };

/** Result with optional shadow trace baggage (stripped before returning to agent). */
export type TierStartWorkflowResult = TierStartResult & {
  __traceHandle?: RunTraceHandle;
  __stepPath?: string[];
};
