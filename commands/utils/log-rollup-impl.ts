/**
 * Tier-end log rollup: merge child log files into parent log + archive sources.
 */

import { mkdir, rename } from 'fs/promises';
import { basename, join } from 'path';
import type { DocumentManager } from './document-manager';
import { normalizeSessionLogMarkdown } from './session-log-markdown';
import { PROJECT_ROOT } from './utils';
import type { PlanningTier } from './planning-doc-paths';
import { discoverRollupChildIds, resolveChildDocRelativePath } from './doc-rollup-discovery';
import type { ShouldBlockProjectManagerWriteOptions } from './project-manager-write-guard';
import { shouldSkipDocRollupWaveA } from './doc-rollup-policy';

export interface RollupLogResult {
  changed: boolean;
  skipped?: boolean;
  skipReason?: string;
  path: string;
  archivedPaths: string[];
}

const MARKER_PREFIX = '<!-- harness-log-rollup';

function buildMarker(tier: PlanningTier, rollupId: string, consolidatedAt: string): string {
  return `${MARKER_PREFIX} tier=${tier} id=${rollupId} consolidatedAt=${consolidatedAt} -->`;
}

function hasLogMarker(content: string, tier: PlanningTier, rollupId: string): boolean {
  const esc = rollupId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `${MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+tier=${tier}\\s+id=${esc}\\b`
  );
  return re.test(content);
}

function childLogLabel(childTier: PlanningTier, childId: string): string {
  if (childTier === 'task') return `Task ${childId}`;
  if (childTier === 'session') return `Session ${childId}`;
  return `Phase ${childId}`;
}

async function anyChildLogOnDisk(
  basePath: string,
  childTier: PlanningTier,
  ids: string[]
): Promise<boolean> {
  for (const id of ids) {
    const rel = resolveChildDocRelativePath(basePath, childTier, id, 'log');
    try {
      await import('fs/promises').then(({ access }) => access(join(PROJECT_ROOT, rel)));
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

/**
 * Execute log rollup (DocumentManager is the only harness entry; called from rollupLogArtifacts).
 */
export async function executeLogRollup(
  dm: DocumentManager,
  tier: PlanningTier,
  id: string,
  basePath: string,
  featureName: string
): Promise<RollupLogResult> {
  if (tier === 'task') {
    return {
      changed: false,
      skipped: true,
      skipReason: 'task_tier_leaf',
      path: `${basePath}/sessions/task-${id}-log.md`,
      archivedPaths: [],
    };
  }

  if ((tier === 'session' || tier === 'phase') && !id.trim()) {
    throw new Error(`rollupLogArtifacts: ${tier} requires a non-empty id`);
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
    const path = dm.getLogRelativePath(
      tier === 'feature' ? 'feature' : tier === 'phase' ? 'phase' : 'session',
      tier === 'feature' ? undefined : id
    );
    return { changed: false, skipped: true, skipReason: 'wave_a_excluded', path, archivedPaths: [] };
  }

  const docTier = tier === 'feature' ? 'feature' : tier === 'phase' ? 'phase' : 'session';
  const canonicalPath = dm.getLogRelativePath(docTier, tier === 'feature' ? undefined : id);

  let parentLog: string;
  try {
    parentLog = await dm.readLog(docTier, tier === 'feature' ? undefined : id);
  } catch {
    return {
      changed: false,
      skipped: true,
      skipReason: 'parent_log_missing',
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
    'log'
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

  if (hasLogMarker(parentLog, tier, rollupId)) {
    const stillThere = await anyChildLogOnDisk(basePath, discovered.childTier, discovered.orderedIds);
    if (!stillThere) {
      return {
        changed: false,
        skipped: true,
        skipReason: 'already_rolled_up',
        path: canonicalPath,
        archivedPaths: [],
      };
    }
  }

  const childSources: Array<{ id: string; relPath: string; content: string }> = [];
  for (const cid of discovered.orderedIds) {
    const rel = resolveChildDocRelativePath(basePath, discovered.childTier, cid, 'log');
    try {
      const content = await dm.readRelativeProjectFile(rel);
      childSources.push({ id: cid, relPath: rel, content });
    } catch {
      /* skip */
    }
  }

  if (childSources.length === 0) {
    return {
      changed: false,
      skipped: true,
      skipReason: 'no_readable_child_logs',
      path: canonicalPath,
      archivedPaths: [],
    };
  }

  const consolidatedAt = new Date().toISOString();
  const marker = buildMarker(tier, rollupId, consolidatedAt);
  const title =
    tier === 'feature'
      ? `# Consolidated log: feature ${featureName}`
      : `# Consolidated log: ${tier} ${id}`;

  const parts: string[] = [
    marker,
    '',
    title,
    '',
    '## Parent log (pre-merge body)',
    '',
    parentLog.trim(),
    '',
    '---',
    '',
    '## Rolled up child logs',
    '',
  ];

  for (const ch of childSources) {
    const fname = basename(ch.relPath);
    parts.push(`### ${childLogLabel(discovered.childTier, ch.id)} (source: ${fname})`, '', ch.content.trim(), '', '---', '');
  }

  let merged = parts.join('\n').trimEnd() + '\n';
  merged = normalizeSessionLogMarkdown(merged);

  const tsFolder = consolidatedAt.replace(/[:.]/g, '-');
  const archiveAbs = join(
    PROJECT_ROOT,
    basePath,
    'doc-archive',
    'log',
    tier,
    rollupId.replace(/[^\w.-]/g, '_'),
    tsFolder
  );
  await mkdir(archiveAbs, { recursive: true });

  const archivedRel: string[] = [];
  const toMove: string[] = [canonicalPath, ...childSources.map(c => c.relPath)];

  for (const rel of toMove) {
    const fromAbs = join(PROJECT_ROOT, rel);
    const destAbs = join(archiveAbs, basename(rel));
    try {
      await rename(fromAbs, destAbs);
      archivedRel.push(rel);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`log_rollup: failed to archive ${rel}: ${msg}`);
    }
  }

  const writeOpts: ShouldBlockProjectManagerWriteOptions = {};
  const written = await dm.writeTierLogReplace(docTier, tier === 'feature' ? undefined : id, merged, writeOpts);
  if (!written) {
    throw new Error(`log_rollup: write blocked for ${canonicalPath}`);
  }

  return { changed: true, path: canonicalPath, archivedPaths: archivedRel };
}
