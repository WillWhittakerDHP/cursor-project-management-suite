/**
 * Tier runner: single entry that dispatches to the correct tier composite from (tier, verb, params).
 * Use for scripts and future slash-command routing without importing each composite.
 */

import type { TierName, TierVerb } from './check-tier-overlap';
import type { CommandExecutionOptions } from './command-execution-mode';
import {
  featureStart,
  featureEnd,
  type FeatureEndParams,
  type FeatureEndResult,
} from '../tiers/feature/composite/feature';
import {
  phaseStart,
  phaseEnd,
  type PhaseEndParams,
  type PhaseEndResult,
} from '../tiers/phase/composite/phase';
import {
  sessionStart,
  sessionEnd,
  type SessionEndParams,
  type SessionEndResult,
} from '../tiers/session/composite/session';
import {
  taskStart,
  taskEnd,
  type TaskEndParams,
} from '../tiers/task/composite/task';
import type { TierStartResult } from './tier-outcome';
import type { TierEndResult } from '../tiers/shared/tier-end';

/** Params for feature-start. */
export interface FeatureStartParams {
  featureId: string;
  options?: CommandExecutionOptions;
}

/** Params for phase-start. */
export interface PhaseStartParams {
  phaseId: string;
  options?: CommandExecutionOptions;
}

/** Params for session-start. */
export interface SessionStartParams {
  sessionId: string;
  description?: string;
  options?: CommandExecutionOptions;
}

/** Params for task-start. */
export interface TaskStartParams {
  taskId: string;
  featureId?: string;
  options?: CommandExecutionOptions;
}

/** Union of all param shapes for runTier(tier, verb, params). */
export type TierRunParams =
  | FeatureStartParams
  | FeatureEndParams
  | PhaseStartParams
  | PhaseEndParams
  | SessionStartParams
  | SessionEndParams
  | TaskStartParams
  | TaskEndParams;

/** Union of all return types: start commands return TierStartResult; end commands return result objects with outcome. */
export type TierRunResult =
  | TierStartResult
  | FeatureEndResult
  | PhaseEndResult
  | SessionEndResult
  | TierEndResult;

function assertFeatureStartParams(params: TierRunParams): asserts params is FeatureStartParams {
  if (params == null || typeof (params as FeatureStartParams).featureId !== 'string') {
    throw new Error('Missing required param: featureId (string)');
  }
}

function assertPhaseStartParams(params: TierRunParams): asserts params is PhaseStartParams {
  if (params == null || typeof (params as PhaseStartParams).phaseId !== 'string') {
    throw new Error('Missing required param: phaseId (string)');
  }
}

function assertSessionStartParams(params: TierRunParams): asserts params is SessionStartParams {
  if (params == null || typeof (params as SessionStartParams).sessionId !== 'string') {
    throw new Error('Missing required param: sessionId (string)');
  }
}

function assertTaskStartParams(params: TierRunParams): asserts params is TaskStartParams {
  if (params == null || typeof (params as TaskStartParams).taskId !== 'string') {
    throw new Error('Missing required param: taskId (string)');
  }
}

/**
 * Dispatches to the correct tier composite. Valid (tier, verb) pairs only.
 */
export async function runTier(
  tier: TierName,
  verb: TierVerb,
  params: TierRunParams
): Promise<TierRunResult> {
  if (tier === 'feature') {
    if (verb === 'start') {
      assertFeatureStartParams(params);
      return featureStart(params.featureId, params.options);
    }
    return featureEnd(params as FeatureEndParams);
  }

  if (tier === 'phase') {
    if (verb === 'start') {
      assertPhaseStartParams(params);
      return phaseStart(params.phaseId, params.options);
    }
    return phaseEnd(params as PhaseEndParams);
  }

  if (tier === 'session') {
    if (verb === 'start') {
      assertSessionStartParams(params);
      return sessionStart(params.sessionId, params.description, params.options);
    }
    return sessionEnd(params as SessionEndParams);
  }

  if (tier === 'task') {
    if (verb === 'start') {
      assertTaskStartParams(params);
      return taskStart(params.taskId, params.featureId, params.options);
    }
    return taskEnd(params as TaskEndParams);
  }

  throw new Error(`Unknown tier: ${tier}. Expected one of: feature, phase, session, task.`);
}
