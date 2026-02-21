/**
 * Shared: Run planning with checks (single entry for all tiers)
 *
 * Tier commands call this with resolved description and tier context; no branching
 * on "description present or not" in the tier. Default docCheckType by tier so
 * tiers don't pass it unless overriding.
 */

import type { PlanningTier } from '../../utils/planning-types';
import { planWithChecks, type PlanWithChecksOptions } from '../composite/plan-with-checks';

export type DocCheckType = 'component' | 'transformer' | 'pattern' | 'migration';

export interface RunPlanningWithChecksParams {
  description: string;
  tier: PlanningTier;
  feature: string;
  phase?: number;
  sessionId?: string;
  taskId?: string;
  docCheckType?: DocCheckType;
  options?: PlanWithChecksOptions;
}

function defaultDocCheckTypeForTier(tier: PlanningTier): DocCheckType {
  return tier === 'feature' || tier === 'phase' ? 'migration' : 'component';
}

/**
 * Run full planning pipeline (scoping, tier overlap, parse, docs, reuse, validation).
 * Uses default docCheckType by tier when not provided.
 */
export async function runPlanningWithChecks(
  params: RunPlanningWithChecksParams
): Promise<string> {
  const {
    description,
    tier,
    feature,
    phase,
    sessionId,
    taskId,
    docCheckType = defaultDocCheckTypeForTier(tier),
    options,
  } = params;
  return planWithChecks(
    description,
    tier,
    feature,
    phase,
    sessionId,
    taskId,
    docCheckType,
    options
  );
}
