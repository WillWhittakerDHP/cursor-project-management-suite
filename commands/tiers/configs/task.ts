/**
 * Tier config for task (X.Y.Z.A).
 * Task log entries go to the session log; identifier for updateLog is sessionId derived from taskId.
 * Control doc = session guide; task status = **Status:** in the task subsection (e.g. ### Task 1:).
 */

import type { TierConfig } from '../shared/types';
import { WorkflowId } from '../../utils/id-utils';
import { appendLog } from '../../utils/append-log';
import { readProjectFile, writeProjectFile } from '../../utils/utils';
import type { WorkflowCommandContext } from '../../utils/command-context';
import { MarkdownUtils } from '../../utils/markdown-utils';

const TASK_STATUS_REGEX = /\*\*Status:\*\*\s*([^\n]+)/i;

export const TASK_CONFIG: TierConfig = {
  name: 'task',
  idFormat: 'X.Y.Z.A',
  parseId: (id: string) => WorkflowId.parseTaskId(id),
  paths: {
    guide: (ctx, id) => ctx.paths.getTaskGuidePath(id),
    log: (ctx, id) => {
      const parsed = WorkflowId.parseTaskId(id);
      if (!parsed) return ctx.paths.getSessionLogPath(id);
      return ctx.paths.getSessionLogPath(parsed.sessionId);
    },
    handoff: (ctx, id) => {
      const parsed = WorkflowId.parseTaskId(id);
      if (!parsed) return ctx.paths.getSessionHandoffPath(id);
      return ctx.paths.getSessionHandoffPath(parsed.sessionId);
    },
  },
  controlDoc: {
    path: (ctx, id) => {
      const parsed = WorkflowId.parseTaskId(id);
      return parsed ? ctx.paths.getSessionGuidePath(parsed.sessionId) : ctx.paths.getSessionGuidePath(id);
    },
    readStatus: async (ctx: WorkflowCommandContext, id: string): Promise<string | null> => {
      try {
        const parsed = WorkflowId.parseTaskId(id);
        if (!parsed) return null;
        const guidePath = ctx.paths.getSessionGuidePath(parsed.sessionId);
        const content = await readProjectFile(guidePath);
        const parts = id.split('.');
        const taskNum = parts.length === 4 ? parts[3] : '';
        const section = MarkdownUtils.extractSection(content, 'Task ' + taskNum);
        const match = section.match(TASK_STATUS_REGEX);
        return match ? match[1].trim().toLowerCase() : null;
      } catch {
        return null;
      }
    },
    writeStatus: async (
      ctx: WorkflowCommandContext,
      id: string,
      newStatus: string
    ): Promise<void> => {
      const parsed = WorkflowId.parseTaskId(id);
      if (!parsed) return;
      const guidePath = ctx.paths.getSessionGuidePath(parsed.sessionId);
      let content = await readProjectFile(guidePath);
      const parts = id.split('.');
      const taskNum = parts.length === 4 ? parts[3] : '';
      const section = MarkdownUtils.extractSection(content, 'Task ' + taskNum);
      if (!section) return;
      const newSection = section.replace(TASK_STATUS_REGEX, `**Status:** ${newStatus}`);
      const sectionTitle = 'Task ' + taskNum;
      const fullSection = MarkdownUtils.extractSection(content, sectionTitle, { includeSubsections: true });
      if (fullSection && content.includes(fullSection)) {
        content = content.replace(fullSection, newSection);
      }
      await writeProjectFile(guidePath, content);
    },
  },
  updateLog: async (context: WorkflowCommandContext, identifier: string, logEntry: string) => {
    const parsed = WorkflowId.parseTaskId(identifier);
    const sessionId = parsed ? parsed.sessionId : identifier;
    await appendLog(logEntry, sessionId, context.paths.getFeatureName());
  },
  replanCommand: undefined, // Task has no re-plan
  getBranchName: () => null,
  getParentBranchName: () => null,
};
