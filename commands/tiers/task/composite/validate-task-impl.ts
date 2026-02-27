/**
 * Task validation implementation. Used by tier-validate and by task-start (thin wrapper).
 */

import { WorkflowCommandContext } from '../../../utils/command-context';
import { readProjectFile } from '../../../utils/utils';
import { WorkflowId } from '../../../utils/id-utils';
import { TASK_CONFIG } from '../../configs/task';
import { SESSION_CONFIG } from '../../configs/session';

export interface ValidateTaskResult {
  canStart: boolean;
  reason: string;
  details: string[];
}

export async function validateTaskImpl(taskId: string): Promise<ValidateTaskResult> {
  const parsed = WorkflowId.parseTaskId(taskId);
  if (!parsed) {
    return {
      canStart: false,
      reason: 'Invalid task ID format',
      details: [
        'Task ID format must be X.Y.Z.A (e.g., 4.1.3.1)',
        `Received: ${taskId}`,
      ],
    };
  }

  const sessionId = parsed.sessionId;
  const taskNum = parseInt(parsed.task, 10);

  const featureName = await (async () => {
    try {
      const ctx = await WorkflowCommandContext.getCurrent();
      return ctx.feature.name;
    } catch {
      return undefined;
    }
  })();
  if (!featureName) {
    return {
      canStart: false,
      reason: 'Feature context not available',
      details: ['Could not resolve feature context. Ensure .current-feature or branch is set.'],
    };
  }

  const context = new WorkflowCommandContext(featureName);

  try {
    const sessionGuidePath = context.paths.getSessionGuidePath(sessionId);
    let sessionGuideContent: string;
    try {
      sessionGuideContent = await readProjectFile(sessionGuidePath);
    } catch (err) {
      console.warn('Validate task: session guide not found', sessionGuidePath, err);
      return {
        canStart: false,
        reason: 'Session guide not found',
        details: [
          `Session guide does not exist at: ${sessionGuidePath}`,
          `Run /session-start ${sessionId} in execute mode to create the session guide and task sections.`,
        ],
      };
    }

    const taskSectionExists = new RegExp(
      `(?:####|###)\\s+Task\\s+${taskId.replace(/\./g, '\\.')}[\\s:]`
    ).test(sessionGuideContent);
    if (!taskSectionExists) {
      return {
        canStart: false,
        reason: 'Task section not found in session guide',
        details: [
          `Session guide exists but has no section for Task ${taskId}`,
          `Run /session-start ${sessionId} in execute mode to create and fill task sections, then run /task-start ${taskId}`,
        ],
      };
    }

    const taskStatus = await TASK_CONFIG.controlDoc.readStatus(context, taskId);
    if (taskStatus !== null && taskStatus === 'complete') {
      return {
        canStart: false,
        reason: 'Task already completed',
        details: [
          `Task ${taskId} is marked complete in session guide`,
          `To start the next task, use /task-start ${sessionId}.${taskNum + 1}`,
        ],
      };
    }

    if (taskNum > 1) {
      const previousTaskId = `${sessionId}.${taskNum - 1}`;
      const previousStatus = await TASK_CONFIG.controlDoc.readStatus(context, previousTaskId);
      if (previousStatus !== null && previousStatus !== 'complete') {
        return {
          canStart: false,
          reason: 'Previous task not completed',
          details: [
            `Task ${previousTaskId} is not marked complete in session guide`,
            `Task ${taskId} cannot be started until Task ${previousTaskId} is complete`,
            `Complete Task ${previousTaskId} first with /task-end ${previousTaskId}`,
          ],
        };
      }
    }

    const sessionStatus = await SESSION_CONFIG.controlDoc.readStatus(context, sessionId);
    if (sessionStatus === 'complete') {
      return {
        canStart: false,
        reason: 'Session already completed',
        details: [
          `Session ${sessionId} is marked complete in phase guide`,
          'Cannot start new tasks in a completed session',
          `To start a new session, use /session-start with the next session ID`,
        ],
      };
    }

    return {
      canStart: true,
      reason: 'Task can be started',
      details: [
        `Task ${taskId} is not completed`,
        taskNum > 1 ? `Previous task (${sessionId}.${taskNum - 1}) is complete` : 'This is the first task in the session',
        `Session ${sessionId} is not complete`,
        `Ready to start with /task-start ${taskId}`,
      ],
    };
  } catch (_error) {
    return {
      canStart: false,
      reason: 'Validation error',
      details: [
        `Error during validation: ${_error instanceof Error ? _error.message : String(_error)}`,
        'Please check task ID format and session guide exists',
      ],
    };
  }
}
