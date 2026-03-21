/**
 * Atomic Command: /git-merge [sourceBranch] [targetBranch?]
 * Merge sourceBranch into targetBranch (or current branch if targetBranch not provided).
 *
 * skipStash (default false): When true the merge expects a clean working tree.
 *   If uncommitted changes exist, the merge returns a descriptive failure instead
 *   of stashing (which historically caused "added by both" / stash-pop conflicts).
 *   Tier-end callers should always pre-commit before calling with skipStash: true.
 *
 * preferSource (default false): When true, uses `-X theirs` so the source
 *   (child) branch wins on all text conflicts. Tier-end merges should set this
 *   because the child branch always has the latest work.
 *
 * autoResolveSubmodule (default false): When the merge fails due to a .cursor
 *   submodule conflict, automatically resolve it by taking the source branch's
 *   version and complete the merge.
 *
 * Legacy stash behaviour is preserved when skipStash is false so that manual
 * or non-tier-end callers still work without changes.
 */

import { getCurrentBranch, runGitCommand } from '../shared/git-logger';

export interface GitMergeParams {
  sourceBranch: string;
  targetBranch?: string;
  /** When true, refuse to stash; fail if the working tree is dirty. */
  skipStash?: boolean;
  /** When true, pull target branch from origin after checkout and before merge (multi-machine sync). */
  pullBeforeMerge?: boolean;
  /** When true, use `-X theirs` so the source (child) branch wins text conflicts. */
  preferSource?: boolean;
  /** When true, auto-resolve .cursor submodule conflicts by taking source branch's version. */
  autoResolveSubmodule?: boolean;
}

async function hasUncommittedChanges(): Promise<boolean> {
  const status = await runGitCommand('git status --porcelain --ignore-submodules=dirty', 'gitMerge-status');
  return status.success && status.output.trim().length > 0;
}

/** If a merge was started and left the repo conflicted, abort so files are not left with <<<<<< markers. */
async function abortMergeIfInProgress(): Promise<void> {
  const mergeHead = await runGitCommand('git rev-parse -q --verify MERGE_HEAD', 'gitMerge-checkMergeHead');
  if (mergeHead.success && mergeHead.output.trim()) {
    await runGitCommand('git merge --abort', 'gitMerge-abort-in-progress');
  }
}

/**
 * After a failed merge, check if the only unmerged path is the .cursor submodule.
 * If so, resolve it by taking the source branch's version and commit.
 */
async function tryAutoResolveSubmodule(
  sourceBranch: string,
  targetBranch: string
): Promise<{ resolved: boolean; output: string }> {
  const lsFiles = await runGitCommand('git diff --name-only --diff-filter=U', 'gitMerge-listUnmerged');
  if (!lsFiles.success) {
    return { resolved: false, output: 'Could not list unmerged paths.' };
  }

  const unmerged = lsFiles.output.trim().split('\n').filter(Boolean);
  const nonSubmodule = unmerged.filter(p => p !== '.cursor');

  if (nonSubmodule.length > 0) {
    return {
      resolved: false,
      output: `Cannot auto-resolve: ${nonSubmodule.length} non-submodule conflict(s): ${nonSubmodule.join(', ')}`,
    };
  }

  if (!unmerged.includes('.cursor')) {
    return { resolved: false, output: 'No .cursor in unmerged paths.' };
  }

  const checkout = await runGitCommand(
    `git checkout ${sourceBranch} -- .cursor`,
    'gitMerge-autoResolveSubmodule-checkout'
  );
  if (!checkout.success) {
    return { resolved: false, output: `Could not checkout .cursor from ${sourceBranch}: ${checkout.error || checkout.output}` };
  }

  const add = await runGitCommand('git add .cursor', 'gitMerge-autoResolveSubmodule-add');
  if (!add.success) {
    return { resolved: false, output: `Could not stage .cursor: ${add.error || add.output}` };
  }

  const commit = await runGitCommand(
    `git commit --no-edit`,
    'gitMerge-autoResolveSubmodule-commit'
  );
  if (!commit.success) {
    return { resolved: false, output: `Could not complete merge commit: ${commit.error || commit.output}` };
  }

  return {
    resolved: true,
    output: `Auto-resolved .cursor submodule conflict (took ${sourceBranch} version) and completed merge into ${targetBranch}.`,
  };
}

export async function gitMerge(params: GitMergeParams): Promise<{ success: boolean; output: string }> {
  const targetBranch = params.targetBranch || await getCurrentBranch();
  const currentBranch = await getCurrentBranch();
  const skipStash = params.skipStash ?? false;
  const preferSource = params.preferSource ?? false;
  const autoResolveSubmodule = params.autoResolveSubmodule ?? false;
  let didStash = false;

  if (currentBranch !== targetBranch) {
    const dirty = await hasUncommittedChanges();

    if (dirty && skipStash) {
      const statusOut = await runGitCommand('git status --porcelain --ignore-submodules=dirty', 'gitMerge-status');
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
        const noRemoteRef = (pullResult.error || pullResult.output).includes("couldn't find remote ref");
        if (noRemoteRef) {
          // Branch exists locally but not on remote yet -- safe to continue with local state
        } else {
          if (didStash) await runGitCommand('git stash pop', 'gitMerge-stash-pop');
          return {
            success: false,
            output: `Failed to pull ${targetBranch} before merge: ${pullResult.error || pullResult.output}`,
          };
        }
      }
    }
  } else if (params.pullBeforeMerge) {
    const pullResult = await runGitCommand(`git pull origin ${targetBranch}`, 'gitMerge-pull');
    if (!pullResult.success) {
      const noRemoteRef = (pullResult.error || pullResult.output).includes("couldn't find remote ref");
      if (!noRemoteRef) {
        return {
          success: false,
          output: `Failed to pull ${targetBranch} before merge: ${pullResult.error || pullResult.output}`,
        };
      }
    }
  }

  const strategy = preferSource ? '-X theirs' : '';
  const mergeCmd = `git merge ${params.sourceBranch} --no-edit ${strategy}`.trim();
  const mergeResult = await runGitCommand(mergeCmd, 'gitMerge-merge');

  if (!mergeResult.success) {
    // Attempt auto-resolve when only the .cursor submodule is conflicted
    if (autoResolveSubmodule) {
      const resolution = await tryAutoResolveSubmodule(params.sourceBranch, targetBranch);
      if (resolution.resolved) {
        if (didStash) {
          const popResult = await runGitCommand('git stash pop', 'gitMerge-stash-pop');
          if (!popResult.success) {
            return {
              success: true,
              output: `${resolution.output} (stash pop failed: ${popResult.error || popResult.output} — run 'git stash pop' manually)`,
            };
          }
        }
        return { success: true, output: resolution.output };
      }
    }
    await abortMergeIfInProgress();

    if (didStash) await runGitCommand('git stash pop', 'gitMerge-stash-pop');

    const fullOutput = mergeResult.error || mergeResult.output;
    if (fullOutput.includes('conflict') || fullOutput.includes('CONFLICT')) {
      return {
        success: false,
        output: `Merge conflict detected when merging ${params.sourceBranch} into ${targetBranch}.\n` +
          `Please resolve conflicts manually and complete the merge.\n` +
          `Error: ${fullOutput}`,
      };
    }

    return {
      success: false,
      output: `Failed to merge ${params.sourceBranch} into ${targetBranch}: ${fullOutput}`,
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
