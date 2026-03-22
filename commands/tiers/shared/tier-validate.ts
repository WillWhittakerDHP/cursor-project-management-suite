/**
 * Shared tier validation: dispatches to tier-specific validator.
 * Used by tier-start to validate before starting.
 */

import type { TierConfig } from './types';
import { validatePhaseImpl } from '../phase/composite/validate-phase-impl';
import { validateSessionImpl } from '../session/composite/validate-session-impl';
import { validateTaskImpl } from '../task/composite/validate-task-impl';
import { WorkflowCommandContext } from '../../utils/command-context';
import type { TierParamsBag } from '../../utils/workflow-scope';

export interface TierValidateResult {
  canStart: boolean;
  reason: string;
  details: string[];
}

/** Optional feature ref when no pre-resolved context (e.g. standalone validate command). */
export type TierValidateOptions = {
  /** Tier-start builds this once; validation reuses paths (no second resolveWorkflowScope). */
  context?: WorkflowCommandContext;
  featureId?: string;
  featureName?: string;
};

async function resolveContextForValidate(
  tier: 'phase' | 'session' | 'task',
  identifier: string,
  options?: TierValidateOptions
): Promise<WorkflowCommandContext> {
  if (options?.context) {
    return options.context;
  }
  const bag: TierParamsBag = {
    ...(options?.featureId?.trim() ? { featureId: options.featureId.trim() } : {}),
    ...(options?.featureName?.trim() ? { featureName: options.featureName.trim() } : {}),
  };
  if (tier === 'phase') {
    return WorkflowCommandContext.contextFromParams('phase', { ...bag, phaseId: identifier });
  }
  if (tier === 'session') {
    return WorkflowCommandContext.contextFromParams('session', { ...bag, sessionId: identifier });
  }
  return WorkflowCommandContext.contextFromParams('task', { ...bag, taskId: identifier });
}

function contextResolutionFailure(tier: string, err: unknown): TierValidateResult {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    canStart: false,
    reason: 'Feature reference required',
    details: [
      msg,
      `For ${tier} validation without a pre-built context, pass featureId or featureName (PROJECT_PLAN # or features/ directory slug).`,
    ],
  };
}

export async function runTierValidate(
  config: TierConfig,
  identifier: string,
  options?: TierValidateOptions
): Promise<TierValidateResult> {
  const parsed = config.parseId(identifier);
  if (!parsed && config.name !== 'feature') {
    return {
      canStart: false,
      reason: 'Invalid ID format',
      details: [`Invalid ${config.name} ID format. Received: ${identifier}`],
    };
  }

  switch (config.name) {
    case 'phase': {
      try {
        const ctx = await resolveContextForValidate('phase', identifier, options);
        return validatePhaseImpl(identifier, ctx);
      } catch (err) {
        return contextResolutionFailure('phase', err);
      }
    }
    case 'session': {
      try {
        const ctx = await resolveContextForValidate('session', identifier, options);
        return validateSessionImpl(identifier, ctx);
      } catch (err) {
        return contextResolutionFailure('session', err);
      }
    }
    case 'task': {
      try {
        const ctx = await resolveContextForValidate('task', identifier, options);
        return validateTaskImpl(identifier, ctx);
      } catch (err) {
        return contextResolutionFailure('task', err);
      }
    }
    case 'feature':
      return { canStart: true, reason: 'No validation', details: [] };
    default:
      return { canStart: true, reason: 'OK', details: [] };
  }
}
