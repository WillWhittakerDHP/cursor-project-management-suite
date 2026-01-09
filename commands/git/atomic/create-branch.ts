/**
 * Atomic Command: /create-branch [name]
 * Create new git branch
 */

import { runCommand } from '../../utils/utils';

export async function createBranch(branchName: string): Promise<{ success: boolean; output: string }> {
  const result = await runCommand(`git checkout -b ${branchName}`);
  
  return {
    success: result.success,
    output: result.success
      ? `Created and switched to branch: ${branchName}`
      : result.error || result.output,
  };
}

