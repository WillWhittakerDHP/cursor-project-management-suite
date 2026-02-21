/**
 * Tier config for feature (name).
 * Used by tier-start, tier-end; feature-change uses different flow (rename/pivot).
 */

import type { TierConfig } from '../shared/types';

/** Feature "parse" just validates non-empty name. */
function parseFeatureId(id: string): string | null {
  const t = id.trim();
  return t === '' ? null : t;
}

export const FEATURE_CONFIG: TierConfig = {
  name: 'feature',
  idFormat: 'name',
  parseId: parseFeatureId,
  paths: {
    guide: (ctx, _id) => ctx.paths.getFeatureGuidePath(),
    log: (ctx, _id) => ctx.paths.getFeatureLogPath(),
    handoff: (ctx, _id) => ctx.paths.getFeatureHandoffPath(),
  },
  updateLog: async () => {
    // Feature change uses its own log update (feature log section); not used by runTierChange
  },
  replanCommand: undefined,
};
