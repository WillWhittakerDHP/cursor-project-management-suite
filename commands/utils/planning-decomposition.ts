/**
 * Shared planning decomposition parsing (tier-start + planning rollup).
 * Single canonical implementation — no legacy "## How we build the tierDown" fallback.
 */

import type { TierDownPlanItem } from '../tiers/shared/tier-start-workflow-types';

/** Leaf decomposition: no child headings; harness auto-scaffolds `.1` tierDown rows. */
export const LEAF_TIER_MARKER = /\*\*Leaf tier\*\*/i;

/**
 * Extract ## Decomposition body only (canonical heading per governance templates).
 */
export function extractDecompositionSection(content: string): string {
  const newMatch = content.match(/\n##\s+Decomposition\s*[\r\n]+([\s\S]*?)(?=\n##\s+|$)/i);
  return newMatch ? newMatch[1].trim() : '';
}

/**
 * Parse per-tierDown items from the decomposition section. Supports ### headings, bullets, or **Leaf tier**.
 */
export function parseTierDownBuildPlanPerItem(
  buildPlanContent: string,
  tierDownKind: 'phase' | 'session' | 'task'
): TierDownPlanItem[] {
  if (!buildPlanContent.trim()) return [];
  if (LEAF_TIER_MARKER.test(buildPlanContent)) return [];

  const items: TierDownPlanItem[] = [];

  const headingRe =
    tierDownKind === 'phase'
      ? /###\s+Phase\s+(\d+\.\d+)\s*:\s*(.+)/gi
      : tierDownKind === 'session'
        ? /###\s+Session\s+(\d+\.\d+\.\d+)\s*:\s*(.+)/gi
        : /###\s+Task\s+(\d+\.\d+\.\d+\.\d+)\s*:\s*(.+)/gi;

  for (const m of buildPlanContent.matchAll(headingRe)) {
    const itemId = m[1].trim();
    const description = (m[2] ?? '').trim().slice(0, 500) || itemId;
    if (itemId && !items.some(i => i.id === itemId)) items.push({ id: itemId, description });
  }

  if (items.length > 0) return items;

  const lines = buildPlanContent.split('\n').map(l => l.trim()).filter(Boolean);
  const phaseRe = /(?:^|\s)(?:\*\*)?Phase\s+(\d+\.\d+)(?:\*\*)?\s*:?\s*(.*)$/i;
  const sessionRe = /(?:^|\s)(?:\*\*)?Session\s+(\d+\.\d+\.\d+)(?:\*\*)?\s*:?\s*(.*)$/i;
  const taskRe = /(?:^|\s)(?:\*\*)?Task\s+(\d+\.\d+\.\d+\.\d+)(?:\*\*)?\s*:?\s*(.*)$/i;
  const re = tierDownKind === 'phase' ? phaseRe : tierDownKind === 'session' ? sessionRe : taskRe;
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      const itemId = m[1].trim();
      const description = (m[2] ?? '').trim().slice(0, 500) || itemId;
      if (itemId && !items.some(i => i.id === itemId)) items.push({ id: itemId, description });
    }
  }
  return items;
}
