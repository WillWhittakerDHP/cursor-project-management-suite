/**
 * Atomic Command: /git-merge [sourceBranch] [targetBranch?]
 * Merge sourceBranch into targetBranch (or current branch if targetBranch not provided).
 *
 * Stashes uncommitted changes before checkout so that tier-end workflows
 * (which write docs between the feature commit and the merge step) don't
 * fail with "Your local changes would be overwritten by checkout".
 */

import { runCommand, getCurrentBranch } from '../../utils/utils';

export interface GitMergeParams {
  sourceBranch: string;
  targetBranch?: string;
}

async function hasUncommittedChanges(): Promise<boolean> {
  const status = await runCommand('git status --porcelain');
  return status.success && status.output.trim().length > 0;
}

export async function gitMerge(params: GitMergeParams): Promise<{ success: boolean; output: string }> {
  const targetBranch = params.targetBranch || await getCurrentBranch();
  const currentBranch = await getCurrentBranch();
  let didStash = false;

  if (currentBranch !== targetBranch) {
    // Stash any uncommitted changes so the checkout can proceed
    if (await hasUncommittedChanges()) {
      const stashResult = await runCommand('git stash --include-untracked');
      if (!stashResult.success) {
        return {
          success: false,
          output: `Failed to stash uncommitted changes before checkout: ${stashResult.error || stashResult.output}`,
        };
      }
      didStash = true;
    }

    const checkoutResult = await runCommand(`git checkout ${targetBranch}`);
    if (!checkoutResult.success) {
      if (didStash) await runCommand('git stash pop');
      return {
        success: false,
        output: `Failed to checkout target branch ${targetBranch}: ${checkoutResult.error || checkoutResult.output}`,
      };
    }
  }

  const mergeResult = await runCommand(`git merge ${params.sourceBranch} --no-edit`);

  if (!mergeResult.success) {
    if (didStash) await runCommand('git stash pop');

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

  // Re-apply stashed changes on the merged branch
  if (didStash) {
    const popResult = await runCommand('git stash pop');
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

