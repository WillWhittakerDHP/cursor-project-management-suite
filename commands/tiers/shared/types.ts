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
  audit?: {
    start?: PipelineStepFunction;
    end?: PipelineStepFunction;
  };
}

