/**
 * Atomic Command: /git-push
 * Push to current branch
 */

import { getCurrentBranch } from '../../utils/utils';
import { runGitCommand } from '../shared/git-logger';

export async function gitPush(): Promise<{ success: boolean; output: string }> {
  const branch = await getCurrentBranch();
  const result = await runGitCommand(`git push origin ${branch}`, 'gitPush');

  return {
    success: result.success,
    output: result.success
      ? `Pushed to ${branch}`
      : result.error || result.output,
  };
}
