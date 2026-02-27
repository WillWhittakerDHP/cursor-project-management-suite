/**
 * Tier config registry: map TierName to TierConfig for generic tier operations
 * (e.g. tier-branch-manager walking tierUp to resolve branch chain).
 */

import { FEATURE_CONFIG } from './feature';
import { PHASE_CONFIG } from './phase';
import { SESSION_CONFIG } from './session';
import { TASK_CONFIG } from './task';
import type { TierConfig, TierName } from '../shared/types';

const TIER_CONFIG_MAP: Record<TierName, TierConfig> = {
  feature: FEATURE_CONFIG,
  phase: PHASE_CONFIG,
  session: SESSION_CONFIG,
  task: TASK_CONFIG,
};

export function getConfigForTier(tier: TierName): TierConfig {
  return TIER_CONFIG_MAP[tier];
}

export { FEATURE_CONFIG, PHASE_CONFIG, SESSION_CONFIG, TASK_CONFIG };
