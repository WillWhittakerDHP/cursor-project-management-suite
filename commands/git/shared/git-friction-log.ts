/**
 * Structured append-only log for git-related harness incidents (complements .git-ops-log).
 * Agents should append one JSON line per non-trivial failure or recovery (see playbooks).
 */

import { join, dirname } from 'path';
import { appendFile, mkdir } from 'fs/promises';

const FRICTION_LOG = join(process.cwd(), '.project-manager', '.git-friction-log.jsonl');

export type GitFrictionDisposition = 'blocked' | 'retried' | 'recovered' | 'escalated' | 'info';

export interface GitFrictionEntry {
  timestamp: string;
  /** Workflow step or git operation label */
  step: string;
  tier?: string;
  tierId?: string;
  featureName?: string;
  currentBranch?: string | null;
  expectedBranch?: string | null;
  reasonCode?: string;
  failureCategory?: string;
  command?: string;
  stderrExcerpt?: string;
  recoveryAttempt?: string;
  disposition: GitFrictionDisposition;
  notes?: string;
}

/**
 * Append one friction record (best-effort; never throws to callers).
 */
export async function appendGitFriction(entry: GitFrictionEntry): Promise<void> {
  const line =
    JSON.stringify({
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
    }) + '\n';
  try {
    await mkdir(dirname(FRICTION_LOG), { recursive: true });
    await appendFile(FRICTION_LOG, line, 'utf8');
  } catch (err) {
    console.warn(
      `[appendGitFriction] could not write: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Fire-and-forget wrapper for hot paths.
 */
export function recordGitFriction(entry: Omit<GitFrictionEntry, 'timestamp'> & { timestamp?: string }): void {
  void appendGitFriction({
    ...entry,
    timestamp: entry.timestamp ?? new Date().toISOString(),
  });
}
