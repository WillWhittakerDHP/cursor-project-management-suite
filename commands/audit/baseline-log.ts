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
 * Build a tier-stamp from explicit scope values.
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
 * Build a tier-stamp by deriving the full parent hierarchy from the identifier.
 *
 * Identifier segments follow a fixed depth convention:
 *   2 segments (6.9)       → phase
 *   3 segments (6.9.3)     → session (parent phase = first 2)
 *   4 segments (6.9.3.1)   → task    (parent phase = first 2, session = first 3)
 *
 * This prevents callers from accidentally omitting parent tiers.
 */
export function buildTierStampFromId(
  feature: string,
  tier: AuditTier,
  identifier: string
): string {
  if (tier === 'feature') {
    return buildTierStamp({ feature });
  }
  const segments = identifier.split('.');
  return buildTierStamp({
    feature,
    phase: segments.length >= 2 ? segments.slice(0, 2).join('.') : null,
    session: segments.length >= 3 ? segments.slice(0, 3).join('.') : null,
    task: segments.length >= 4 ? segments.slice(0, 4).join('.') : null,
  });
}

/**
 * Append one entry to the baseline log.
 * Skips the write if an entry with the same tierStamp + phase already exists
 * within the dedup window (default 30 minutes), preventing duplicates when
 * tier-start is invoked more than once for the same tier.
 */
export async function appendBaselineEntry(entry: BaselineLogEntry): Promise<void> {
  await mkdir(dirname(LOG_PATH), { recursive: true });

  const DEDUP_WINDOW_MS = 30 * 60 * 1000;
  if (existsSync(LOG_PATH)) {
    try {
      const raw = await readFile(LOG_PATH, 'utf-8');
      const entryTime = new Date(entry.timestamp).getTime();
      for (const line of raw.trim().split('\n').filter(Boolean)) {
        try {
          const existing = JSON.parse(line) as BaselineLogEntry;
          if (
            existing.tierStamp === entry.tierStamp &&
            existing.phase === entry.phase &&
            Math.abs(entryTime - new Date(existing.timestamp).getTime()) < DEDUP_WINDOW_MS
          ) {
            console.warn(
              `[appendBaselineEntry] Skipping duplicate: ${entry.tierStamp} (${entry.phase}) — ` +
              `existing entry at ${existing.timestamp}, new at ${entry.timestamp}`
            );
            return;
          }
        } catch { /* skip malformed lines */ }
      }
    } catch { /* file unreadable — proceed with append */ }
  }

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
