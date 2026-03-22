/**
 * Types for the tier start workflow (context, hooks, results).
 * Step execution lives in harness/run-start-steps.ts; step logic in tier-start-steps.ts.
 */

import type { TierConfig } from './types';
import type { EnsureTierBranchResult } from '../../git/shared/git-manager';
import type { WorkflowCommandContext } from '../../utils/command-context';
import type { TierStartResult, CascadeInfo } from '../../utils/tier-outcome';
import type { FormatBranchHierarchyOptions } from '../../utils/tier-start-utils';
import type { CommandExecutionOptions } from '../../utils/command-execution-mode';
import type { RunRecorder, RunTraceHandle } from '../../harness/contracts';
import type { TierContextSources } from './context-policy';

/** Per-tierDown item parsed from the planning doc "How we build the tierDown" section. */
export interface TierDownPlanItem {
  id: string;
  description: string;
}

/** Parsed Goal, Files, Approach, Checkpoint sections from a planning doc. Used to seed child planning docs from tier-up. */
export interface ParsedPlanningSections {
  goal: string;
  files: string;
  approach: string;
  checkpoint: string;
}

/** Context passed through the start workflow (mutable output array). */
export interface TierStartWorkflowContext {
  config: TierConfig;
  identifier: string;
  /** Resolved display identifier (e.g. scope name, tier identifier). */
  resolvedId: string;
  options?: CommandExecutionOptions;
  context: WorkflowCommandContext;
  output: string[];
  /** Resolved description for scope/display. */
  resolvedDescription?: string;
  /** Set by read-context step; used by plan step. */
  readResult?: TierStartReadResult;
  /** Set by stepContextGathering; path to the living planning doc for iterative Q&A. */
  planningDocPath?: string;
  /** Set by stepSyncPlannedTierDownToGuide; per-tierDown id + description from "How we build the tierDown" section. */
  tierDownPlanItems?: TierDownPlanItem[];
  /** Shadow observability: when set, step events and step-path are recorded. */
  runRecorder?: RunRecorder;
  runTraceHandle?: RunTraceHandle;
  /** Ordered list of step ids that ran (for checksum). Defaults to [] when not provided. */
  stepPath?: string[];
  /** Last result from ensureBranch hook (success path); used for targeted artifact recovery after checkout. */
  branchEnsureResult?: EnsureTierBranchResult;
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
  /** Unresolved open questions inherited from the parent guide (extracted during read-context). */
  inheritedOpenQuestions?: import('../../utils/open-questions').OpenQuestion[];
}

/**
 * Tier context source policy: planning reads only from tierUp documents;
 * tierAcross/tierDown content is generated from that source of truth.
 */
export interface TierContextSourcePolicy {
  tierUpOnly: true;
  /** Which tier supplies guide/handoff/log for this tier's context. */
  sources: TierContextSources;
  /** Human-readable description of allowed sources; derived from sources. */
  allowedSourceDescription: string;
  /** When true or omitted, include tier-appropriate governance; when false, skip; when string[], scope to those domains (future). */
  governance?: true | false | string[];
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
  readContext?(ctx: TierStartWorkflowContext): Promise<TierStartReadResult>;
  gatherContext?(ctx: TierStartWorkflowContext): Promise<string>;
  runExtras?(ctx: TierStartWorkflowContext): Promise<string>;
  /** Returns the first tierDown identifier for cascade (first tierDown in current-tier guide). */
  getFirstTierDownId?(ctx: TierStartWorkflowContext): Promise<string | null>;
  getCompactPrompt?(ctx: TierStartWorkflowContext): string;
  runStartAudit?: boolean;
  getTrailingOutput?(ctx: TierStartWorkflowContext): Promise<string>;
  /** Paths for tierDown (e.g. lowest-tier) files. */
  getTierDownFilePaths?(ctx: TierStartWorkflowContext): Promise<string[]>;
  getContextQuestions?(ctx: TierStartWorkflowContext): Promise<ContextQuestion[]>;
  /**
   * Optional pre-question briefing shown before context decisions:
   * - planningSummary: what the docs indicate we are planning/building this tier.
   * - executionProposal: proposed implementation/code execution approach for this tier.
   * - taskDesign: (lowest tier only) explicit coding goal, files, pseudocode, snippets, acceptance for "Design Before Execute".
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
  /**
   * Goals of this tier — what this tier is for and what "done" looks like.
   * Used as the primary "Goals of this tier" section in the planning doc.
   */
  getTierGoals?(ctx: TierStartWorkflowContext): Promise<string>;
  /**
   * How we will build the tierDown to achieve those goals (phases for feature, sessions for phase,
   * tasks for session). Lowest tier may return empty or "Single deliverable (no child tier)."
   * Used as the primary "How we build the tierDown to achieve them" section in the planning doc.
   */
  getTierDownBuildPlan?(ctx: TierStartWorkflowContext): Promise<string>;
  /**
   * Optional draft for Goal/Files/Approach/Checkpoint from the tier-up planning doc.
   * Session/task impls read parent planning doc and return parsed sections to pre-fill the current planning doc.
   */
  getPlanningDocSlotDraft?(ctx: TierStartWorkflowContext): Promise<ParsedPlanningSections | null>;
}

export type { TierStartResult, CascadeInfo };

/** Result with optional shadow trace baggage (stripped before returning to agent). */
export type TierStartWorkflowResult = TierStartResult & {
  __traceHandle?: RunTraceHandle;
  __stepPath?: string[];
};
