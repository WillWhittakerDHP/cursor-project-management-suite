/**
 * Register a new feature in PROJECT_PLAN.md Feature Summary (program index).
 * WHY: Lives in utils (not tiers/configs/feature.ts) to avoid circular load with configs/index.ts
 * when tier-add imports FEATURE_CONFIG and append in the same graph.
 */

import { readProjectFile, writeProjectFile } from './utils';

const PROJECT_PLAN_PATH = '.project-manager/PROJECT_PLAN.md';

const FEATURE_SUMMARY_HEADER = '| # | Feature | Status | Directory | Key Dates |';

const FEATURE_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface AppendFeatureSummaryRowResult {
  success: boolean;
  alreadyExists: boolean;
  assignedNumber: number;
  displayName: string;
  projectPlanPath: string;
  errorMessage?: string;
}

export function validateFeatureSlugForPlan(slug: string): string | null {
  const t = slug.trim();
  if (!t) {
    return 'Feature slug is required';
  }
  if (!FEATURE_SLUG_PATTERN.test(t)) {
    return 'Invalid slug: use lowercase letters, digits, and hyphens only (e.g. my-new-feature)';
  }
  return null;
}

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}

/**
 * Append a Feature Summary row to PROJECT_PLAN.md if `features/<slug>/` is not already listed.
 */
export async function appendFeatureSummaryRowIfMissing(params: {
  slug: string;
  description?: string;
}): Promise<AppendFeatureSummaryRowResult> {
  const slug = params.slug.trim();
  const slugError = validateFeatureSlugForPlan(slug);
  if (slugError) {
    return {
      success: false,
      alreadyExists: false,
      assignedNumber: 0,
      displayName: '',
      projectPlanPath: PROJECT_PLAN_PATH,
      errorMessage: slugError,
    };
  }

  const desc = params.description?.trim();
  const displayName =
    desc && desc.length > 0
      ? escapeTableCell(desc.length > 120 ? `${desc.slice(0, 117)}...` : desc)
      : `Feature: ${humanizeSlug(slug)}`;

  let content: string;
  try {
    content = await readProjectFile(PROJECT_PLAN_PATH);
  } catch (err) {
    return {
      success: false,
      alreadyExists: false,
      assignedNumber: 0,
      displayName,
      projectPlanPath: PROJECT_PLAN_PATH,
      errorMessage: `Could not read ${PROJECT_PLAN_PATH}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const tableStart = content.indexOf(FEATURE_SUMMARY_HEADER);
  if (tableStart === -1) {
    return {
      success: false,
      alreadyExists: false,
      assignedNumber: 0,
      displayName,
      projectPlanPath: PROJECT_PLAN_PATH,
      errorMessage: `Feature Summary table not found in ${PROJECT_PLAN_PATH}`,
    };
  }

  const afterHeader = content.slice(tableStart + FEATURE_SUMMARY_HEADER.length);
  const tableEndRel = afterHeader.indexOf('\n\n');
  const tableBody = tableEndRel === -1 ? afterHeader : afterHeader.slice(0, tableEndRel);
  const lines = tableBody.split('\n');

  let maxNum = 0;

  for (const line of lines) {
    if (!line.startsWith('|') || line.includes('---')) {
      continue;
    }
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 4) {
      continue;
    }
    if (cells[0] === '#') {
      continue;
    }

    const numCell = cells[0];
    const n = parseInt(numCell, 10);
    if (!Number.isNaN(n) && n > maxNum) {
      maxNum = n;
    }

    const dirCell = cells[3];
    const dirMatch = dirCell.match(/`?features\/([^/`]+)\/?`?/);
    const nameFromDir = dirMatch ? dirMatch[1] : '';
    if (nameFromDir === slug) {
      const existingNum = parseInt(cells[0], 10);
      return {
        success: true,
        alreadyExists: true,
        assignedNumber: Number.isNaN(existingNum) ? 0 : existingNum,
        displayName: cells.length > 1 ? cells[1] : displayName,
        projectPlanPath: PROJECT_PLAN_PATH,
      };
    }
  }

  const nextNum = maxNum + 1;
  const dirCellQuoted = `\`features/${slug}/\``;
  const newRow = `| ${nextNum} | ${displayName} | 📋 Planning | ${dirCellQuoted} | — |`;

  const insertPos = tableStart + FEATURE_SUMMARY_HEADER.length + tableBody.length;
  const before = content.slice(0, insertPos);
  const after = content.slice(insertPos);
  const newContent = `${before}${before.endsWith('\n') ? '' : '\n'}${newRow}\n${after}`;

  try {
    const wrote = await writeProjectFile(PROJECT_PLAN_PATH, newContent);
    if (!wrote) {
      return {
        success: false,
        alreadyExists: false,
        assignedNumber: nextNum,
        displayName,
        projectPlanPath: PROJECT_PLAN_PATH,
        errorMessage: `Write to ${PROJECT_PLAN_PATH} was blocked or skipped (write guard).`,
      };
    }
  } catch (err) {
    return {
      success: false,
      alreadyExists: false,
      assignedNumber: nextNum,
      displayName,
      projectPlanPath: PROJECT_PLAN_PATH,
      errorMessage: `Could not write ${PROJECT_PLAN_PATH}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    success: true,
    alreadyExists: false,
    assignedNumber: nextNum,
    displayName,
    projectPlanPath: PROJECT_PLAN_PATH,
  };
}
