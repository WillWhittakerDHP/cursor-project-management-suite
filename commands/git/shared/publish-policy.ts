/**
 * Local-first, publish-late: centralizes when the harness may touch origin.
 */

import type { TierName } from '../../tiers/shared/types';

/** Tier-start: only feature may optionally pull/sync trunk; lower tiers never require remote refs. */
export function tierStartShouldSyncPublishedBranches(tier: TierName): boolean {
  return tier === 'feature';
}

/** Newly created feature branches are not auto-pushed (publish explicitly or at tier-end). */
export function shouldAutoPushNewFeatureBranch(): boolean {
  return false;
}

/** Whether mergeTierBranch should pull parent from origin before merge (multi-machine). */
export function mergeShouldSyncRemoteDefault(): boolean {
  return true;
}
