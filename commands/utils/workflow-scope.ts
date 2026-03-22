/**
 * Single entry for workflow scope: normalized feature directory + tier + identifier + optional .tier-scope.
 * WHY: No filesystem scan / chained fallbacks; callers pass explicit featureId or featureName for phase/session (and optionally for task).
 * Task tier: feature ref may be omitted when **taskId** is **X.Y.Z.A** — the first segment is used as the PROJECT_PLAN feature # (see `WorkflowId.parseTaskId`).
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { FeatureContext } from './feature-context';
import { WorkflowId } from './id-utils';
import { readTierScope, type TierScopeSnapshot } from './tier-scope-writer';

/** Harness tier names (F/P/S/T). */
export type TierName = 'feature' | 'phase' | 'session' | 'task';

/** Params for resolveWorkflowScope. Phase and session require featureId or featureName; task may omit them when taskId is X.Y.Z.A (feature derived from first segment). */
export type TierParamsBag = {
  featureId?: string;
  featureName?: string;
  phaseId?: string;
  phaseNumber?: string;
  sessionId?: string;
  taskId?: string;
};

export type ResolvedWorkflowScope = {
  featureName: string;
  tier: TierName;
  identifier: string;
  scope?: TierScopeSnapshot;
};

export type ResolveWorkflowScopeArgs = {
  mode: 'fromTierParams';
  tier: TierName;
  params: TierParamsBag;
};

const PROJECT_PLAN_PATH = '.project-manager/PROJECT_PLAN.md';
const FEATURE_SUMMARY_HEADER = '| # | Feature | Status | Directory | Key Dates |';

/**
 * Map numeric # or feature directory slug from PROJECT_PLAN.md / features dir to directory name.
 * PATTERN: PROJECT_PLAN Feature Summary + optional features-dir slug check.
 */
async function featureIdOrNameToDirectory(featureId: string): Promise<string> {
  const trimmed = featureId.trim();
  if (!trimmed) {
    throw new Error('featureIdOrNameToDirectory: feature id or name is required');
  }
  const PROJECT_ROOT = process.cwd();
  const planPath = join(PROJECT_ROOT, PROJECT_PLAN_PATH);
  let content: string;
  try {
    content = await readFile(planPath, 'utf-8');
  } catch (err) {
    throw new Error(
      `featureIdOrNameToDirectory: could not read ${PROJECT_PLAN_PATH}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const tableStart = content.indexOf(FEATURE_SUMMARY_HEADER);
  if (tableStart === -1) {
    throw new Error(`featureIdOrNameToDirectory: Feature Summary table not found in ${PROJECT_PLAN_PATH}`);
  }
  const afterHeader = content.slice(tableStart + FEATURE_SUMMARY_HEADER.length);
  const tableEnd = afterHeader.indexOf('\n\n');
  const tableBody = tableEnd === -1 ? afterHeader : afterHeader.slice(0, tableEnd);
  const rows = tableBody.split('\n').filter((line) => line.startsWith('|') && line.includes('|'));
  const isNumericId = /^\d+$/.test(trimmed);
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 4) continue;
    const numCell = cells[0];
    const dirCell = cells[3];
    const dirMatch = dirCell.match(/`?features\/([^/`]+)\/?`?/);
    const name = dirMatch ? dirMatch[1] : dirCell.replace(/^`|`$/g, '').replace(/^features\/|\/$/g, '').trim();
    if (!name || name === '—' || name.startsWith('—')) continue;
    if (isNumericId && numCell === trimmed) return name;
    if (!isNumericId && name === trimmed) return name;
  }
  if (!isNumericId) {
    const available = await FeatureContext.listAvailableFeatures();
    if (available.includes(trimmed)) return trimmed;
  }
  throw new Error(
    `featureIdOrNameToDirectory: no feature found with # or directory "${trimmed}" in ${PROJECT_PLAN_PATH} Feature Summary`
  );
}

function requireFeatureRef(params: TierParamsBag, tier: TierName): string {
  const f = (params.featureId ?? params.featureName ?? '').trim();
  if (!f) {
    throw new Error(`resolveWorkflowScope(${tier}): featureId or featureName is required`);
  }
  return f;
}

/**
 * Resolve normalized feature directory, tier identifier, and optional .tier-scope snapshot.
 */
export async function resolveWorkflowScope(args: ResolveWorkflowScopeArgs): Promise<ResolvedWorkflowScope> {
  if (args.mode !== 'fromTierParams') {
    throw new Error('resolveWorkflowScope: only mode "fromTierParams" is supported');
  }
  const { tier, params } = args;
  let featureName: string;
  let identifier: string;

  switch (tier) {
    case 'feature': {
      const id = (params.featureId ?? params.featureName ?? '').trim();
      if (!id) {
        throw new Error('resolveWorkflowScope(feature): featureId or featureName required');
      }
      featureName = await featureIdOrNameToDirectory(id);
      identifier = id;
      break;
    }
    case 'phase': {
      const phaseId = (params.phaseId ?? params.phaseNumber ?? '').trim();
      if (!phaseId) {
        throw new Error('resolveWorkflowScope(phase): phaseId or phaseNumber required');
      }
      featureName = await featureIdOrNameToDirectory(requireFeatureRef(params, tier));
      identifier = phaseId;
      break;
    }
    case 'session': {
      const sessionId = (params.sessionId ?? '').trim();
      if (!sessionId) {
        throw new Error('resolveWorkflowScope(session): sessionId required');
      }
      featureName = await featureIdOrNameToDirectory(requireFeatureRef(params, tier));
      identifier = sessionId;
      break;
    }
    case 'task': {
      const taskId = (params.taskId ?? '').trim();
      if (!taskId) {
        throw new Error('resolveWorkflowScope(task): taskId required');
      }
      let id = (params.featureId ?? params.featureName ?? '').trim();
      if (!id) {
        const parsed = WorkflowId.parseTaskId(taskId);
        if (parsed?.feature) id = parsed.feature;
      }
      if (!id) {
        throw new Error(
          'resolveWorkflowScope(task): pass featureId or featureName (PROJECT_PLAN # or directory slug), or use task id X.Y.Z.A so the feature # can be taken from the first segment.'
        );
      }
      featureName = await featureIdOrNameToDirectory(id);
      identifier = taskId;
      break;
    }
    default: {
      const exhaustive: never = tier;
      throw new Error(`resolveWorkflowScope: unknown tier ${String(exhaustive)}`);
    }
  }

  const scope = (await readTierScope()) ?? undefined;
  return { featureName, tier, identifier, scope };
}

/**
 * Map PROJECT_PLAN Feature Summary `#` or `features/` directory slug → canonical feature directory name.
 * Same rules as `resolveWorkflowScope` for `tier: 'feature'`.
 */
export async function resolveFeatureDirectoryFromPlan(featureRef: string): Promise<string> {
  const id = featureRef.trim();
  if (!id) {
    throw new Error('resolveFeatureDirectoryFromPlan: featureRef is required (PROJECT_PLAN # or directory slug)');
  }
  const resolved = await resolveWorkflowScope({
    mode: 'fromTierParams',
    tier: 'feature',
    params: { featureId: id },
  });
  return resolved.featureName;
}

/**
 * Active feature directory from `.project-manager/.tier-scope` (written on successful tier-starts).
 * WHY: Explicit scope file — no git-branch inference (see HARNESS_CHARTER / resolveWorkflowScope).
 */
export async function resolveActiveFeatureDirectory(): Promise<string> {
  const scope = await readTierScope();
  const raw = scope?.feature?.id?.trim();
  if (!raw) {
    throw new Error(
      'resolveActiveFeatureDirectory: no feature in .project-manager/.tier-scope. Run a tier-start that writes scope, or pass a feature # / directory slug to the command.'
    );
  }
  return resolveFeatureDirectoryFromPlan(raw);
}
