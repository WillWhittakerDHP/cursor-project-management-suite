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

  if (commitResult.success) {
    return { success: true, output: `Committed: ${commitMessage}` };
  }

  const errText = `${commitResult.error ?? ''} ${commitResult.output ?? ''}`.toLowerCase();
  const nothingToCommit =
    errText.includes('nothing to commit') || errText.includes('no changes added to commit');

  if (nothingToCommit) {
    const emptyResult = await runGitCommand(`git commit --allow-empty -m '${safe}'`, 'gitCommit-allowEmpty');
    return {
      success: emptyResult.success,
      output: emptyResult.success
        ? `Committed (empty): ${commitMessage}`
        : emptyResult.error || emptyResult.output,
    };
  }

  return {
    success: false,
    output: commitResult.error || commitResult.output,
  };
}
