/**
 * Atomic Command: /git-merge [sourceBranch] [targetBranch?]
 * Merge sourceBranch into targetBranch (or current branch if targetBranch not provided).
 *
 * skipStash (default false): When true the merge expects a clean working tree.
 *   If uncommitted changes exist, the merge returns a descriptive failure instead
 *   of stashing (which historically caused "added by both" / stash-pop conflicts).
 *   Tier-end callers should always pre-commit before calling with skipStash: true.
 *
 * Legacy stash behaviour is preserved when skipStash is false so that manual
 * or non-tier-end callers still work without changes.
 */

import { getCurrentBranch } from '../../utils/utils';
import { runGitCommand } from '../shared/git-logger';

export interface GitMergeParams {
  sourceBranch: string;
  targetBranch?: string;
  /** When true, refuse to stash; fail if the working tree is dirty. */
  skipStash?: boolean;
  /** When true, pull target branch from origin after checkout and before merge (multi-machine sync). */
  pullBeforeMerge?: boolean;
}

async function hasUncommittedChanges(): Promise<boolean> {
  const status = await runGitCommand('git status --porcelain', 'gitMerge-status');
  return status.success && status.output.trim().length > 0;
}

export async function gitMerge(params: GitMergeParams): Promise<{ success: boolean; output: string }> {
  const targetBranch = params.targetBranch || await getCurrentBranch();
  const currentBranch = await getCurrentBranch();
  const skipStash = params.skipStash ?? false;
  let didStash = false;

  if (currentBranch !== targetBranch) {
    const dirty = await hasUncommittedChanges();

    if (dirty && skipStash) {
      const statusOut = await runGitCommand('git status --porcelain', 'gitMerge-status');
      return {
        success: false,
        output:
          `Working tree is dirty and skipStash is set — refusing to merge.\n` +
          `Commit or resolve the following before retrying:\n${statusOut.output}`,
      };
    }

    if (dirty && !skipStash) {
      const stashResult = await runGitCommand('git stash --include-untracked', 'gitMerge-stash');
      if (!stashResult.success) {
        return {
          success: false,
          output: `Failed to stash uncommitted changes before checkout: ${stashResult.error || stashResult.output}`,
        };
      }
      didStash = true;
    }

    const checkoutResult = await runGitCommand(`git checkout ${targetBranch}`, 'gitMerge-checkout');
    if (!checkoutResult.success) {
      if (didStash) await runGitCommand('git stash pop', 'gitMerge-stash-pop');
      return {
        success: false,
        output: `Failed to checkout target branch ${targetBranch}: ${checkoutResult.error || checkoutResult.output}`,
      };
    }

    if (params.pullBeforeMerge) {
      const pullResult = await runGitCommand(`git pull origin ${targetBranch}`, 'gitMerge-pull');
      if (!pullResult.success) {
        if (didStash) await runGitCommand('git stash pop', 'gitMerge-stash-pop');
        return {
          success: false,
          output: `Failed to pull ${targetBranch} before merge: ${pullResult.error || pullResult.output}`,
        };
      }
    }
  } else if (params.pullBeforeMerge) {
    const pullResult = await runGitCommand(`git pull origin ${targetBranch}`, 'gitMerge-pull');
    if (!pullResult.success) {
      return {
        success: false,
        output: `Failed to pull ${targetBranch} before merge: ${pullResult.error || pullResult.output}`,
      };
    }
  }

  const mergeResult = await runGitCommand(`git merge ${params.sourceBranch} --no-edit`, 'gitMerge-merge');

  if (!mergeResult.success) {
    if (didStash) await runGitCommand('git stash pop', 'gitMerge-stash-pop');

    if (mergeResult.error?.includes('conflict') || mergeResult.output.includes('conflict')) {
      return {
        success: false,
        output: `Merge conflict detected when merging ${params.sourceBranch} into ${targetBranch}.\n` +
          `Please resolve conflicts manually and complete the merge.\n` +
          `Error: ${mergeResult.error || mergeResult.output}`,
      };
    }

    return {
      success: false,
      output: `Failed to merge ${params.sourceBranch} into ${targetBranch}: ${mergeResult.error || mergeResult.output}`,
    };
  }

  if (didStash) {
    const popResult = await runGitCommand('git stash pop', 'gitMerge-stash-pop');
    if (!popResult.success) {
      return {
        success: true,
        output: `Successfully merged ${params.sourceBranch} into ${targetBranch}, but stash pop failed: ${popResult.error || popResult.output}. Run 'git stash pop' manually.`,
      };
    }
  }

  return {
    success: true,
    output: `Successfully merged ${params.sourceBranch} into ${targetBranch}`,
  };
}
