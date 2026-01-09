/**
 * Atomic Command: /git-merge [sourceBranch] [targetBranch?]
 * Merge sourceBranch into targetBranch (or current branch if targetBranch not provided)
 */

import { runCommand, getCurrentBranch } from '../../utils/utils';

export interface GitMergeParams {
  sourceBranch: string;
  targetBranch?: string;
}

export async function gitMerge(params: GitMergeParams): Promise<{ success: boolean; output: string }> {
  const targetBranch = params.targetBranch || await getCurrentBranch();
  const currentBranch = await getCurrentBranch();
  
  // If we're already on the target branch and it's different from source, we can merge directly
  // Otherwise, we need to checkout the target branch first
  if (currentBranch !== targetBranch) {
    const checkoutResult = await runCommand(`git checkout ${targetBranch}`);
    if (!checkoutResult.success) {
      return {
        success: false,
        output: `Failed to checkout target branch ${targetBranch}: ${checkoutResult.error || checkoutResult.output}`,
      };
    }
  }
  
  // Merge source branch into current (target) branch
  const mergeResult = await runCommand(`git merge ${params.sourceBranch} --no-edit`);
  
  if (!mergeResult.success) {
    // Check if it's a merge conflict
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
  
  return {
    success: true,
    output: `Successfully merged ${params.sourceBranch} into ${targetBranch}`,
  };
}

