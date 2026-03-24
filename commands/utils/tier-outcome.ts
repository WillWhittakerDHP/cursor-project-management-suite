/**
 * Shared outcome types for tier commands.
 * Tier-start outcomes match harness TierOutcome (contracts); tier-end keeps its own status set.
 */

import type { TierName } from '../tiers/shared/types';
import type { TierOutcome } from '../harness/contracts';

export type TierEndStatus =
  | 'completed'
  | 'blocked_needs_input'
  | 'blocked_fix_required'
  | 'failed';

/** Cascade target derived from tierUp/tierDown — no tier-specific names. */
export type CascadeDirection = 'down' | 'up' | 'across';

export interface CascadeInfo {
  direction: CascadeDirection;
  tier: TierName;
  identifier: string;
  /** e.g. '/session-start 6.3.1' — constructed generically from tier name */
  command: string;
}

/** Same as harness/kernel TierOutcome — single contract for start flows. */
export type TierStartOutcome = TierOutcome;

export interface TierStartResult {
  success: boolean;
  output: string;
  outcome: TierStartOutcome;
  /** Set by tier-start dispatcher; impls do not set this. */
  modeGate?: string;
}

export interface TierEndOutcome {
  status: TierEndStatus;
  reasonCode: string;
  nextAction: string;
  /** User-facing verification checklist or deliverables summary (for display in chat). */
  deliverables?: string;
  cascade?: CascadeInfo;
  /**
   * When true, tier-end failed in the shared git step; control plane may offer resume at `git`
   * after the user fixes merge/push state.
   */
  tierEndGitResumable?: boolean;
}

export function buildTierEndOutcome(
  status: TierEndStatus,
  reasonCode: string,
  nextAction: string,
  cascade?: CascadeInfo,
  deliverables?: string,
  extras?: { tierEndGitResumable?: boolean }
): TierEndOutcome {
  return {
    status,
    reasonCode,
    nextAction,
    ...(deliverables !== undefined && deliverables !== '' && { deliverables }),
    ...(cascade !== undefined && { cascade }),
    ...(extras?.tierEndGitResumable === true && { tierEndGitResumable: true }),
  };
}
