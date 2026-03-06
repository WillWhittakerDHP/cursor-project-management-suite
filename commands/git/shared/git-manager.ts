/**
 * Single entry point for all tier git operations.
 * Delegates to tier-branch-manager and utils; policy (e.g. ensure-branch-before-commit) lives in tier-branch-manager.
 */

import { getCurrentBranch as getCurrentBranchFromUtils } from '../../utils/utils';
import { gitCommit as gitCommitFromAtomic } from '../atomic/commit';
import {
  ensureTierBranch,
  mergeTierBranch,
  getExpectedBranchForTier,
  formatBranchHierarchyFromConfig,
  isAutoCommittable,
  isNeverCommitPath,
  DEFAULT_ALLOWED_COMMIT_PREFIXES,
  commitUncommittedNonCursor,
  type EnsureTierBranchResult,
  type MergeTierBranchResult,
  type CommitUncommittedOptions,
} from './tier-branch-manager';

// Re-export types for callers
export type { EnsureTierBranchResult, MergeTierBranchResult, CommitUncommittedOptions };

// Branch operations
export { ensureTierBranch, mergeTierBranch, getExpectedBranchForTier, formatBranchHierarchyFromConfig };

// Current branch (from utils)
export async function getCurrentBranch(): Promise<string> {
  return getCurrentBranchFromUtils();
}

// Commit remaining: ensure-branch-before-commit is applied inside commitUncommittedNonCursor
export async function commitRemaining(
  commitMessage: string,
  options?: CommitUncommittedOptions
): Promise<{ committed: boolean; success: boolean; output: string }> {
  return commitUncommittedNonCursor(commitMessage, options);
}

// Path helpers
export { isAutoCommittable, isNeverCommitPath, DEFAULT_ALLOWED_COMMIT_PREFIXES };

// Atomic commit (stage all + commit; used by session-end for feature/audit commits)
export const gitCommit = gitCommitFromAtomic;
