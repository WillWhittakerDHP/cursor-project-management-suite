/**
 * Tier navigation: tierUp, tierAcross, tierDown.
 * Single source of truth for tier order and adjacent-tier transitions.
 * Used for next-step prompts and future automatic movements (e.g. suggest tier-up end when no next at tier).
 *
 * Hierarchy: feature (0) → phase (1) → session (2) → task (3)
 * No I/O in this module; callers use WorkflowId.parse*, isLastSessionInPhase, etc. to resolve identifiers.
 */

import type { TierName } from '../tiers/shared/types';

const TIER_ORDER: TierName[] = ['feature', 'phase', 'session', 'task'];

/**
 * Numeric level for a tier (0 = feature, 3 = task). Use for comparisons and "is last at tier" / "first child" logic.
 */
export function getTierLevel(tier: TierName): number {
  const idx = TIER_ORDER.indexOf(tier);
  return idx === -1 ? -1 : idx;
}

/**
 * Current tier context (identity). Use for "we are here" and for reuse in prompts.
 */
export function tierAcross(tier: TierName, identifier: string): { tier: TierName; identifier: string } {
  return { tier, identifier };
}

/**
 * Parent tier: task→session, session→phase, phase→feature, feature→null.
 * Use when "no next at tier" to suggest or run tier-up end (e.g. session-end → phase-end).
 */
export function tierUp(tier: TierName): TierName | null {
  const level = getTierLevel(tier);
  if (level <= 0) return null;
  return TIER_ORDER[level - 1] ?? null;
}

/**
 * Child tier: feature→phase, phase→session, session→task, task→null.
 * Use to suggest tier-down start after a tier start (e.g. phase-start → first session-start).
 */
export function tierDown(tier: TierName): TierName | null {
  const level = getTierLevel(tier);
  if (level === -1 || level >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[level + 1] ?? null;
}
