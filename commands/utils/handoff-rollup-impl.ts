/**
 * Tier-end handoff rollup: merge child handoff excerpts into parent + archive sources.
 * Preserves top-level ## sections required by verifyHandoff; child excerpts use #### + bold labels only.
 */

import { mkdir, rename } from 'fs/promises';
import { basename, join } from 'path';
import type { DocumentManager } from './document-manager';
import { MarkdownUtils } from './markdown-utils';
import { PROJECT_ROOT } from './utils';
import type { PlanningTier } from './planning-doc-paths';
import { discoverRollupChildIds, resolveChildDocRelativePath } from './doc-rollup-discovery';
import type { HandoffTier } from './document-manager';
import { shouldSkipDocRollupWaveA } from './doc-rollup-policy';

export interface RollupHandoffResult {
  changed: boolean;
  skipped?: boolean;
  skipReason?: string;
  path: string;
  archivedPaths: string[];
}

const MARKER_PREFIX = '<!-- harness-handoff-rollup';

function buildMarker(tier: PlanningTier, rollupId: string, consolidatedAt: string): string {
  return `${MARKER_PREFIX} tier=${tier} id=${rollupId} consolidatedAt=${consolidatedAt} -->`;
}

function hasHandoffMarker(content: string, tier: PlanningTier, rollupId: string): boolean {
  const esc = rollupId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `${MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+tier=${tier}\\s+id=${esc}\\b`
  );
  return re.test(content);
}

function extractAtDepth(content: string, title: string): string {
  const body = MarkdownUtils.extractSection(content, title, { depth: 2 });
  if (!body.trim()) return '';
  const lines = body.split('\n');
  if (lines[0]?.trim().startsWith('#')) {
    lines.shift();
  }
  return lines.join('\n').trim();
}

function padSection(text: string, minLen: number, filler: string): string {
  const t = text.trim();
  if (t.length >= minLen) return t;
  return `${t}\n\n${filler}`.trim();
}

function handoffTierForPlanningTier(tier: PlanningTier): HandoffTier | null {
  if (tier === 'feature' || tier === 'phase' || tier === 'session') return tier;
  return null;
}

function childHandoffLabel(childTier: PlanningTier, childId: string): string {
  if (childTier === 'task') return `Task ${childId}`;
  if (childTier === 'session') return `Session ${childId}`;
  return `Phase ${childId}`;
}

async function anyChildHandoffOnDisk(
  basePath: string,
  childTier: PlanningTier,
  ids: string[]
): Promise<boolean> {
  const { access } = await import('fs/promises');
  for (const cid of ids) {
    const rel = resolveChildDocRelativePath(basePath, childTier, cid, 'handoff');
    try {
      await access(join(PROJECT_ROOT, rel));
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

export async function executeHandoffRollup(
  dm: DocumentManager,
  tier: PlanningTier,
  id: string,
  basePath: string,
  featureName: string
): Promise<RollupHandoffResult> {
  if (tier === 'task') {
    return {
      changed: false,
      skipped: true,
      skipReason: 'task_tier_leaf',
      path: `${basePath}/sessions/task-${id}-handoff.md`,
      archivedPaths: [],
    };
  }

  if ((tier === 'session' || tier === 'phase') && !id.trim()) {
    throw new Error(`rollupHandoffArtifacts: ${tier} requires a non-empty id`);
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
    const ht = handoffTierForPlanningTier(tier)!;
    const path = dm.getHandoffRelativePath(ht, tier === 'feature' ? undefined : id);
    return { changed: false, skipped: true, skipReason: 'wave_a_excluded', path, archivedPaths: [] };
  }

  const ht = handoffTierForPlanningTier(tier)!;
  const canonicalPath = dm.getHandoffRelativePath(ht, tier === 'feature' ? undefined : id);

  let parentHandoff: string;
  try {
    parentHandoff = await dm.readHandoff(ht, tier === 'feature' ? undefined : id);
  } catch {
    return {
      changed: false,
      skipped: true,
      skipReason: 'parent_handoff_missing',
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
    'handoff'
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

  if (hasHandoffMarker(parentHandoff, tier, rollupId)) {
    const stillThere = await anyChildHandoffOnDisk(basePath, discovered.childTier, discovered.orderedIds);
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
    const rel = resolveChildDocRelativePath(basePath, discovered.childTier, cid, 'handoff');
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
      skipReason: 'no_readable_child_handoffs',
      path: canonicalPath,
      archivedPaths: [],
    };
  }

  const consolidatedAt = new Date().toISOString();
  const marker = buildMarker(tier, rollupId, consolidatedAt);

  const parentStatus = extractAtDepth(parentHandoff, 'Current Status');
  const parentNext = extractAtDepth(parentHandoff, 'Next Action');
  const parentTrans = extractAtDepth(parentHandoff, 'Transition Context');

  const filler =
    'Consolidated by harness handoff rollup. Review archived child handoffs under doc-archive if needed.';

  const statusBody = padSection(
    parentStatus || 'Parent handoff consolidated with child excerpts below.',
    30,
    filler
  );
  const nextBody = padSection(
    parentNext ||
      'Continue from Transition Context and child excerpts; see planning doc and guides for active work.',
    30,
    filler
  );
  const transBody = padSection(parentTrans || 'See child handoff excerpts below for per-unit context.', 30, filler);

  const excerptParts: string[] = [
    '',
    '---',
    '',
    '## Child handoff excerpts (sources archived)',
    '',
    'Per-child **Transition Context** and **Current Status** excerpts (no duplicate top-level handoff sections).',
    '',
  ];

  for (const ch of childSources) {
    const fname = basename(ch.relPath);
    const ct = extractAtDepth(ch.content, 'Transition Context');
    const cs = extractAtDepth(ch.content, 'Current Status');
    excerptParts.push(
      `#### ${childHandoffLabel(discovered.childTier, ch.id)} (\`${fname}\`)`,
      '',
      `**Transition Context (excerpt):** ${ct || '_(empty)_'}`,
      '',
      `**Current Status (excerpt):** ${cs || '_(empty)_'}`,
      ''
    );
  }

  const merged = [
    marker,
    '',
    '## Current Status',
    '',
    statusBody,
    '',
    '## Next Action',
    '',
    nextBody,
    '',
    '## Transition Context',
    '',
    transBody,
    ...excerptParts,
  ]
    .join('\n')
    .trimEnd() + '\n';

  const tsFolder = consolidatedAt.replace(/[:.]/g, '-');
  const archiveAbs = join(
    PROJECT_ROOT,
    basePath,
    'doc-archive',
    'handoff',
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
      throw new Error(`handoff_rollup: failed to archive ${rel}: ${msg}`);
    }
  }

  await dm.writeHandoff(ht, tier === 'feature' ? undefined : id, merged);

  return { changed: true, path: canonicalPath, archivedPaths: archivedRel };
}
