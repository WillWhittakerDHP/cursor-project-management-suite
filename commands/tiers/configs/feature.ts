/**
 * Tier config for feature (name).
 * Used by tier-start, tier-end; feature-change uses different flow (rename/pivot).
 * Control doc = PROJECT_PLAN.md table (Status column).
 */

import type { TierConfig } from '../shared/types';
import type { WorkflowCommandContext } from '../../utils/command-context';
import { readProjectFile, writeProjectFile } from '../../utils/utils';

/** Feature "parse" just validates non-empty name. */
function parseFeatureId(id: string): string | null {
  const t = id.trim();
  return t === '' ? null : t;
}

const PROJECT_PLAN_PATH = '.project-manager/PROJECT_PLAN.md';

/** Row index and normalized status from PROJECT_PLAN table. */
interface FeaturePlanRow {
  lineIndex: number;
  rawLine: string;
  status: string;
}

/**
 * Find feature row in PROJECT_PLAN table by # column (id as feature number) or by Directory (feature name).
 * Returns line index, raw line, and normalized lowercase status; null if not found.
 */
export function parseFeatureStatusFromProjectPlan(
  projectPlanContent: string,
  id: string,
  featureNameFromContext: string
): FeaturePlanRow | null {
  const tableLines = projectPlanContent.split('\n');
  const dataLines = tableLines
    .map((line, index) => ({ line, index }))
    .filter(
      ({ line }) =>
        line.startsWith('|') && !line.startsWith('|---') && !line.startsWith('| #')
    );

  const featureDir = featureNameFromContext.toLowerCase().replace(/\s+/g, '-');

  for (const { line, index } of dataLines) {
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 4) continue;

    const numCell = cells[0];
    const dirCell = cells[3];
    const matchByNum = numCell === id;
    const matchByDir = dirCell.includes(featureDir);

    if (matchByNum || matchByDir) {
      const rawStatus = cells[2]
        .replace(/[✅⏳📋🔮❌]/gu, '')
        .trim()
        .toLowerCase();
      return { lineIndex: index, rawLine: line, status: rawStatus };
    }
  }
  return null;
}

const STATUS_TO_EMOJI: Record<string, string> = {
  complete: '✅ Complete',
  reopened: '⏳ Reopened',
  'in progress': '⏳ In Progress',
  partial: '⏳ Partial',
  planning: '📋 Planning',
  'not started': '🔮 Not Started',
  blocked: '❌ Blocked',
};

function replaceStatusInTableLine(rawLine: string, newStatus: string): string {
  const cells = rawLine.split('|').map((c) => c.trim()).filter(Boolean);
  if (cells.length < 3) return rawLine;
  const display = STATUS_TO_EMOJI[newStatus.toLowerCase()] ?? newStatus;
  cells[2] = display;
  return '| ' + cells.join(' | ') + ' |';
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
  controlDoc: {
    path: () => PROJECT_PLAN_PATH,
    readStatus: async (ctx: WorkflowCommandContext, id: string): Promise<string | null> => {
      try {
        const content = await readProjectFile(PROJECT_PLAN_PATH);
        const featureName = ctx.paths.getFeatureName();
        const row = parseFeatureStatusFromProjectPlan(content, id, featureName);
        return row?.status ?? null;
      } catch {
        return null;
      }
    },
    writeStatus: async (
      ctx: WorkflowCommandContext,
      id: string,
      newStatus: string
    ): Promise<void> => {
      const content = await readProjectFile(PROJECT_PLAN_PATH);
      const featureName = ctx.paths.getFeatureName();
      const row = parseFeatureStatusFromProjectPlan(content, id, featureName);
      if (!row) return;

      const lines = content.split('\n');
      const newLine = replaceStatusInTableLine(lines[row.lineIndex], newStatus);
      lines[row.lineIndex] = newLine;
      await writeProjectFile(PROJECT_PLAN_PATH, lines.join('\n'));
    },
  },
  updateLog: async () => {
    // Feature change uses its own log update (feature log section); not used by runTierChange
  },
  replanCommand: undefined,
  getBranchName: (_ctx, id) => `feature/${id}`,
  getParentBranchName: () => null,
};
