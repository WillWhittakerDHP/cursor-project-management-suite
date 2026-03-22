/**
 * Task tier composite: all task-level commands.
 */

import { runTierStart } from '../../shared/tier-start';
import { runTierEnd, TierEndResult } from '../../shared/tier-end';
import { runTierPlan } from '../../shared/tier-plan';
import { runTierChange } from '../../../utils/change-request';
import { runTierValidate } from '../../shared/tier-validate';
import { TASK_CONFIG } from '../../configs/task';
import type { ValidateTaskResult } from './validate-task-impl';
import type { CommandExecutionOptions } from '../../../utils/command-execution-mode';
import type { TaskEndParams } from './task-end-impl';
import type { ChangeRequest, ChangeScope } from '../../../utils/change-request';
import { WorkflowId } from '../../../utils/id-utils';
import { formatTaskEntry, type TaskEntry } from '../atomic/format-task-entry';
import { appendLog } from '../../../utils/append-log';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { resolveWorkflowScope } from '../../../utils/workflow-scope';
import { readProjectFile, writeProjectFile, PROJECT_ROOT, getCurrentDate } from '../../../utils/utils';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { TierStartResult } from '../../../utils/tier-outcome';
import { getExcerptEndMarker } from '../../shared/context-policy';

export type { TaskEndParams };

export interface TaskChangeRequestParams {
  description: string;
  taskId: string;
  scope?: 'code-only' | 'docs-only' | 'both';
}

export interface TaskChangeRequestResult {
  success: boolean;
  changeRequest: ChangeRequest;
  scope: ChangeScope;
  actionPlan: string[];
  logEntry: string;
  output: string;
}

export interface MarkTaskCompleteParams {
  taskId: string;
  entry?: Partial<TaskEntry>;
  /** Numeric # or feature directory slug (required). */
  featureId: string;
}

export async function validateTask(taskId: string): Promise<ValidateTaskResult> {
  return runTierValidate(TASK_CONFIG, taskId);
}

export function formatTaskValidation(result: ValidateTaskResult, taskId: string): string {
  const output: string[] = [];
  output.push(`# Task ${taskId} Validation\n`);
  if (result.canStart) {
    output.push('✅ **Status:** Ready to start\n');
  } else {
    output.push(`❌ **Status:** Cannot start - ${result.reason}\n`);
  }
  output.push('## Details\n');
  result.details.forEach(detail => output.push(`- ${detail}`));
  return output.join('\n');
}

/**
 * Start the task tier. `featureRef` is required: numeric # or feature directory slug (PROJECT_PLAN).
 */
export async function taskStart(
  taskId: string,
  featureRef: string,
  options?: CommandExecutionOptions
): Promise<TierStartResult> {
  return runTierStart(TASK_CONFIG, { taskId, featureId: featureRef.trim() }, options);
}

export async function taskEnd(
  paramsOrId: TaskEndParams | string,
  featureRef?: string
): Promise<TierEndResult> {
  let params: TaskEndParams;
  if (typeof paramsOrId === 'string') {
    const raw = (featureRef ?? '').trim();
    if (!raw) {
      throw new Error(
        'taskEnd(taskId, featureRef): featureRef is required when using a string task id (numeric # or feature directory slug).'
      );
    }
    params = { taskId: paramsOrId, featureId: raw };
  } else {
    params = paramsOrId;
  }
  return runTierEnd(TASK_CONFIG, params);
}

export async function planTask(
  taskId: string,
  description?: string,
  featureId?: string
): Promise<string> {
  return runTierPlan(TASK_CONFIG, taskId, description, featureId);
}

export async function taskChange(
  params: TaskChangeRequestParams,
  featureRef: string
): Promise<TaskChangeRequestResult> {
  const parsed = WorkflowId.parseTaskId(params.taskId);
  if (!parsed) {
    throw new Error(`ERROR: Invalid task ID format. Expected X.Y.Z.A (e.g., 4.1.3.1)\nAttempted: ${params.taskId}`);
  }
  const result = await runTierChange(
    TASK_CONFIG,
    {
      identifier: params.taskId,
      description: params.description,
      scope: params.scope,
    },
    featureRef
  );
  return {
    success: result.success,
    changeRequest: result.changeRequest,
    scope: result.scope,
    actionPlan: result.actionPlan,
    logEntry: result.logEntry,
    output: result.output,
  };
}

/**
 * Append a task entry to the session log. Task is the tier below session (tierDown from session).
 */
export async function logTask(entry: TaskEntry, featureRef: string): Promise<void> {
  const { featureName: resolved } = await resolveWorkflowScope({
    mode: 'fromTierParams',
    tier: 'feature',
    params: { featureId: featureRef.trim() },
  });
  const formatted = formatTaskEntry(entry);
  const parsed = WorkflowId.parseTaskId(entry.id);
  const sessionId = parsed ? parsed.sessionId : undefined;
  await appendLog(formatted, sessionId, resolved);
}

export async function markTaskComplete(params: MarkTaskCompleteParams): Promise<string> {
  const output: string[] = [];
  const { featureName } = await resolveWorkflowScope({
    mode: 'fromTierParams',
    tier: 'feature',
    params: { featureId: params.featureId.trim() },
  });
  const context = new WorkflowCommandContext(featureName);
  const parsed = WorkflowId.parseTaskId(params.taskId);
  if (!parsed) {
    throw new Error(`ERROR: Invalid task ID format. Expected X.Y.Z.A (e.g., 4.1.3.1)\nAttempted: ${params.taskId}`);
  }
  const sessionId = parsed.sessionId;
  const sessionLogPath = context.paths.getSessionLogPath(sessionId);
  try {
    await context.documents.updateGuide(
      'session',
      sessionId,
      (guideContent) => {
        const taskPattern = new RegExp(`(- \\[ \\]|#### Task) (#### Task )?${params.taskId.replace(/\./g, '\\.')}:`, 'g');
        const updatedGuideContent = guideContent.replace(taskPattern, (match) => {
          if (match.includes('- [ ]')) {
            return match.replace('- [ ]', '- [x]');
          }
          return `- [x] #### Task ${params.taskId}:`;
        });
        const statusPattern = /(\*\*Status:\*\*)\s*(Not Started|Planning|In Progress|Partial|Blocked)/i;
        return updatedGuideContent.replace(statusPattern, (_match, label) => `${label} In Progress`);
      },
      { overwriteForTierEnd: true }
    );
    output.push(`✅ Updated session guide: ${context.paths.getSessionGuidePath(sessionId)}`);
    const logEntry: TaskEntry = {
      id: params.taskId,
      description: params.entry?.description || `Task ${params.taskId}`,
      goal: params.entry?.goal || 'Task completed',
      filesCreated: params.entry?.filesCreated || [],
      filesModified: params.entry?.filesModified || [],
      reactVueDifferences: params.entry?.reactVueDifferences,
      keyMethodsPorted: params.entry?.keyMethodsPorted || [],
      architectureNotes: params.entry?.architectureNotes || [],
      questionsAnswered: params.entry?.questionsAnswered || [],
      nextTask: params.entry?.nextTask || `Task ${parsed.feature}.${parsed.phase}.${parsed.session}.${parseInt(parsed.task) + 1}`,
    };
    let logContent = '';
    try {
      logContent = await readProjectFile(sessionLogPath);
    } catch (err) {
      console.warn('Task: session log not found, using template', sessionLogPath, err);
      const templatePath = join(PROJECT_ROOT, '.cursor/commands/tiers/session/templates/session-log.md');
      try {
        const template = await readFile(templatePath, 'utf-8');
        logContent = template
          .replace(/\[SESSION_ID\]/g, sessionId)
          .replace(/\[DESCRIPTION\]/g, 'Session Log')
          .replace(/\[Date\]/g, getCurrentDate());
      } catch (templateErr) {
        console.warn('Task: session log template not found, using default content', templatePath, templateErr);
        logContent = `# Session ${sessionId} Log\n\n**Status:** In Progress\n**Started:** ${getCurrentDate()}\n\n## Completed Tasks\n\n`;
      }
    }
    const formattedEntry = formatTaskEntry(logEntry);
    const completedTasksMarker = '## Completed Tasks';
    if (logContent.includes(completedTasksMarker)) {
      const sections = logContent.split(completedTasksMarker);
      logContent = sections[0] + completedTasksMarker + '\n\n' + formattedEntry + '\n' + sections.slice(1).join(completedTasksMarker);
    } else {
      logContent += `\n\n${completedTasksMarker}\n\n${formattedEntry}`;
    }
    const sessionLogMarker = getExcerptEndMarker('session');
    if (!logContent.includes(sessionLogMarker)) {
      logContent = logContent.trimEnd() + '\n\n' + sessionLogMarker;
    }
    await writeProjectFile(sessionLogPath, logContent);
    output.push(`✅ Updated session log: ${sessionLogPath}`);

    const handoffLines: string[] = [
      `# Task ${params.taskId} handoff`,
      '',
      `**Completed:** ${getCurrentDate()}`,
      `**Description:** ${logEntry.description}`,
      `**Goal:** ${logEntry.goal}`,
      '',
    ];
    if (logEntry.filesCreated.length > 0) {
      handoffLines.push('**Files created:**', ...logEntry.filesCreated.map((f) => `- ${f}`), '');
    }
    if (logEntry.filesModified.length > 0) {
      handoffLines.push('**Files modified:**', ...logEntry.filesModified.map((f) => `- ${f}`), '');
    }
    handoffLines.push(`**Next:** ${logEntry.nextTask}`, '', getExcerptEndMarker('task'));
    await context.documents.writeHandoff('task', params.taskId, handoffLines.join('\n'));
    output.push(`✅ Wrote task handoff: ${context.paths.getTaskHandoffPath(params.taskId)}`);

    return output.join('\n');
  } catch (_error) {
    const guidePath = context.paths.getSessionGuidePath(sessionId);
    const fullPath = join(PROJECT_ROOT, guidePath);
    throw new Error(
      `ERROR: Failed to mark task complete\n` +
      `Task ID: ${params.taskId}\n` +
      `Session Guide Path: ${guidePath}\n` +
      `Full Path: ${fullPath}\n` +
      `Tier: Task (Tier 3 - Low-Level)\n` +
      `Error Details: ${_error instanceof Error ? _error.message : String(_error)}\n` +
      `Suggestion: Verify task ID format and session guide exists`
    );
  }
}
