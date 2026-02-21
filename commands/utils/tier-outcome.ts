/**
 * Shared outcome type for tier end commands (session-end, phase-end, feature-end, task-end).
 * Agents use status + reasonCode + nextAction to decide next step without inferring from step text.
 */

export type TierEndStatus =
  | 'completed'
  | 'blocked_needs_input'
  | 'blocked_fix_required'
  | 'failed';

export interface TierEndOutcome {
  status: TierEndStatus;
  reasonCode: string;
  nextAction: string;
}

export function buildTierEndOutcome(
  status: TierEndStatus,
  reasonCode: string,
  nextAction: string
): TierEndOutcome {
  return { status, reasonCode, nextAction };
}
