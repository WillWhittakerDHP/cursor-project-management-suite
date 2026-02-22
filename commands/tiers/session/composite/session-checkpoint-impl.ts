/**
 * Session checkpoint implementation. Used by tier-checkpoint and by session-checkpoint (thin wrapper).
 * Reads task progress from session guide task sections (### Task N: and **Status:**).
 */

import { getCurrentDate } from '../../../utils/utils';
import { readProjectFile } from '../../../utils/utils';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { resolveFeatureName } from '../../../utils';
import { MarkdownUtils } from '../../../utils/markdown-utils';

const TASK_STATUS_REGEX = /\*\*Status:\*\*\s*([^\n]+)/i;

export async function sessionCheckpointImpl(
  sessionId: string,
  featureName?: string
): Promise<string> {
  const resolved = await resolveFeatureName(featureName);
  const context = new WorkflowCommandContext(resolved);
  const output: string[] = [];

  output.push(`# Session ${sessionId} Checkpoint\n`);
  output.push(`**Date:** ${getCurrentDate()}\n`);
  output.push('---\n');

  try {
    const sessionGuidePath = context.paths.getSessionGuidePath(sessionId);
    const guideContent = await readProjectFile(sessionGuidePath);

    const sessionStatus = await (await import('../../configs/session')).SESSION_CONFIG.controlDoc.readStatus(context, sessionId);
    output.push('## Session Status\n');
    output.push(`**Status:** ${sessionStatus ?? 'unknown'}\n`);
    output.push('\n---\n');

    const taskSectionTitles = guideContent.match(/### Task\s+(\d+):/g) ?? [];
    const completed: string[] = [];
    const notComplete: string[] = [];
    for (const titleMatch of taskSectionTitles) {
      const taskNum = titleMatch.replace(/### Task\s+(\d+):.*/, '$1');
      const section = MarkdownUtils.extractSection(guideContent, 'Task ' + taskNum);
      const statusMatch = section.match(TASK_STATUS_REGEX);
      const status = statusMatch?.[1]?.toLowerCase() ?? '';
      const taskId = `${sessionId}.${taskNum}`;
      if (status.includes('complete') || status.includes('done')) {
        completed.push(taskId);
      } else {
        notComplete.push(taskId);
      }
    }

    if (completed.length > 0) {
      output.push('## Completed Tasks\n');
      for (const id of completed) output.push(`- ✅ **${id}**\n`);
      output.push('\n---\n');
    }
    if (notComplete.length > 0) {
      output.push('## Tasks Not Complete\n');
      for (const id of notComplete) output.push(`- ⏳ **${id}**\n`);
      output.push('\n---\n');
    }
    if (taskSectionTitles.length === 0) {
      output.push('## Tasks\n');
      output.push('**No task sections found in session guide.**\n');
      output.push('\n---\n');
    }
  } catch (_error) {
    output.push('## Tasks\n');
    output.push(`**WARNING: Could not read session guide**\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('\n---\n');
  }

  output.push('## Session Progress Review\n');
  output.push('**Review:**\n');
  output.push('- Tasks completed in this session\n');
  output.push('- Concepts learned\n');
  output.push('- Next tasks to work on\n');

  return output.join('\n');
}
