/**
 * Single entry point for all tier git operations.
 * All callers outside git/ should import from here only (see
 * `scripts/check-cursor-git-import-boundary.mjs`). `tier-branch-manager` uses
 * `git-logger` for queries to avoid a circular import with this module.
 */

import { gitCommit as gitCommitFromAtomic } from '../atomic/commit';
import { gitMerge } from '../atomic/merge';
import { createBranch as createBranchFromAtomic } from '../atomic/create-branch';
import { gitPush as gitPushFromAtomic } from '../atomic/push';
import {
  ensureTierBranch,
  mergeTierBranch,
  mergeChildBranches,
  deleteMergedChildBranchesAfterPush,
  getExpectedBranchForTier,
  getLeafBranchTierFromChain,
  formatBranchHierarchyFromConfig,
  isAutoCommittable,
  isNeverCommitPath,
  DEFAULT_ALLOWED_COMMIT_PREFIXES,
  commitUncommittedNonCursor,
  syncCursorSubmodule,
} from './tier-branch-manager';
import type {
  BranchChainLink,
  EnsureTierBranchResult,
  EnsureTierBranchOptions,
  SubmoduleCursorMode,
  MergeTierBranchResult,
  MergeChildBranchesResult,
  CommitUncommittedOptions,
  MergeTierFailureReasonCode,
} from './git-contract';
import { MERGE_TIER_REASON_CODES, isMergeTierFailureReasonCode } from './git-contract';
import { FEATURE_CONFIG } from '../../tiers/configs/feature';
import type { WorkflowCommandContext } from '../../utils/command-context';
import { recoverPlanningArtifactsAfterCheckout } from './artifact-branch-recovery';
import {
  runGitCommand,
  logGitOp,
  warnGitOp,
  getGitOpsLog,
  getCurrentBranch,
  branchExists,
  isBranchBasedOn,
  listWorkingTreeChangedRepoPaths,
  type GitOpEntry,
} from './git-logger';
import {
  propagateFiles,
  propagateSharedFiles,
  propagateHarness,
  type PropagateOptions,
  type PropagateResult,
} from '../composite/propagate-files';

// ─── Types ──────────────────────────────────────────────────────────────
export type {
  BranchChainLink,
  EnsureTierBranchResult,
  EnsureTierBranchOptions,
  SubmoduleCursorMode,
  MergeTierBranchResult,
  MergeChildBranchesResult,
  CommitUncommittedOptions,
  MergeTierFailureReasonCode,
};
export { MERGE_TIER_REASON_CODES, isMergeTierFailureReasonCode };
export type { GitOpEntry, PropagateOptions, PropagateResult };
export type { GitFrictionEntry } from './git-friction-log';
export { appendGitFriction, recordGitFriction } from './git-friction-log';

// ─── Branch operations ─────────────────────────────────────────────────
export {
  ensureTierBranch,
  mergeTierBranch,
  mergeChildBranches,
  deleteMergedChildBranchesAfterPush,
  getExpectedBranchForTier,
  getLeafBranchTierFromChain,
  formatBranchHierarchyFromConfig,
  recoverPlanningArtifactsAfterCheckout,
  syncCursorSubmodule,
};

/** Feature-only: ensure `feature/<id>` from develop (alias for ensureTierBranch + FEATURE_CONFIG). */
export async function ensureFeatureBranch(
  featureId: string,
  context: WorkflowCommandContext,
  options?: Parameters<typeof ensureTierBranch>[3]
): Promise<EnsureTierBranchResult> {
  return ensureTierBranch(FEATURE_CONFIG, featureId, context, options);
}

/** Feature completion merge into parent (e.g. develop); alias for mergeTierBranch + FEATURE_CONFIG. */
export async function mergeFeatureIntoTrunk(
  featureId: string,
  context: WorkflowCommandContext,
  options?: Parameters<typeof mergeTierBranch>[3]
): Promise<MergeTierBranchResult> {
  return mergeTierBranch(FEATURE_CONFIG, featureId, context, options);
}

export async function getExpectedFeatureBranch(
  featureId: string,
  context: WorkflowCommandContext
): Promise<string | null> {
  return getExpectedBranchForTier(FEATURE_CONFIG, featureId, context);
}

export async function formatFeatureBranchStatus(
  featureId: string,
  context: WorkflowCommandContext
): Promise<string> {
  return formatBranchHierarchyFromConfig(FEATURE_CONFIG, featureId, context);
}

// ─── Query (from git-logger, logged via runGitCommand) ───────────────────
export { getCurrentBranch, branchExists, isBranchBasedOn, listWorkingTreeChangedRepoPaths };

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

/** Run `git status --porcelain --ignore-submodules=dirty`. Returns { success, output }. */
export async function gitStatus(): Promise<{ success: boolean; output: string; error?: string }> {
  return runGitCommand('git status --porcelain --ignore-submodules=dirty', 'gitStatus');
}

/** Run `git status --porcelain` (strict working tree snapshot; no submodule ignore). */
export async function gitStatusPorcelain(): Promise<{ success: boolean; output: string; error?: string }> {
  return runGitCommand('git status --porcelain', 'gitStatusPorcelain');
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
