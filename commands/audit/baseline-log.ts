/**
 * Baseline Log — append-only JSONL store for audit baseline scores.
 *
 * Each tier-start appends a "start" entry (via the background audit runner).
 * Each tier-end queries the log for the matching tier-stamp to compute deltas.
 *
 * Tier-stamp format: "F:<feature>.P:<phase>.S:<session>.T:<task>"
 * Partial stamps are valid (e.g. feature-start only has "F:<feature>").
 *
 * File location: .project-manager/.audit-baseline-log.jsonl
 */

import { readFile, appendFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import type { AuditTier } from './types';

const PROJECT_ROOT = process.cwd();
const LOG_PATH = join(PROJECT_ROOT, '.project-manager', '.audit-baseline-log.jsonl');

export interface BaselineLogEntry {
  tierStamp: string;
  tier: AuditTier;
  identifier: string;
  phase: 'start' | 'end';
  timestamp: string;
  scores: Record<string, number>;
  featureName: string;
}

/**
 * Build a tier-stamp from scope values.
 * Produces "F:<feature>.P:<phase>.S:<session>.T:<task>" with only non-null segments.
 */
export function buildTierStamp(scope: {
  feature?: string | null;
  phase?: string | null;
  session?: string | null;
  task?: string | null;
}): string {
  const parts: string[] = [];
  if (scope.feature) parts.push(`F:${scope.feature}`);
  if (scope.phase) parts.push(`P:${scope.phase}`);
  if (scope.session) parts.push(`S:${scope.session}`);
  if (scope.task) parts.push(`T:${scope.task}`);
  return parts.join('.');
}

/**
 * Append one entry to the baseline log (atomic append, safe for concurrent writes).
 */
export async function appendBaselineEntry(entry: BaselineLogEntry): Promise<void> {
  await mkdir(dirname(LOG_PATH), { recursive: true });
  const line = JSON.stringify(entry) + '\n';
  await appendFile(LOG_PATH, line, 'utf-8');
}

/**
 * Query the most recent "start" entry matching the given tier-stamp.
 * Returns null if no match or if the match is older than maxAgeMs (default 7 days).
 */
export async function queryBaseline(
  tierStamp: string,
  opts?: { maxAgeMs?: number }
): Promise<BaselineLogEntry | null> {
  if (!existsSync(LOG_PATH)) return null;

  const maxAge = opts?.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  try {
    const raw = await readFile(LOG_PATH, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);

    let best: BaselineLogEntry | null = null;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as BaselineLogEntry;
        if (entry.tierStamp !== tierStamp || entry.phase !== 'start') continue;
        const age = now - new Date(entry.timestamp).getTime();
        if (age > maxAge) continue;
        best = entry;
      } catch {
        // skip malformed lines
      }
    }
    return best;
  } catch {
    return null;
  }
}

/**
 * Get the log file path (for display/reference).
 */
export function getBaselineLogPath(): string {
  return LOG_PATH;
}
