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

// ─── Propagation ────────────────────────────────────────────────────────
export { propagateFiles, propagateSharedFiles, propagateHarness };
