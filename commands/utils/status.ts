/**
 * Atomic Command: /status
 * Quick overview of current position in migration
 * Shows: phase, next action, last completed, branch, recent commits
 */

import { readProjectFile, getCurrentBranch, runCommand } from './utils';
import { MarkdownUtils } from './markdown-utils';
import { WorkflowCommandContext } from './command-context';

export async function status(): Promise<string> {
  const output: string[] = [];
  
  // Read handoff for current status using WorkflowCommandContext
  const context = await WorkflowCommandContext.getCurrent();
  const handoffContent = await context.readFeatureHandoff();
  
  // Extract current status
  const currentStatus = MarkdownUtils.extractSection(handoffContent, 'Current Status');
  const nextAction = MarkdownUtils.extractSection(handoffContent, 'Next Action');
  const transitionContext = MarkdownUtils.extractSection(handoffContent, 'Transition Context');
  
  // Get git info
  const branch = await getCurrentBranch();
  const lastCommitResult = await runCommand('git log -1 --pretty=format:"%h - %s (%ar)"');
  const lastCommit = lastCommitResult.success ? lastCommitResult.output : 'Unable to get commit info';
  
  output.push('# Current Status\n');
  
  // Current Status
  if (currentStatus) {
    output.push(currentStatus);
    output.push('');
  } else {
    output.push('**Status:** Unable to determine current status');
    output.push('');
  }
  
  // Next Action
  if (nextAction) {
    output.push(nextAction);
    output.push('');
  }
  
  // Transition Context (abbreviated)
  if (transitionContext) {
    const contextLines = transitionContext.split('\n').slice(0, 5); // First 5 lines only
    output.push('## Quick Context');
    output.push(contextLines.join('\n'));
    output.push('');
  }
  
  // Git Info
  output.push('## Git Information');
  output.push(`**Branch:** \`${branch}\``);
  output.push(`**Last Commit:** ${lastCommit}`);
  output.push('');
  
  // Quick Links
  output.push('## Quick Links');
  output.push(`- Handoff: \`${context.paths.getFeatureHandoffPath()}\``);
  output.push(`- Session Log: \`${context.paths.getBasePath()}/sessions/session-[X.Y]-log.md\``);
  output.push(`- Session Guide: \`${context.paths.getBasePath()}/sessions/session-[X.Y]-guide.md\``);
  
  return output.join('\n');
}

