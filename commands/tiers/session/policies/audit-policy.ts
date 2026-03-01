/**
 * Session-tier audit policy boundary.
 * Delegates to runStartAuditForTier / runEndAuditForTier; preserves step order and parity.
 */

import type { TierName } from '../../shared/types';
import { runStartAuditForTier } from '../../../audit/run-start-audit-for-tier';
import { runEndAuditForTier } from '../../../audit/run-end-audit-for-tier';
import type { AutofixResult } from '../../../audit/types';

export interface SessionAuditPolicyStartParams {
  tier: TierName;
  identifier: string;
  featureName?: string;
}

export interface SessionAuditPolicyEndParams {
  tier: TierName;
  identifier: string;
  params: unknown;
  featureName?: string;
}

export interface SessionAuditPolicyEndResult {
  output: string;
  autofixResult?: AutofixResult;
}

/** Session audit policy: start and end audit entry points. */
export const sessionAuditPolicy = {
  async runStart(params: SessionAuditPolicyStartParams): Promise<string> {
    return runStartAuditForTier(params);
  },

  async runEnd(params: SessionAuditPolicyEndParams): Promise<SessionAuditPolicyEndResult | string> {
    const result = await runEndAuditForTier(params);
    return typeof result === 'string' ? { output: result } : result;
  },
};
