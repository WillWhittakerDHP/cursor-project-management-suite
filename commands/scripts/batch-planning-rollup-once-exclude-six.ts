/**
 * ONE-OFF batch: run tier-end doc rollups (`DocumentManager.rollup*Artifacts`) across features.
 *
 * Wave A exclusions (built into rollup impls + feature skip below):
 * - Parents with session/phase ids starting with `6.`
 * - All rollups for feature `appointment-workflow`
 *
 * Usage (repo root):
 *   npx tsx .cursor/commands/scripts/batch-planning-rollup-once-exclude-six.ts --dry-run
 *   npx tsx .cursor/commands/scripts/batch-planning-rollup-once-exclude-six.ts --kinds=planning,log,handoff
 *   npx tsx .cursor/commands/scripts/batch-planning-rollup-once-exclude-six.ts --feature=google-apis-integration --kinds=log,handoff
 *   npx tsx ... --kinds=guide --i-understand-guides   # required when guide is included (mutates guides)
 *
 * Delete after use.
 */

import { access, constants, readdir } from 'fs/promises';
import { join } from 'path';
import { FileCache } from '../utils/file-cache';
import { WorkflowCommandContext } from '../utils/command-context';
import { PROJECT_ROOT } from '../utils/utils';
import { compareDottedTierIds } from '../utils/across-ladder';
import type { PlanningTier } from '../utils/planning-doc-paths';

const FEATURES_ROOT = join(PROJECT_ROOT, '.project-manager/features');

type DocKind = 'planning' | 'log' | 'handoff' | 'guide';

function isExcludedSixFamilyId(id: string): boolean {
  return id.startsWith('6.');
}

const SKIP_FEATURE_LEVEL = new Set<string>(['appointment-workflow']);

function parseSuffix(kind: DocKind): string {
  if (kind === 'planning') return '-planning.md';
  if (kind === 'log') return '-log.md';
  if (kind === 'handoff') return '-handoff.md';
  return '-guide.md';
}

async function pathExists(abs: string): Promise<boolean> {
  try {
    await access(abs, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function listSessionIdsForKind(featureDir: string, kind: DocKind): Promise<string[]> {
  const dir = join(featureDir, 'sessions');
  const suf = parseSuffix(kind).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^session-(\\d+\\.\\d+\\.\\d+)${suf}$`);
  const out: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const m = e.name.match(re);
      if (m) out.push(m[1]);
    }
  } catch {
    /* no sessions */
  }
  return out;
}

async function listPhaseIdsForKind(featureDir: string, kind: DocKind): Promise<string[]> {
  const dir = join(featureDir, 'phases');
  const suf = parseSuffix(kind).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^phase-(\\d+\\.\\d+)${suf}$`);
  const out: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const m = e.name.match(re);
      if (m) out.push(m[1]);
    }
  } catch {
    /* no phases */
  }
  return out;
}

async function listFeatureDirNames(): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(FEATURES_ROOT, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) out.push(e.name);
  }
  return out.sort();
}

function parseCli(): {
  dryRun: boolean;
  kinds: Set<DocKind>;
  featureFilter: string | null;
  guideAck: boolean;
} {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const guideAck = argv.includes('--i-understand-guides');
  let featureFilter: string | null = null;
  const kinds = new Set<DocKind>(['planning', 'log', 'handoff']);
  for (const a of argv) {
    if (a.startsWith('--feature=')) {
      featureFilter = a.slice('--feature='.length).trim();
    }
    if (a.startsWith('--kinds=')) {
      kinds.clear();
      for (const p of a.slice('--kinds='.length).split(',')) {
        const k = p.trim() as DocKind;
        if (k === 'planning' || k === 'log' || k === 'handoff' || k === 'guide') kinds.add(k);
      }
    }
  }
  return { dryRun, kinds, featureFilter, guideAck };
}

async function runOne(
  featureName: string,
  kind: DocKind,
  tier: 'session' | 'phase' | 'feature',
  id: string,
  dryRun: boolean
): Promise<void> {
  const label = `${featureName} ${kind} ${tier}${tier === 'feature' ? '' : ` ${id}`}`;
  if (dryRun) {
    console.log(`[dry-run] would rollup: ${label}`);
    return;
  }
  const cache = new FileCache(0);
  const ctx = new WorkflowCommandContext(featureName, cache);
  const dm = ctx.documents;
  const t = tier as PlanningTier;
  const planningId = tier === 'feature' ? '' : id;

  let result: { skipped?: boolean; skipReason?: string; changed: boolean; path: string; archivedPaths: string[] };
  switch (kind) {
    case 'planning':
      result = await dm.rollupPlanningArtifacts(t, planningId);
      break;
    case 'log':
      result = await dm.rollupLogArtifacts(t, planningId);
      break;
    case 'handoff':
      result = await dm.rollupHandoffArtifacts(t, planningId);
      break;
    case 'guide':
      result = await dm.rollupGuideArtifacts(t, planningId);
      break;
    default:
      return;
  }

  const summary = result.skipped
    ? `skipped (${result.skipReason ?? 'unknown'})`
    : result.changed
      ? `changed archived=${result.archivedPaths.length}`
      : 'unchanged';
  console.log(`${label}: ${summary} path=${result.path}`);
}

async function main(): Promise<void> {
  const { dryRun, kinds, featureFilter, guideAck } = parseCli();

  if (kinds.has('guide') && !guideAck && !dryRun) {
    console.error(
      'Refusing to run guide rollup without --i-understand-guides (mutates parent guides). Use --dry-run to preview.'
    );
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log('Dry run: no filesystem changes.\n');
  }

  let features = await listFeatureDirNames();
  if (featureFilter) {
    features = features.filter(f => f === featureFilter);
    if (features.length === 0) {
      console.error(`No feature directory matches --feature=${featureFilter}`);
      process.exitCode = 1;
      return;
    }
  }

  for (const featureName of features) {
    const featureDir = join(FEATURES_ROOT, featureName);

    for (const kind of kinds) {
      const sessionIds = (await listSessionIdsForKind(featureDir, kind))
        .filter(id => !isExcludedSixFamilyId(id))
        .sort(compareDottedTierIds);

      for (const sid of sessionIds) {
        await runOne(featureName, kind, 'session', sid, dryRun);
      }

      const phaseIds = (await listPhaseIdsForKind(featureDir, kind))
        .filter(id => !isExcludedSixFamilyId(id))
        .sort(compareDottedTierIds);

      for (const pid of phaseIds) {
        await runOne(featureName, kind, 'phase', pid, dryRun);
      }

      if (SKIP_FEATURE_LEVEL.has(featureName)) {
        console.log(`${featureName}: skip feature-level ${kind} (appointment-workflow / 6.x policy)`);
        continue;
      }

      const featureDocName =
        kind === 'planning'
          ? 'feature-planning.md'
          : kind === 'log'
            ? `feature-${featureName}-log.md`
            : kind === 'handoff'
              ? `feature-${featureName}-handoff.md`
              : `feature-${featureName}-guide.md`;

      const featureDocPath = join(featureDir, featureDocName);
      if (!(await pathExists(featureDocPath))) {
        console.log(`${featureName}: skip feature ${kind} (no ${featureDocName})`);
        continue;
      }
      await runOne(featureName, kind, 'feature', '', dryRun);
    }
  }

  console.log(dryRun ? '\nDry run done.' : '\nBatch rollup done.');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
