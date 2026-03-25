/**
 * Harness cutover telemetry: which tiers are flagged for kernel cutover in traces.
 * Defaults: no tier-specific cutover list; all tiers use the default harness path.
 */

import type { Tier } from './contracts';

export function getHarnessCutoverTiers(): Tier[] {
  return [];
}

export function isHarnessDefaultForTier(_tier: Tier): boolean {
  return true;
}
