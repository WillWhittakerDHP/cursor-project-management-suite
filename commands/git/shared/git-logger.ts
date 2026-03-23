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

// ─── Query helpers (logged; no dependency on git-manager to avoid cycles) ─

export async function getCurrentBranch(): Promise<string> {
  const result = await runGitCommand('git branch --show-current', 'getCurrentBranch');
  if (result.success && result.output.trim()) {
    return result.output.trim();
  }
  console.warn('WARNING: Could not get current git branch, defaulting to \'main\'');
  return 'main';
}

export async function branchExists(branchName: string): Promise<boolean> {
  const result = await runGitCommand(`git rev-parse --verify ${branchName}`, 'branchExists');
  return result.success;
}

export async function isBranchBasedOn(childBranch: string, parentBranch: string): Promise<boolean> {
  const mergeBaseResult = await runGitCommand(
    `git merge-base ${parentBranch} ${childBranch}`,
    'isBranchBasedOn-mergeBase'
  );
  if (!mergeBaseResult.success) return false;

  const parentHeadResult = await runGitCommand(
    `git rev-parse ${parentBranch}`,
    'isBranchBasedOn-parentHead'
  );
  if (!parentHeadResult.success) return false;

  return mergeBaseResult.output.trim() === parentHeadResult.output.trim();
}

/**
 * After `git fetch origin <branchName>`, compares local branch tip to `origin/<branchName>`.
 * Used by tier-branch sync to avoid blind `git pull` after auto-rebase (which would replay divergent history).
 */
export async function compareBranchToRemote(
  branchName: string
): Promise<'up-to-date' | 'behind' | 'ahead' | 'diverged' | 'no-remote'> {
  const localRef = await runGitCommand(`git rev-parse --verify ${branchName}`, 'compareBranchToRemote-local');
  if (!localRef.success) return 'no-remote';
  const local = localRef.output.trim();

  await runGitCommand(`git fetch origin ${branchName}`, 'compareBranchToRemote-fetch');
  const remoteRef = await runGitCommand(`git rev-parse --verify origin/${branchName}`, 'compareBranchToRemote-remote');
  if (!remoteRef.success) return 'no-remote';
  const remote = remoteRef.output.trim();

  if (local === remote) return 'up-to-date';

  const localBehind = await runGitCommand(
    `git merge-base --is-ancestor ${local} ${remote}`,
    'compareBranchToRemote-behind'
  );
  if (localBehind.success) return 'behind';

  const localAhead = await runGitCommand(
    `git merge-base --is-ancestor ${remote} ${local}`,
    'compareBranchToRemote-ahead'
  );
  if (localAhead.success) return 'ahead';

  return 'diverged';
}
