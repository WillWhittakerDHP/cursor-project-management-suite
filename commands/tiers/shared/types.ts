/**
 * Shared types for tier-based pipeline and config-driven commands.
 * Used by tier-start, tier-end, tier-change, tier-validate, tier-complete, tier-checkpoint, tier-plan.
 */

import type { WorkflowCommandContext } from '../../utils/command-context';

export type TierName = 'feature' | 'phase' | 'session' | 'task';

/** Result of a pipeline step. */
export interface PipelineStepResult {
  output: string[];
  success: boolean;
  skip?: boolean;
}

/** Context passed through pipeline steps. */
export interface PipelineContext {
  tier: TierName;
  identifier: string;
  featureName: string;
  context: WorkflowCommandContext;
  params: Record<string, unknown>;
}

/** Function type for a pipeline step. */
export type PipelineStepFunction = (ctx: PipelineContext) => Promise<PipelineStepResult>;

/**
 * Tier configuration: path getters, parsers, and behavior hooks.
 * Every tier-specific difference is captured here so shared operations stay generic.
 */
export interface TierConfig {
  name: TierName;
  idFormat: string;
  /** Parse identifier string; return null if invalid. For feature, identifier is the feature name. */
  parseId: (id: string) => unknown;
  paths: {
    guide: (ctx: WorkflowCommandContext, id: string) => string;
    log: (ctx: WorkflowCommandContext, id: string) => string;
    handoff: (ctx: WorkflowCommandContext, id: string) => string;
  };
  /** Canonical status document for this tier. readStatus returns normalized lowercase; writeStatus accepts same. */
  controlDoc: {
    path: (ctx: WorkflowCommandContext, id: string) => string;
    readStatus: (ctx: WorkflowCommandContext, id: string) => Promise<string | null>;
    writeStatus: (ctx: WorkflowCommandContext, id: string, newStatus: string) => Promise<void>;
  };
  /** Update the tier log with a change-request entry. Phase uses read/write; session/task use appendLog. */
  updateLog: (
    context: WorkflowCommandContext,
    identifier: string,
    logEntry: string
  ) => Promise<void>;
  /** Re-plan command when scope assessment requires it; undefined for task (no re-plan). */
  replanCommand?: (
    identifier: string,
    description: string,
    featureName?: string
  ) => Promise<string>;
  /** This tier's git branch name; null if this tier has no branch (e.g. task). */
  getBranchName: (ctx: WorkflowCommandContext, id: string) => string | null;
  /** Parent tier's branch name; null if not applicable. Only session returns non-null (phase branch). */
  getParentBranchName: (ctx: WorkflowCommandContext, id: string) => string | null;
  audit?: {
    start?: PipelineStepFunction;
    end?: PipelineStepFunction;
  };
  /**
   * Preflight checks run by the orchestrators (tier-start, tier-end) before dispatching to impls.
   * Keeps infrastructure concerns (app running, ports) out of tier-specific impl code.
   */
  preflight?: {
    /** When true, orchestrator verifies the app is running (server + client ports) before dispatching. */
    ensureAppRunning?: {
      onStart?: boolean;
      onEnd?: boolean;
    };
  };
}

