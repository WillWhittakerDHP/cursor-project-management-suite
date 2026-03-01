/**
 * Backward-compatible adapters: existing start/end outcome types → charter TierOutcome.
 * Enables building HarnessRunResult from current impl outputs without changing impls.
 */

import type { TierOutcome, TierStatus } from './contracts';
import { parseReasonCode, isFailureReasonCode } from './reason-code';
import type { ControlPlaneOutcome } from '../tiers/shared/control-plane-types';
import type {
  TierStartOutcome,
  TierEndOutcome,
  TierStartStatus,
  TierEndStatus,
} from '../utils/tier-outcome';

function mapStartStatusToTierStatus(s: TierStartStatus): TierStatus {
  switch (s) {
    case 'completed': return 'completed';
    case 'plan': return 'plan_preview';
    case 'failed': return 'failed';
    case 'blocked': return 'blocked';
  }
}

function mapEndStatusToTierStatus(s: TierEndStatus): TierStatus {
  switch (s) {
    case 'completed': return 'completed';
    case 'blocked_needs_input': return 'needs_input';
    case 'blocked_fix_required': return 'blocked';
    case 'failed': return 'failed';
  }
}

/** Adapt ControlPlaneOutcome (reasonCode: string) to harness TierOutcome. */
export function adaptControlPlaneOutcomeToHarness(outcome: ControlPlaneOutcome): TierOutcome {
  const reasonCode = parseReasonCode(outcome.reasonCode);
  const status: TierStatus = isFailureReasonCode(reasonCode)
    ? 'failed'
    : reasonCode === 'plan_mode' || reasonCode === 'context_gathering'
    ? 'plan_preview'
    : 'completed';
  return {
    status,
    reasonCode,
    nextAction: outcome.nextAction,
    ...(outcome.deliverables !== undefined && outcome.deliverables !== '' && { deliverables: outcome.deliverables }),
    ...(outcome.cascade !== undefined && { cascade: { ...outcome.cascade, tier: outcome.cascade.tier } }),
  };
}

export function adaptTierStartOutcomeToHarness(outcome: TierStartOutcome): TierOutcome {
  return {
    status: mapStartStatusToTierStatus(outcome.status),
    reasonCode: parseReasonCode(outcome.reasonCode),
    nextAction: outcome.nextAction,
    ...(outcome.deliverables !== undefined && outcome.deliverables !== '' && { deliverables: outcome.deliverables }),
    ...(outcome.cascade !== undefined && { cascade: { ...outcome.cascade, tier: outcome.cascade.tier } }),
  };
}

export function adaptTierEndOutcomeToHarness(outcome: TierEndOutcome): TierOutcome {
  return {
    status: mapEndStatusToTierStatus(outcome.status),
    reasonCode: parseReasonCode(outcome.reasonCode),
    nextAction: outcome.nextAction,
    ...(outcome.deliverables !== undefined && outcome.deliverables !== '' && { deliverables: outcome.deliverables }),
    ...(outcome.cascade !== undefined && { cascade: { ...outcome.cascade, tier: outcome.cascade.tier } }),
  };
}
