/**
 * Centralized Git operation logging and runGitCommand wrapper.
 * All git shell-outs in the harness go through runGitCommand so every
 * operation is logged to .project-manager/.git-ops-log for debugging.
 */

import { join, dirname } from 'path';
import { runCommand } from '../../utils/utils';

// ─── Types ──────────────────────────────────────────────────────────────

export interface GitOpEntry {
  timestamp: string;
  operation: string;
  command: string;
  success: boolean;
  output: string;
  error?: string;
  context?: string;
  durationMs?: number;
}

// ─── Log file ────────────────────────────────────────────────────────────

const GIT_OPS_LOG = join(process.cwd(), '.project-manager', '.git-ops-log');

export function logGitOp(entry: GitOpEntry): void {
  const line = JSON.stringify({
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
  }) + '\n';
  (async () => {
    try {
      const { appendFile, mkdir } = await import('fs/promises');
      await mkdir(dirname(GIT_OPS_LOG), { recursive: true });
      await appendFile(GIT_OPS_LOG, line);
    } catch (err) {
      console.warn(
        `[logGitOp] Could not write git-ops log: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  })();
}

export function warnGitOp(entry: GitOpEntry): void {
  const msg = entry.error ?? entry.output;
  console.warn(`[${entry.operation}] ${msg}`);
  logGitOp(entry);
}

/**
 * Read the last N lines from the git-ops log (one JSON object per line).
 * Used for debugging. Returns empty array if file missing or unreadable.
 */
export async function getGitOpsLog(last?: number): Promise<GitOpEntry[]> {
  try {
    const { readFile } = await import('fs/promises');
    const content = await readFile(GIT_OPS_LOG, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const entries = lines.map((l) => JSON.parse(l) as GitOpEntry);
    if (last != null && last > 0) return entries.slice(-last);
    return entries;
  } catch {
    return [];
  }
}

// ─── runGitCommand ────────────────────────────────────────────────────────

/**
 * Run a git command and log the result. All git shell-outs in the harness
 * should use this so operations are traceable. Validates command starts with "git".
 */
export async function runGitCommand(
  command: string,
  context?: string
): Promise<{ success: boolean; output: string; error?: string }> {
  const trimmed = command.trim();
  if (!trimmed.startsWith('git ')) {
    const entry: GitOpEntry = {
      timestamp: new Date().toISOString(),
      operation: 'runGitCommand',
      command: trimmed,
      success: false,
      output: '',
      error: 'Command does not start with "git "',
      context,
    };
    warnGitOp(entry);
    return { success: false, output: '', error: entry.error };
  }

  const start = Date.now();
  const result = await runCommand(trimmed);
  const durationMs = Date.now() - start;

  const entry: GitOpEntry = {
    timestamp: new Date().toISOString(),
    operation: context ?? 'git',
    command: trimmed,
    success: result.success,
    output: result.output,
    error: result.error,
    context,
    durationMs,
  };
  logGitOp(entry);
  if (!result.success) {
    console.warn(`[${entry.operation}] ${entry.error ?? entry.output}`);
  }

  return result;
}
