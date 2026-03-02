/**
 * Generic cascade builders using tierUp/tierDown.
 * No tier-specific names — command strings are derived from tier at runtime.
 */

import { tierUp, tierDown } from './tier-navigation';
import type { TierName } from '../tiers/shared/types';
import type { CascadeInfo } from './tier-outcome';

export function buildCascadeDown(fromTier: TierName, tierDownId: string): CascadeInfo | undefined {
  const tierDownTier = tierDown(fromTier);
  if (!tierDownTier) return undefined;
  return {
    direction: 'down',
    tier: tierDownTier,
    identifier: tierDownId,
    command: `/${tierDownTier}-start ${tierDownId}`,
  };
}

export function buildCascadeUp(fromTier: TierName, tierUpId: string): CascadeInfo | undefined {
  const tierUpTier = tierUp(fromTier);
  if (!tierUpTier) return undefined;
  return {
    direction: 'up',
    tier: tierUpTier,
    identifier: tierUpId,
    command: `/${tierUpTier}-end ${tierUpId}`,
  };
}

export function buildCascadeAcross(tier: TierName, nextId: string): CascadeInfo {
  return {
    direction: 'across',
    tier,
    identifier: nextId,
    command: `/${tier}-start ${nextId}`,
  };
}
