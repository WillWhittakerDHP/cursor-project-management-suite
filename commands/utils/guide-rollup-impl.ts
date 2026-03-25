/**
 * Tier-end guide rollup (safe mode): archive child guides; append stub section on parent (no full merge).
 */

import { mkdir, rename } from 'fs/promises';
import { basename, join } from 'path';
import type { DocumentManager } from './document-manager';
import { PROJECT_ROOT } from './utils';
import type { PlanningTier } from './planning-doc-paths';
import { discoverRollupChildIds, resolveChildDocRelativePath } from './doc-rollup-discovery';
import type { DocumentTier } from './document-manager';
import type { ShouldBlockProjectManagerWriteOptions } from './project-manager-write-guard';
import { shouldSkipDocRollupWaveA } from './doc-rollup-policy';
import { ensureGuideHasRequiredSections } from '../tiers/shared/guide-required-sections';
import type { GuideTier } from '../tiers/shared/guide-required-sections';

export interface RollupGuideResult {
  changed: boolean;
  skipped?: boolean;
  skipReason?: string;
  path: string;
  archivedPaths: string[];
}

const MARKER_PREFIX = '<!-- harness-guide-rollup';

function buildMarker(tier: PlanningTier, rollupId: string, consolidatedAt: string): string {
  return `${MARKER_PREFIX} tier=${tier} id=${rollupId} consolidatedAt=${consolidatedAt} -->`;
}

function hasGuideMarker(content: string, tier: PlanningTier, rollupId: string): boolean {
  const esc = rollupId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `${MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+tier=${tier}\\s+id=${esc}\\b`
  );
  return re.test(content);
}

function docTierForPlanningTier(tier: PlanningTier): DocumentTier | null {
  if (tier === 'feature' || tier === 'phase' || tier === 'session') return tier;
  return null;
}

export async function executeGuideRollup(
  dm: DocumentManager,
  tier: PlanningTier,
  id: string,
  basePath: string,
  featureName: string
): Promise<RollupGuideResult> {
  if (tier === 'task') {
    const parts = id.split('.');
    const sid = parts.length >= 3 ? parts.slice(0, 3).join('.') : id;
    return {
      changed: false,
      skipped: true,
      skipReason: 'task_tier_leaf',
      path: dm.getGuideRelativePath('session', sid),
      archivedPaths: [],
    };
  }

  if (tier === 'session') {
    return {
      changed: false,
      skipped: true,
      skipReason: 'session_guide_no_child_files',
      path: dm.getGuideRelativePath('session', id),
      archivedPaths: [],
    };
  }

  if ((tier === 'session' || tier === 'phase') && !id.trim()) {
    throw new Error(`rollupGuideArtifacts: ${tier} requires a non-empty id`);
  }

  const rollupId = tier === 'feature' ? featureName : id;
  const parentPlanningId = tier === 'feature' ? '' : id;

  if (
    shouldSkipDocRollupWaveA({
      featureName,
      tier,
      rollupId: tier === 'feature' ? featureName : id,
    })
  ) {
    const dt = docTierForPlanningTier(tier)!;
    const path = dm.getGuideRelativePath(dt, tier === 'feature' ? undefined : id);
    return { changed: false, skipped: true, skipReason: 'wave_a_excluded', path, archivedPaths: [] };
  }

  const dt = docTierForPlanningTier(tier)!;
  const canonicalPath = dm.getGuideRelativePath(dt, tier === 'feature' ? undefined : id);

  let parentGuide: string;
  try {
    parentGuide = await dm.readGuide(dt, tier === 'feature' ? undefined : id);
  } catch {
    return {
      changed: false,
      skipped: true,
      skipReason: 'parent_guide_missing',
      path: canonicalPath,
      archivedPaths: [],
    };
  }

  const discovered = await discoverRollupChildIds(
    dm,
    basePath,
    featureName,
    tier,
    parentPlanningId,
    rollupId,
    'guide'
  );
  if (!discovered.ok) {
    return {
      changed: false,
      skipped: true,
      skipReason: discovered.skipReason,
      path: canonicalPath,
      archivedPaths: [],
    };
  }

  const childRelPaths: string[] = discovered.orderedIds.map(cid =>
    resolveChildDocRelativePath(basePath, discovered.childTier, cid, 'guide')
  );

  if (hasGuideMarker(parentGuide, tier, rollupId)) {
    let anyChild = false;
    for (const rel of childRelPaths) {
      try {
        await dm.readRelativeProjectFile(rel);
        anyChild = true;
        break;
      } catch {
        continue;
      }
    }
    if (!anyChild) {
      return {
        changed: false,
        skipped: true,
        skipReason: 'already_rolled_up',
        path: canonicalPath,
        archivedPaths: [],
      };
    }
  }

  const toArchive: string[] = [];
  for (const rel of childRelPaths) {
    try {
      await dm.readRelativeProjectFile(rel);
      toArchive.push(rel);
    } catch {
      continue;
    }
  }

  if (toArchive.length === 0) {
    return {
      changed: false,
      skipped: true,
      skipReason: 'no_readable_child_guides',
      path: canonicalPath,
      archivedPaths: [],
    };
  }

  const consolidatedAt = new Date().toISOString();
  const marker = buildMarker(tier, rollupId, consolidatedAt);
  const tsFolder = consolidatedAt.replace(/[:.]/g, '-');
  const archiveAbs = join(
    PROJECT_ROOT,
    basePath,
    'doc-archive',
    'guide',
    tier,
    rollupId.replace(/[^\w.-]/g, '_'),
    tsFolder
  );
  await mkdir(archiveAbs, { recursive: true });

  const archivedRel: string[] = [];
  for (const rel of toArchive) {
    const fromAbs = join(PROJECT_ROOT, rel);
    const destAbs = join(archiveAbs, basename(rel));
    try {
      await rename(fromAbs, destAbs);
      archivedRel.push(rel);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`guide_rollup: failed to archive ${rel}: ${msg}`);
    }
  }

  const listLines = archivedRel.map(r => `- \`${r}\``).join('\n');
  const stub = [
    '## Guide doc rollup (harness)',
    '',
    `Child guides were archived at **${consolidatedAt}** (safe rollup — no automatic merge of tierDown blocks).`,
    '',
    listLines,
    '',
  ].join('\n');

  let merged = [marker, '', parentGuide.trim(), '', stub].join('\n').trimEnd() + '\n';
  const ensureId = tier === 'feature' ? featureName : id;
  merged = ensureGuideHasRequiredSections(merged, tier as GuideTier, ensureId, featureName);

  const writeOpts: ShouldBlockProjectManagerWriteOptions = { overwriteForTierEnd: true };
  await dm.writeGuide(dt, tier === 'feature' ? undefined : id, merged, writeOpts);

  return { changed: true, path: canonicalPath, archivedPaths: archivedRel };
}
