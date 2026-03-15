/**
 * Atomic Command: /create-branch [name]
 * Create new git branch
 */

import { runGitCommand } from '../shared/git-logger';

export async function createBranch(branchName: string): Promise<{ success: boolean; output: string }> {
  const result = await runGitCommand(`git checkout -b ${branchName}`, 'createBranch');

  return {
    success: result.success,
    output: result.success
      ? `Created and switched to branch: ${branchName}`
      : result.error || result.output,
  };
}
