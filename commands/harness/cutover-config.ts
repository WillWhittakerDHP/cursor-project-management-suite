/**
 * Progressive cutover config: which tiers use the harness as default runtime.
 * Order (per plan): session → phase → feature → task.
 * Go/No-Go gates per tier: replay structural equivalence, decision routing correctness,
 * trace completeness, context-budget compliance.
 *
 * When a tier is in the cutover list, the dispatcher may use the harness path.
 * Until HarnessKernel.run() is implemented, cutover tiers still run the current workflow
 * (shadow mode remains); the flag is for telemetry and future switch.
 *
 * --- Verifying telemetry with HARNESS_CUTOVER_TIERS=session ---
 * 1. Set env: HARNESS_CUTOVER_TIERS=session
 * 2. Run any session-start or session-end (e.g. /session-start 6.3.1 or /session-end 6.3.1)
 * 3. Inspect the shadow trace: getDefaultShadowRecorder().getTrace(traceId) will have
 *    harnessCutoverTier: true for that run. Other tiers (feature, phase, task) will have
 *    harnessCutoverTier: false or undefined.
 * 4. When HarnessKernel.run() is implemented, branch in tier-start/tier-end on
 *    isHarnessDefaultForTier(config.name) to call the kernel instead of the current impl.
 */

import type { Tier } from './contracts';

/** Tiers that have passed Go/No-Go and use harness as default. Empty = no cutover yet. */
const CUTOVER_TIERS: Tier[] = [];

/** Set via env HARNESS_CUTOVER_TIERS (comma-separated, e.g. session,phase) for testing. */
function getCutoverTiersFromEnv(): Tier[] {
  const raw = typeof process !== 'undefined' && process.env?.HARNESS_CUTOVER_TIERS;
  if (!raw?.trim()) return [];
  const list = raw.split(',').map((s) => s.trim().toLowerCase());
  const allowed: Tier[] = ['feature', 'phase', 'session', 'task'];
  return list.filter((t): t is Tier => allowed.includes(t));
}

/**
 * Tiers for which the harness is the default runtime (cutover complete).
 * Default: [] (no cutover). Override with HARNESS_CUTOVER_TIERS env for testing.
 */
export function getHarnessCutoverTiers(): Tier[] {
  const fromEnv = getCutoverTiersFromEnv();
  return fromEnv.length > 0 ? fromEnv : CUTOVER_TIERS;
}

/** True when the given tier has been cut over to the harness as default. */
export function isHarnessDefaultForTier(tier: Tier): boolean {
  return getHarnessCutoverTiers().includes(tier);
}
