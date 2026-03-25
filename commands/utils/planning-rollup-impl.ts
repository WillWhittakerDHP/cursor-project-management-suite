/**
 * Tier-end planning rollup: merge child planning docs into one canonical parent file + archive sources.
 * Invoked only from DocumentManager.rollupPlanningArtifacts (single harness entry).
 */

import { mkdir, readdir, rename } from 'fs/promises';
import { basename, join } from 'path';
import type { DocumentManager } from './document-manager';
import { MarkdownUtils } from './markdown-utils';
import { PROJECT_ROOT } from './utils';
import type { PlanningTier } from './planning-doc-paths';
import { resolvePlanningDocRelativePath } from './planning-doc-paths';
import {
  extractDecompositionSection,
  LEAF_TIER_MARKER,
  parseTierDownBuildPlanPerItem,
} from './planning-decomposition';
import { deriveTierDownPlanItemsFromGuide } from '../tiers/shared/ensure-tier-down-docs';
import { compareDottedTierIds } from './across-ladder';
import { WorkflowId } from './id-utils';
import { getPlanningDocPlaceholderSubstrings } from './project-manager-write-guard';
import type { ShouldBlockProjectManagerWriteOptions } from './project-manager-write-guard';

export interface RollupPlanningResult {
  changed: boolean;
  skipped?: boolean;
  skipReason?: string;
  path: string;
  archivedPaths: string[];
}

const ROLLUP_MARKER_PREFIX = '<!-- harness-planning-rollup';

const SECTION_TITLES = [
  'Epic',
  'Story',
  'Analysis',
  'Goal',
  'Files',
  'Approach',
  'Checkpoint',
  'Deliverables',
  'Acceptance Criteria',
  'Design',
] as const;

function buildRollupMarker(tier: PlanningTier, rollupId: string, consolidatedAt: string): string {
  return `${ROLLUP_MARKER_PREFIX} tier=${tier} id=${rollupId} consolidatedAt=${consolidatedAt} -->`;
}

function hasRollupMarker(content: string, tier: PlanningTier, rollupId: string): boolean {
  const esc = rollupId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `${ROLLUP_MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+tier=${tier}\\s+id=${esc}\\b`
  );
  return re.test(content);
}

function stripPlanningPlaceholders(text: string): string {
  let out = text;
  for (const p of getPlanningDocPlaceholderSubstrings()) {
    if (out.includes(p)) {
      out = out.split(p).join('');
    }
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function extractSectionBody(content: string, title: string, depth: number): string {
  const block = MarkdownUtils.extractSection(content, title, { depth });
  if (!block.trim()) return '';
  const lines = block.split('\n');
  if (lines[0]?.trim().startsWith('#')) {
    lines.shift();
  }
  return stripPlanningPlaceholders(lines.join('\n').trim());
}

function buildSectionBlock(
  content: string,
  titles: readonly string[],
  headingPrefix: '##' | '###',
  depth: number
): string {
  const parts: string[] = [];
  for (const title of titles) {
    const body = extractSectionBody(content, title, depth);
    if (!body || body.length < 3) continue;
    parts.push(`${headingPrefix} ${title}`, '', body, '');
  }
  return parts.join('\n').trimEnd();
}

function childTierForRollup(tier: PlanningTier): PlanningTier | null {
  if (tier === 'session') return 'task';
  if (tier === 'phase') return 'session';
  if (tier === 'feature') return 'phase';
  return null;
}

function guideTierForRollup(tier: PlanningTier): 'feature' | 'phase' | 'session' | null {
  if (tier === 'session') return 'session';
  if (tier === 'phase') return 'phase';
  if (tier === 'feature') return 'feature';
  return null;
}

function parseKindForRollup(tier: PlanningTier): 'phase' | 'session' | 'task' | null {
  if (tier === 'session') return 'task';
  if (tier === 'phase') return 'session';
  if (tier === 'feature') return 'phase';
  return null;
}

async function collectOrphanPlanningIds(
  basePath: string,
  tier: PlanningTier,
  rollupId: string
): Promise<string[]> {
  const root = join(PROJECT_ROOT, basePath);
  const out: string[] = [];
  try {
    if (tier === 'session') {
      const dir = join(root, 'sessions');
      const entries = await readdir(dir, { withFileTypes: true });
      const re = /^task-(\d+(?:\.\d+){3})-planning\.md$/;
      for (const e of entries) {
        if (!e.isFile()) continue;
        const m = e.name.match(re);
        if (!m) continue;
        const tid = m[1];
        const parsed = WorkflowId.parseTaskId(tid);
        if (parsed?.sessionId === rollupId) out.push(tid);
      }
    } else if (tier === 'phase') {
      const dir = join(root, 'sessions');
      const entries = await readdir(dir, { withFileTypes: true });
      const re = /^session-(\d+\.\d+\.\d+)-planning\.md$/;
      for (const e of entries) {
        if (!e.isFile()) continue;
        const m = e.name.match(re);
        if (!m) continue;
        const sid = m[1];
        const parsed = WorkflowId.parseSessionId(sid);
        if (parsed?.phaseId === rollupId) out.push(sid);
      }
    } else if (tier === 'feature') {
      const dir = join(root, 'phases');
      const entries = await readdir(dir, { withFileTypes: true });
      const re = /^phase-(\d+\.\d+)-planning\.md$/;
      for (const e of entries) {
        if (!e.isFile()) continue;
        const m = e.name.match(re);
        if (!m) continue;
        out.push(m[1]);
      }
    }
  } catch {
    // missing dir → no orphans
  }
  return [...new Set(out)];
}

function childHeadingLabel(childTier: PlanningTier, childId: string): string {
  if (childTier === 'task') return `Task ${childId}`;
  if (childTier === 'session') return `Session ${childId}`;
  return `Phase ${childId}`;
}

/**
 * Execute planning rollup using DocumentManager public API only.
 */
export async function executePlanningRollup(
  dm: DocumentManager,
  tier: PlanningTier,
  id: string,
  basePath: string,
  featureName: string
): Promise<RollupPlanningResult> {
  if (tier === 'task') {
    const path = dm.getPlanningDocRelativePath('task', id);
    return { changed: false, skipped: true, skipReason: 'task_tier_leaf', path, archivedPaths: [] };
  }

  if ((tier === 'session' || tier === 'phase') && !id.trim()) {
    throw new Error(`rollupPlanningArtifacts: ${tier} requires a non-empty id`);
  }
  const rollupId = tier === 'feature' ? featureName : id;
  const parentPlanningId = tier === 'feature' ? '' : id;
  const canonicalPath = dm.getPlanningDocRelativePath(tier, parentPlanningId);

  const cTier = childTierForRollup(tier);
  const pKind = parseKindForRollup(tier);
  if (!cTier || !pKind) {
    return { changed: false, skipped: true, skipReason: 'unsupported_tier', path: canonicalPath, archivedPaths: [] };
  }

  let parentContent: string;
  try {
    parentContent = await dm.readPlanningDoc(tier, parentPlanningId);
  } catch {
    return {
      changed: false,
      skipped: true,
      skipReason: 'parent_planning_missing',
      path: canonicalPath,
      archivedPaths: [],
    };
  }

  if (hasRollupMarker(parentContent, tier, rollupId)) {
    const orphanIds = await collectOrphanPlanningIds(basePath, tier, rollupId);
    const anyChild = await Promise.all(
      orphanIds.map(async oid => dm.planningDocExists(cTier, oid))
    );
    if (!anyChild.some(Boolean)) {
      return {
        changed: false,
        skipped: true,
        skipReason: 'already_rolled_up',
        path: canonicalPath,
        archivedPaths: [],
      };
    }
  }

  const decomposition = extractDecompositionSection(parentContent);
  if (LEAF_TIER_MARKER.test(decomposition)) {
    return {
      changed: false,
      skipped: true,
      skipReason: 'leaf_tier_no_children',
      path: canonicalPath,
      archivedPaths: [],
    };
  }

  const planningItems = parseTierDownBuildPlanPerItem(decomposition, pKind);

  let guideContent = '';
  const gTier = guideTierForRollup(tier);
  if (gTier) {
    try {
      if (gTier === 'feature') {
        guideContent = await dm.readGuide('feature');
      } else {
        guideContent = await dm.readGuide(gTier, id);
      }
    } catch {
      guideContent = '';
    }
  }

  const guideItems =
    gTier != null ? deriveTierDownPlanItemsFromGuide(guideContent, gTier) : [];

  const orphanIds = await collectOrphanPlanningIds(basePath, tier, rollupId);
  const planningIdSet = new Set(planningItems.map(p => p.id));
  const guideIdSet = new Set(guideItems.map(g => g.id));

  async function childExists(childId: string): Promise<boolean> {
    return dm.planningDocExists(cTier, childId);
  }

  const orderedChildIds: string[] = [];
  const seen = new Set<string>();

  for (const gid of guideItems.map(g => g.id)) {
    if (seen.has(gid)) continue;
    if (await childExists(gid)) {
      orderedChildIds.push(gid);
      seen.add(gid);
    }
  }

  const planningSorted = [...planningItems.map(p => p.id)].sort(compareDottedTierIds);
  for (const pid of planningSorted) {
    if (seen.has(pid)) continue;
    if (await childExists(pid)) {
      orderedChildIds.push(pid);
      seen.add(pid);
    }
  }

  const orphanSorted = [...new Set(orphanIds)].sort(compareDottedTierIds);
  for (const oid of orphanSorted) {
    if (seen.has(oid)) continue;
    if (await childExists(oid)) {
      if (!planningIdSet.has(oid) && !guideIdSet.has(oid)) {
        console.warn(
          `[planning_rollup] Including orphan ${cTier} planning doc ${oid} (not listed in guide or ## Decomposition).`
        );
      }
      orderedChildIds.push(oid);
      seen.add(oid);
    }
  }

  if (orderedChildIds.length === 0) {
    return {
      changed: false,
      skipped: true,
      skipReason: 'no_child_planning_docs',
      path: canonicalPath,
      archivedPaths: [],
    };
  }

  const childSources: Array<{ id: string; relPath: string; content: string }> = [];
  for (const cid of orderedChildIds) {
    const rel = resolvePlanningDocRelativePath(basePath, cTier, cid);
    try {
      const content = await dm.readPlanningDoc(cTier, cid);
      childSources.push({ id: cid, relPath: rel, content });
    } catch {
      // skip missing
    }
  }

  if (childSources.length === 0) {
    return {
      changed: false,
      skipped: true,
      skipReason: 'no_readable_child_docs',
      path: canonicalPath,
      archivedPaths: [],
    };
  }

  const consolidatedAt = new Date().toISOString();
  const marker = buildRollupMarker(tier, rollupId, consolidatedAt);

  const parentLabel =
    tier === 'session'
      ? `Session ${id} (parent)`
      : tier === 'phase'
        ? `Phase ${id} (parent)`
        : `Feature ${featureName} (parent)`;

  const parentBody = buildSectionBlock(parentContent, SECTION_TITLES, '##', 2);
  const titleLine =
    tier === 'feature'
      ? `# Consolidated planning: feature ${featureName}`
      : `# Consolidated planning: ${tier} ${id}`;

  const mergedParts: string[] = [
    marker,
    '',
    titleLine,
    '',
    `## ${parentLabel}`,
    '',
    parentBody,
    '',
    '---',
    '',
  ];

  for (const ch of childSources) {
    const fname = basename(ch.relPath);
    const label = childHeadingLabel(cTier, ch.id);
    const childBlock = buildSectionBlock(ch.content, SECTION_TITLES, '###', 2);
    if (!childBlock) continue;
    mergedParts.push(`## ${label} (source: ${fname})`, '', childBlock, '', '---', '');
  }

  const merged = mergedParts.join('\n').trimEnd() + '\n';

  const tsFolder = consolidatedAt.replace(/[:.]/g, '-');
  const archiveAbs = join(
    PROJECT_ROOT,
    basePath,
    'planning-archive',
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
      throw new Error(`planning_rollup: failed to archive ${rel}: ${msg}`);
    }
  }

  const writeOpts: ShouldBlockProjectManagerWriteOptions = { overwriteForTierEnd: true };
  const written = await dm.writePlanningDoc(tier, parentPlanningId, merged, writeOpts);
  if (!written) {
    throw new Error(`planning_rollup: write blocked for ${canonicalPath}`);
  }

  return { changed: true, path: canonicalPath, archivedPaths: archivedRel };
}
