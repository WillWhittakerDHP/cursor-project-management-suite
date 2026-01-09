/**
 * Legacy Utility (Deprecated): createBranch
 *
 * NOTE:
 * This file used to be a slash-command entrypoint, but the canonical command surface now
 * exports git operations from `.cursor/commands/git/*`.
 */

import { runCommand } from './utils';

export async function createBranch(branchName: string): Promise<{ success: boolean; output: string }> {
  const result = await runCommand(`git checkout -b ${branchName}`);
  
  return {
    success: result.success,
    output: result.success
      ? `Created and switched to branch: ${branchName}`
      : result.error || result.output,
  };
}

