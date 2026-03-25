/**
 * Tier-end multi-doc rollup policy (guide / handoff / log) + Wave A exclusions.
 * See multi-doc rollup plan: agent discretion via profile and env.
 */

import type { PlanningTier } from './planning-doc-paths';

/** What non-planning doc rollups tier-end may run. Planning rollup remains separate (always when not express). */
export type DocRollupProfile = 'off' | 'planning_only' | 'all_non_guides' | 'all';

const VALID: ReadonlySet<DocRollupProfile> = new Set([
  'off',
  'planning_only',
  'all_non_guides',
  'all',
]);

function parseProfile(raw: string | undefined): DocRollupProfile | null {
  if (raw == null || raw === '') return null;
  const v = raw.trim().toLowerCase().replace(/-/g, '_') as DocRollupProfile;
  return VALID.has(v) ? v : null;
}

/**
 * Resolve doc rollup profile: params.options.docRollupProfile, then env HARNESS_DOC_ROLLUP, then default.
 * Default **Wave A:** `planning_only` (planning rollup stays separate; log/handoff/guide rollups off until widened).
 * Set `HARNESS_DOC_ROLLUP=all_non_guides` (or `all` for guide safe mode) when running multi-doc rollup in tier-end.
 */
export function resolveDocRollupProfile(options?: { docRollupProfile?: string } | null): DocRollupProfile {
  const fromOpts = parseProfile(options?.docRollupProfile);
  if (fromOpts != null) return fromOpts;
  const fromEnv =
    typeof process !== 'undefined' ? parseProfile(process.env.HARNESS_DOC_ROLLUP) : null;
  if (fromEnv != null) return fromEnv;
  return 'planning_only';
}

export function docRollupRunsLogHandoff(profile: DocRollupProfile): boolean {
  return profile === 'all_non_guides' || profile === 'all';
}

export function docRollupRunsGuideSafe(profile: DocRollupProfile): boolean {
  return profile === 'all';
}

/** Wave A: skip rollup parents under major 6 and skip feature-level rollups for appointment-workflow. */
export function shouldSkipDocRollupWaveA(params: {
  featureName: string;
  tier: PlanningTier;
  rollupId: string;
}): boolean {
  const { featureName, tier, rollupId } = params;
  if (tier === 'feature') {
    return featureName === 'appointment-workflow';
  }
  if (tier === 'session' || tier === 'phase') {
    return rollupId.startsWith('6.');
  }
  return false;
}
