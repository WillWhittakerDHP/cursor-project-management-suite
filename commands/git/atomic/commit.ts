/**
 * Atomic Command: /git-commit [message]
 * Stage all changes and commit (prompts with suggested message, allows edit)
 */

import { runGitCommand } from '../shared/git-logger';

export async function gitCommit(suggestedMessage: string, finalMessage?: string): Promise<{ success: boolean; output: string }> {
  const stageResult = await runGitCommand('git add -A', 'gitCommit-stage');
  if (!stageResult.success) {
    return {
      success: false,
      output: `Failed to stage changes: ${stageResult.error}`,
    };
  }

  const commitMessage = finalMessage || suggestedMessage;
  const safe = commitMessage.replace(/'/g, "'\\''");
  const commitResult = await runGitCommand(`git commit -m '${safe}'`, 'gitCommit');

  return {
    success: commitResult.success,
    output: commitResult.success
      ? `Committed: ${commitMessage}`
      : commitResult.error || commitResult.output,
  };
}
