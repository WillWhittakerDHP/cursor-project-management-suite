/**
 * Atomic Command: /status-get [tier] [identifier]
 * Get status for specific tier from control docs (PROJECT_PLAN, phase guide, session checkbox, session guide).
 *
 * Tier: Cross-tier utility
 * Operates on: Status queries across all tiers
 */

import { WorkflowCommandContext } from '../../utils/command-context';
import { WorkflowId } from '../../utils/id-utils';
import { DocumentTier } from '../../utils/document-manager';
import { resolveFeatureName } from '../../utils';
import { FEATURE_CONFIG } from '../../tiers/configs/feature';
import { PHASE_CONFIG } from '../../tiers/configs/phase';
import { SESSION_CONFIG } from '../../tiers/configs/session';
import { TASK_CONFIG } from '../../tiers/configs/task';

export type StatusTier = DocumentTier | 'task';

export interface GetStatusParams {
  tier: StatusTier;
  identifier?: string;
  featureName?: string;
}

export interface StatusInfo {
  tier: StatusTier;
  identifier?: string;
  status: string;
  title: string;
  description?: string;
}

function getConfig(tier: StatusTier) {
  switch (tier) {
    case 'feature': return FEATURE_CONFIG;
    case 'phase': return PHASE_CONFIG;
    case 'session': return SESSION_CONFIG;
    case 'task': return TASK_CONFIG;
    default: return null;
  }
}

function resolveId(tier: StatusTier, params: GetStatusParams, featureName: string): string | null {
  if (tier === 'feature') return params.identifier ?? featureName;
  if (tier === 'phase' || tier === 'session' || tier === 'task') return params.identifier ?? null;
  return null;
}

/**
 * Get status for specific tier from control doc
 *
 * @param params Get status parameters
 * @returns Status information or null if not found
 */
export async function getStatus(params: GetStatusParams): Promise<StatusInfo | null> {
  const featureName = await resolveFeatureName(params.featureName);
  const context = new WorkflowCommandContext(featureName);

  if ((params.tier === 'phase' || params.tier === 'session' || params.tier === 'task') && !params.identifier) {
    return null;
  }

  if (params.tier === 'session' && params.identifier && !WorkflowId.isValidSessionId(params.identifier)) {
    return null;
  }

  if (params.tier === 'task' && params.identifier && !WorkflowId.isValidTaskId(params.identifier)) {
    return null;
  }

  const config = getConfig(params.tier);
  if (!config) return null;

  const id = resolveId(params.tier, params, featureName);
  if (id === null && params.tier !== 'feature') return null;
  const effectiveId = id ?? featureName;

  try {
    const status = await config.controlDoc.readStatus(context, effectiveId);
    if (status === null) return null;

    const title = params.tier === 'feature'
      ? featureName
      : params.tier === 'phase'
        ? `Phase ${effectiveId}`
        : params.tier === 'session'
          ? `Session ${effectiveId}`
          : `Task ${effectiveId}`;

    return {
      tier: params.tier,
      identifier: params.identifier,
      status,
      title,
      description: undefined,
    };
  } catch (err) {
    console.warn('Get status: failed to read control doc status', err);
    return null;
  }
}
