/**
 * Legacy Utility (Deprecated): gitCommit
 *
 * NOTE:
 * The canonical git command surface lives in `.cursor/commands/git/*`.
 */

import { runCommand } from './utils';

export async function gitCommit(suggestedMessage: string, finalMessage?: string): Promise<{ success: boolean; output: string }> {
  // Stage all changes
  const stageResult = await runCommand('git add -A');
  if (!stageResult.success) {
    return {
      success: false,
      output: `Failed to stage changes: ${stageResult.error}`,
    };
  }
  
  // Use final message if provided, otherwise use suggested
  const commitMessage = finalMessage || suggestedMessage;
  
  // Commit with message
  const commitResult = await runCommand(`git commit -m "${commitMessage}"`);
  
  return {
    success: commitResult.success,
    output: commitResult.success 
      ? `Committed: ${commitMessage}`
      : commitResult.error || commitResult.output,
  };
}

