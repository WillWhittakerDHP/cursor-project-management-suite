/**
 * Tier config for task (X.Y.Z.A).
 * Task log entries go to the session log; identifier for updateLog is sessionId derived from taskId.
 */

import type { TierConfig } from '../shared/types';
import { WorkflowId } from '../../utils/id-utils';
import { appendLog } from '../../utils/append-log';
import type { WorkflowCommandContext } from '../../utils/command-context';

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
  updateLog: async (context: WorkflowCommandContext, identifier: string, logEntry: string) => {
    const parsed = WorkflowId.parseTaskId(identifier);
    const sessionId = parsed ? parsed.sessionId : identifier;
    await appendLog(logEntry, sessionId, context.paths.getFeatureName());
  },
  replanCommand: undefined, // Task has no re-plan
};
