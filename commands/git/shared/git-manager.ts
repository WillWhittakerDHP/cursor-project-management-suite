/**
 * Single entry point for all tier git operations.
 * All callers outside git/ should import from here. Internal git modules use
 * runGitCommand from git-logger and re-export through this facade.
 */

import { getCurrentBranch as getCurrentBranchFromUtils, branchExists, isBranchBasedOn } from '../../utils/utils';
import { gitCommit as gitCommitFromAtomic } from '../atomic/commit';
import { gitMerge } from '../atomic/merge';
import { createBranch as createBranchFromAtomic } from '../atomic/create-branch';
import { gitPush as gitPushFromAtomic } from '../atomic/push';
import {
  ensureTierBranch,
  mergeTierBranch,
  mergeChildBranches,
  getExpectedBranchForTier,
  formatBranchHierarchyFromConfig,
  isAutoCommittable,
  isNeverCommitPath,
  DEFAULT_ALLOWED_COMMIT_PREFIXES,
  commitUncommittedNonCursor,
  type EnsureTierBranchResult,
  type MergeTierBranchResult,
  type MergeChildBranchesResult,
  type CommitUncommittedOptions,
} from './tier-branch-manager';
import { runGitCommand, logGitOp, warnGitOp, getGitOpsLog, type GitOpEntry } from './git-logger';
import {
  propagateFiles,
  propagateSharedFiles,
  propagateHarness,
  type PropagateOptions,
  type PropagateResult,
} from '../composite/propagate-files';

// ─── Types ──────────────────────────────────────────────────────────────
export type { EnsureTierBranchResult, MergeTierBranchResult, MergeChildBranchesResult, CommitUncommittedOptions };
export type { GitOpEntry, PropagateOptions, PropagateResult };

// ─── Branch operations ─────────────────────────────────────────────────
export { ensureTierBranch, mergeTierBranch, mergeChildBranches, getExpectedBranchForTier, formatBranchHierarchyFromConfig };

// ─── Query (from utils) ────────────────────────────────────────────────
export async function getCurrentBranch(): Promise<string> {
  return getCurrentBranchFromUtils();
}
export { branchExists, isBranchBasedOn };

// ─── Commit remaining ───────────────────────────────────────────────────
export async function commitRemaining(
  commitMessage: string,
  options?: CommitUncommittedOptions
): Promise<{ committed: boolean; success: boolean; output: string }> {
  return commitUncommittedNonCursor(commitMessage, options);
}

// ─── Path helpers ───────────────────────────────────────────────────────
export { isAutoCommittable, isNeverCommitPath, DEFAULT_ALLOWED_COMMIT_PREFIXES };

// ─── Atomics ────────────────────────────────────────────────────────────
export const gitCommit = gitCommitFromAtomic;
export { gitMerge };
export const createBranch = createBranchFromAtomic;
export const gitPush = gitPushFromAtomic;

// ─── Logger ────────────────────────────────────────────────────────────
export { runGitCommand, logGitOp, warnGitOp, getGitOpsLog };

// ─── Convenience wrappers (all go through runGitCommand for logging) ────────

/** Run `git status --porcelain`. Returns { success, output }. */
export async function gitStatus(): Promise<{ success: boolean; output: string; error?: string }> {
  return runGitCommand('git status --porcelain', 'gitStatus');
}

/**
 * Run `git log -n <n> --pretty=format:<format>`.
 * @param format - e.g. '%h - %s (%ar)'
 * @param n - number of commits (default 1)
 */
export async function gitLog(
  format: string,
  n = 1
): Promise<{ success: boolean; output: string; error?: string }> {
  const safe = format.replace(/"/g, '\\"');
  return runGitCommand(`git log -${n} --pretty=format:"${safe}"`, 'gitLog');
}

/** Run `git diff <args>`. Caller must pass safe args (e.g. "HEAD path"). */
export async function gitDiff(args: string): Promise<{ success: boolean; output: string; error?: string }> {
  return runGitCommand('git diff ' + args, 'gitDiff');
}

/** Run `git add <paths>`. Paths are passed as-is; avoid untrusted input. */
export async function gitAdd(...paths: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  const quoted = paths.map((p) => (p.includes(' ') ? `"${p.replace(/"/g, '\\"')}"` : p)).join(' ');
  return runGitCommand('git add ' + quoted, 'gitAdd');
}

/** Run `git checkout <target>` (e.g. branch name or `-- .`). */
export async function gitCheckout(target: string): Promise<{ success: boolean; output: string; error?: string }> {
  return runGitCommand('git checkout ' + target, 'gitCheckout');
}

/** Run `git branch --list [pattern]`. */
export async function gitListBranches(
  pattern?: string
): Promise<{ success: boolean; output: string; error?: string }> {
  if (pattern != null && pattern !== '') {
    const safe = pattern.replace(/'/g, "'\\''");
    return runGitCommand(`git branch --list '${safe}'`, 'gitListBranches');
  }
  return runGitCommand('git branch --list', 'gitListBranches');
}

/** Run `git diff --cached --quiet`. success true = no staged changes; success false = staged changes or error. */
export async function gitDiffCached(): Promise<{ success: boolean; output: string; error?: string }> {
  return runGitCommand('git diff --cached --quiet', 'gitDiffCached');
}

/** Run `git fetch origin [branch]`. Omit branch to fetch all. */
export async function gitFetch(
  branch?: string
): Promise<{ success: boolean; output: string; error?: string }> {
  const cmd = branch ? `git fetch origin ${branch}` : 'git fetch origin';
  return runGitCommand(cmd, 'gitFetch');
}

/** Run `git pull origin <branch>`. Returns success even if nothing to pull. */
export async function gitPull(branch: string): Promise<{ success: boolean; output: string; error?: string }> {
  return runGitCommand(`git pull origin ${branch}`, 'gitPull');
}

// ─── Propagation ────────────────────────────────────────────────────────
export { propagateFiles, propagateSharedFiles, propagateHarness };
