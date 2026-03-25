/**
 * Child id discovery for log / handoff / guide rollups (same edges as planning rollup).
 */

import { access } from 'fs/promises';
import { join } from 'path';
import type { DocumentManager } from './document-manager';
import { PROJECT_ROOT } from './utils';
import type { PlanningTier } from './planning-doc-paths';
import {
  extractDecompositionSection,
  LEAF_TIER_MARKER,
  parseTierDownBuildPlanPerItem,
} from './planning-decomposition';
import { deriveTierDownPlanItemsFromGuide } from '../tiers/shared/ensure-tier-down-docs';
import { compareDottedTierIds } from './across-ladder';
import { WorkflowId } from './id-utils';
import { readdir } from 'fs/promises';

export type RollupSiblingDocKind = 'log' | 'handoff' | 'guide';

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

function docSuffix(kind: RollupSiblingDocKind): string {
  return kind === 'log' ? '-log.md' : kind === 'handoff' ? '-handoff.md' : '-guide.md';
}

/** Project-relative path to child doc of given kind. */
export function resolveChildDocRelativePath(
  basePath: string,
  childTier: PlanningTier,
  childId: string,
  kind: RollupSiblingDocKind
): string {
  const suf = docSuffix(kind);
  if (childTier === 'task') {
    return `${basePath}/sessions/task-${childId}${suf}`;
  }
  if (childTier === 'session') {
    return `${basePath}/sessions/session-${childId}${suf}`;
  }
  return `${basePath}/phases/phase-${childId}${suf}`;
}

async function projectFileExists(rel: string): Promise<boolean> {
  try {
    await access(join(PROJECT_ROOT, rel));
    return true;
  } catch {
    return false;
  }
}

async function collectOrphanDocIds(
  basePath: string,
  tier: PlanningTier,
  rollupId: string,
  kind: RollupSiblingDocKind
): Promise<string[]> {
  const root = join(PROJECT_ROOT, basePath);
  const suf = docSuffix(kind);
  const sufRe = suf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const out: string[] = [];
  try {
    if (tier === 'session') {
      const dir = join(root, 'sessions');
      const entries = await readdir(dir, { withFileTypes: true });
      const re = new RegExp(`^task-(\\d+(?:\\.\\d+){3})${sufRe}$`);
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
      const re = new RegExp(`^session-(\\d+\\.\\d+\\.\\d+)${sufRe}$`);
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
      const re = new RegExp(`^phase-(\\d+\\.\\d+)${sufRe}$`);
      for (const e of entries) {
        if (!e.isFile()) continue;
        const m = e.name.match(re);
        if (!m) continue;
        out.push(m[1]);
      }
    }
  } catch {
    /* missing dir */
  }
  return [...new Set(out)];
}

export type DiscoverRollupChildrenResult =
  | { ok: true; childTier: PlanningTier; orderedIds: string[] }
  | { ok: false; skipReason: string };

/**
 * Ordered child ids for a log/handoff/guide rollup (mirror planning rollup policy).
 */
export async function discoverRollupChildIds(
  dm: DocumentManager,
  basePath: string,
  featureName: string,
  tier: PlanningTier,
  parentPlanningId: string,
  rollupId: string,
  kind: RollupSiblingDocKind
): Promise<DiscoverRollupChildrenResult> {
  if (tier === 'task') {
    return { ok: false, skipReason: 'task_tier_leaf' };
  }
  if (kind === 'guide' && tier === 'session') {
    return { ok: false, skipReason: 'session_guide_no_child_files' };
  }

  const cTier = childTierForRollup(tier);
  const pKind = parseKindForRollup(tier);
  if (!cTier || !pKind) {
    return { ok: false, skipReason: 'unsupported_tier' };
  }

  let parentPlanningContent: string;
  try {
    parentPlanningContent = await dm.readPlanningDoc(tier, parentPlanningId);
  } catch {
    return { ok: false, skipReason: 'parent_planning_missing' };
  }

  const decomposition = extractDecompositionSection(parentPlanningContent);
  if (LEAF_TIER_MARKER.test(decomposition)) {
    return { ok: false, skipReason: 'leaf_tier_no_children' };
  }

  const planningItems = parseTierDownBuildPlanPerItem(decomposition, pKind);
  const gTier = guideTierForRollup(tier);
  let guideContent = '';
  if (gTier) {
    try {
      if (gTier === 'feature') {
        guideContent = await dm.readGuide('feature');
      } else {
        guideContent = await dm.readGuide(gTier, parentPlanningId);
      }
    } catch {
      guideContent = '';
    }
  }
  const guideItems = gTier != null ? deriveTierDownPlanItemsFromGuide(guideContent, gTier) : [];

  const orphanIds = await collectOrphanDocIds(basePath, tier, rollupId, kind);
  const planningIdSet = new Set(planningItems.map(p => p.id));
  const guideIdSet = new Set(guideItems.map(g => g.id));

  async function childDocExists(childId: string): Promise<boolean> {
    const rel = resolveChildDocRelativePath(basePath, cTier, childId, kind);
    return projectFileExists(rel);
  }

  const orderedChildIds: string[] = [];
  const seen = new Set<string>();

  for (const gid of guideItems.map(g => g.id)) {
    if (seen.has(gid)) continue;
    if (await childDocExists(gid)) {
      orderedChildIds.push(gid);
      seen.add(gid);
    }
  }

  const planningSorted = [...planningItems.map(p => p.id)].sort(compareDottedTierIds);
  for (const pid of planningSorted) {
    if (seen.has(pid)) continue;
    if (await childDocExists(pid)) {
      orderedChildIds.push(pid);
      seen.add(pid);
    }
  }

  const orphanSorted = [...new Set(orphanIds)].sort(compareDottedTierIds);
  for (const oid of orphanSorted) {
    if (seen.has(oid)) continue;
    if (await childDocExists(oid)) {
      if (!planningIdSet.has(oid) && !guideIdSet.has(oid)) {
        console.warn(
          `[doc_rollup:${kind}] Including orphan ${cTier} ${oid} (not in guide or ## Decomposition).`
        );
      }
      orderedChildIds.push(oid);
      seen.add(oid);
    }
  }

  if (orderedChildIds.length === 0) {
    return { ok: false, skipReason: 'no_child_docs' };
  }

  return { ok: true, childTier: cTier, orderedIds: orderedChildIds };
}
