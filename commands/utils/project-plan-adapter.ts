/**
 * Adapter: PROJECT_PLAN.md → feature-guide-shaped content.
 * Used when sources.guide === 'project' so feature tier context comes from PROJECT_PLAN.
 */

import { readProjectFile } from './utils';
import { resolveFeatureDirectoryFromPlan } from './workflow-scope';
const PROJECT_PLAN_PATH = '.project-manager/PROJECT_PLAN.md';
const FEATURE_SUMMARY_HEADER = '| # | Feature | Status | Directory | Key Dates |';

/**
 * Extract the feature block (## Feature N: Title ...) from PROJECT_PLAN for a given feature.
 * Returns markdown suitable as feature-guide context (summary, phases, goals).
 *
 * @param featureIdentifier Feature # (e.g. "6") or directory name (e.g. "appointment-workflow")
 * @returns Feature section content, or empty string if not found
 */
export async function getFeatureGuideFromProjectPlan(featureIdentifier: string): Promise<string> {
  let content: string;
  try {
    content = await readProjectFile(PROJECT_PLAN_PATH);
  } catch {
    return '';
  }

  const featureName = await resolveFeatureDirectoryFromPlan(featureIdentifier.trim()).catch(() => null);
  if (!featureName) return '';

  const tableStart = content.indexOf(FEATURE_SUMMARY_HEADER);
  if (tableStart === -1) return '';

  const afterHeader = content.slice(tableStart + FEATURE_SUMMARY_HEADER.length);
  const tableEnd = afterHeader.indexOf('\n\n');
  const tableBody = tableEnd === -1 ? afterHeader : afterHeader.slice(0, tableEnd);
  const rows = tableBody.split('\n').filter((line) => line.startsWith('|') && line.includes('|'));

  let featureNum: string | null = null;
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 4) continue;
    const numCell = cells[0];
    const dirCell = cells[3];
    const dirMatch = dirCell.match(/`?features\/([^/`]+)\/?`?/);
    const name = dirMatch ? dirMatch[1] : dirCell.replace(/^`|`$/g, '').replace(/^features\/|\/$/g, '').trim();
    if (!name || name === '—' || name.startsWith('—')) continue;
    if (name === featureName) {
      featureNum = numCell;
      break;
    }
  }
  if (!featureNum) return '';

  const featureHeading = `## Feature ${featureNum}:`;
  const idx = content.indexOf(featureHeading);
  if (idx === -1) return '';

  const start = idx;
  const nextSection = content.slice(start + featureHeading.length);
  const nextMatch = nextSection.match(/\n## (?:Feature \d+|Milestones|Overview|Environment)/);
  const end = nextMatch
    ? start + featureHeading.length + nextMatch.index!
    : content.length;
  const block = content.slice(start, end).trim();
  return block ? `# Feature context (from PROJECT_PLAN)\n\n${block}` : '';
}
