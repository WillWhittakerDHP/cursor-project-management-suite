/**
 * Generic cascade builders using tierUp/tierDown.
 * No tier-specific names — command strings are derived from tier at runtime.
 */

import { tierUp, tierDown } from './tier-navigation';
import type { TierName } from '../tiers/shared/types';
import type { CascadeInfo } from './tier-outcome';

export function buildCascadeDown(fromTier: TierName, childId: string): CascadeInfo | undefined {
  const childTier = tierDown(fromTier);
  if (!childTier) return undefined;
  return {
    direction: 'down',
    tier: childTier,
    identifier: childId,
    command: `/${childTier}-start ${childId}`,
  };
}

export function buildCascadeUp(fromTier: TierName, parentId: string): CascadeInfo | undefined {
  const parentTier = tierUp(fromTier);
  if (!parentTier) return undefined;
  return {
    direction: 'up',
    tier: parentTier,
    identifier: parentId,
    command: `/${parentTier}-end ${parentId}`,
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
