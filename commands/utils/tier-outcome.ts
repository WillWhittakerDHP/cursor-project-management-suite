/**
 * Shared outcome type for tier end commands (session-end, phase-end, feature-end, task-end).
 * Agents use status + reasonCode + nextAction to decide next step without inferring from step text.
 */

import type { TierName } from '../tiers/shared/types';

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

export type TierStartStatus = 'completed' | 'plan' | 'failed' | 'blocked';

export interface TierStartOutcome {
  status: TierStartStatus;
  reasonCode: string;
  nextAction: string;
  /** User-facing deliverables summary for plan-mode approval (shown in AskQuestion). */
  deliverables?: string;
  cascade?: CascadeInfo;
}

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
  /** User-facing verification checklist or deliverables summary (shown in AskQuestion). */
  deliverables?: string;
  cascade?: CascadeInfo;
}

export function buildTierEndOutcome(
  status: TierEndStatus,
  reasonCode: string,
  nextAction: string,
  cascade?: CascadeInfo,
  deliverables?: string
): TierEndOutcome {
  return {
    status,
    reasonCode,
    nextAction,
    ...(deliverables !== undefined && deliverables !== '' && { deliverables }),
    ...(cascade !== undefined && { cascade }),
  };
}
