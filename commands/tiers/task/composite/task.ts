/**
 * Task tier composite: all task-level commands.
 */

import { runTierStart } from '../../shared/tier-start';
import { runTierEnd } from '../../shared/tier-end';
import { runTierPlan } from '../../shared/tier-plan';
import { runTierChange } from '../../shared/tier-change';
import { TASK_CONFIG } from '../../configs/task';
import type { CommandExecutionOptions } from '../../../utils/command-execution-mode';
import type { TaskEndParams } from './task-end-impl';
import type { ChangeRequest, ChangeScope } from '../../../utils/utils';
import { WorkflowId } from '../../../utils/id-utils';
import { formatTaskEntry, type TaskEntry } from '../atomic/format-task-entry';
import { appendLog } from '../../../utils/append-log';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { resolveFeatureName, resolveFeatureId } from '../../../utils/feature-context';
import { readProjectFile, writeProjectFile, PROJECT_ROOT, getCurrentDate } from '../../../utils/utils';
import { join } from 'path';
import { readFile } from 'fs/promises';

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
  featureId?: string;
}

export async function taskStart(
  taskId: string,
  featureId?: string,
  options?: CommandExecutionOptions
): Promise<string> {
  return runTierStart(TASK_CONFIG, { taskId, featureId }, options);
}

export async function taskEnd(params: TaskEndParams): Promise<{ success: boolean; output: string }> {
  return runTierEnd(TASK_CONFIG, params) as Promise<{ success: boolean; output: string }>;
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
  featureName?: string
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
    featureName
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
export async function logTask(entry: TaskEntry, featureId?: string): Promise<void> {
  const resolved = featureId != null && featureId.trim() !== ''
    ? await resolveFeatureId(featureId)
    : await resolveFeatureName();
  const formatted = formatTaskEntry(entry);
  const parsed = WorkflowId.parseTaskId(entry.id);
  const sessionId = parsed ? parsed.sessionId : undefined;
  await appendLog(formatted, sessionId, resolved);
}

export async function markTaskComplete(params: MarkTaskCompleteParams): Promise<string> {
  const output: string[] = [];
  const featureName = params.featureId != null && params.featureId.trim() !== ''
    ? await resolveFeatureId(params.featureId)
    : await resolveFeatureName();
  const context = new WorkflowCommandContext(featureName);
  const parsed = WorkflowId.parseTaskId(params.taskId);
  if (!parsed) {
    throw new Error(`ERROR: Invalid task ID format. Expected X.Y.Z.A (e.g., 4.1.3.1)\nAttempted: ${params.taskId}`);
  }
  const sessionId = parsed.sessionId;
  const sessionGuidePath = context.paths.getSessionGuidePath(sessionId);
  const sessionLogPath = context.paths.getSessionLogPath(sessionId);
  try {
    const guideContent = await readProjectFile(sessionGuidePath);
    const taskPattern = new RegExp(`(- \\[ \\]|#### Task) (#### Task )?${params.taskId.replace(/\./g, '\\.')}:`, 'g');
    const updatedGuideContent = guideContent.replace(taskPattern, (match) => {
      if (match.includes('- [ ]')) {
        return match.replace('- [ ]', '- [x]');
      }
      return `- [x] #### Task ${params.taskId}:`;
    });
    const statusPattern = /(\*\*Status:\*\*)\s*(Not Started|Planning|In Progress|Partial|Blocked)/i;
    const updatedWithStatus = updatedGuideContent.replace(statusPattern, (_match, label) => `${label} In Progress`);
    await writeProjectFile(sessionGuidePath, updatedWithStatus);
    output.push(`✅ Updated session guide: ${sessionGuidePath}`);
    const logEntry: TaskEntry = {
      id: params.taskId,
      description: params.entry?.description || `Task ${params.taskId}`,
      goal: params.entry?.goal || 'Task completed',
      filesCreated: params.entry?.filesCreated || [],
      filesModified: params.entry?.filesModified || [],
      vueConceptsLearned: params.entry?.vueConceptsLearned || [],
      reactVueDifferences: params.entry?.reactVueDifferences,
      keyMethodsPorted: params.entry?.keyMethodsPorted || [],
      architectureNotes: params.entry?.architectureNotes || [],
      learningCheckpoint: params.entry?.learningCheckpoint || [],
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
    await writeProjectFile(sessionLogPath, logContent);
    output.push(`✅ Updated session log: ${sessionLogPath}`);
    return output.join('\n');
  } catch (_error) {
    const fullPath = join(PROJECT_ROOT, sessionGuidePath);
    throw new Error(
      `ERROR: Failed to mark task complete\n` +
      `Task ID: ${params.taskId}\n` +
      `Session Guide Path: ${sessionGuidePath}\n` +
      `Full Path: ${fullPath}\n` +
      `Tier: Task (Tier 3 - Low-Level)\n` +
      `Error Details: ${_error instanceof Error ? _error.message : String(_error)}\n` +
      `Suggestion: Verify task ID format and session guide exists`
    );
  }
}
