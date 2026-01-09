/**
 * Legacy Utility (Deprecated): gitPush
 *
 * NOTE:
 * The canonical git command surface lives in `.cursor/commands/git/*`.
 */

import { runCommand, getCurrentBranch } from './utils';

export async function gitPush(): Promise<{ success: boolean; output: string }> {
  const branch = await getCurrentBranch();
  const result = await runCommand(`git push origin ${branch}`);
  
  return {
    success: result.success,
    output: result.success
      ? `Pushed to ${branch}`
      : result.error || result.output,
  };
}

