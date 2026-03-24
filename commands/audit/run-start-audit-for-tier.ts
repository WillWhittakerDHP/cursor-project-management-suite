/**
 * Policy entry point for session-tier start audit wiring.
 * Tier-start fires audits asynchronously via `background-audit-runner` (see stepStartAudit); this module
 * exists so `sessionAuditPolicy.runStart` resolves without a missing import.
 */

import type { TierName } from '../tiers/shared/types';

export interface RunStartAuditForTierParams {
  tier: TierName;
  identifier: string;
  featureName?: string;
}

/**
 * No-op: start audits are background-only. Returns a short trace string for logs.
 */
export async function runStartAuditForTier(params: RunStartAuditForTierParams): Promise<string> {
  return `[audit] start hook: tier=${params.tier} id=${params.identifier} — background runner owns start audits`;
}
