/**
 * Atomic Command: /git-push
 * Push to current branch
 */

import { runCommand, getCurrentBranch } from '../../utils/utils';

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

