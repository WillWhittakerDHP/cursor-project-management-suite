/**
 * Task-start implementation. Used by tier-start and by task-start (thin wrapper).
 */

import { readHandoff } from '../../../utils/read-handoff';
import type { Todo } from '../../../utils/todo-types';
import { findTodoById } from '../../../utils/todo-io';
import { lookupCitations } from '../../../utils/todo-citations';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { WorkflowId } from '../../../utils/id-utils';
import { extractFilePaths, gatherFileStatuses } from '../../../utils/context-gatherer';
import { formatFileStatusList } from '../../../utils/context-templates';
import { CommandExecutionOptions, isPlanMode, resolveCommandExecutionMode } from '../../../utils/command-execution-mode';
import { formatPlanModePreview } from '../../../utils/tier-start-utils';
import { resolveFeatureName, resolveFeatureId } from '../../../utils/feature-context';
import { runTierPlan } from '../../shared/tier-plan';
import { TASK_CONFIG } from '../../configs/task';

export async function taskStartImpl(
  taskId: string,
  featureId?: string,
  options?: CommandExecutionOptions
): Promise<string> {
  const resolvedFeatureName = featureId != null && featureId.trim() !== ''
    ? await resolveFeatureId(featureId)
    : await resolveFeatureName();
  const context = new WorkflowCommandContext(resolvedFeatureName);
  const mode = resolveCommandExecutionMode(options);
  const output: string[] = [];

  output.push(`# Task Start: ${taskId}\n`);
  output.push('---\n');

  const parsed = WorkflowId.parseTaskId(taskId);
  if (!parsed) {
    return 'Error: Invalid task ID format. Expected X.Y.Z.A (e.g., 4.1.3.1)';
  }

  const sessionId = parsed.sessionId;
  const feature = resolvedFeatureName;

  if (isPlanMode(mode)) {
    const taskTodoId = `session-${sessionId}-${parsed.task}`;
    const sessionGuidePath = context.paths.getSessionGuidePath(sessionId);
    const sessionHandoffPath = context.paths.getSessionHandoffPath(sessionId);
    const sessionLogPath = context.paths.getSessionLogPath(sessionId);
    const planSteps = [
      `Todo: lookup task todo by id: \`${taskTodoId}\` (feature: \`${feature}\`)`,
      `Todo: lookup citations for \`${taskTodoId}\` (junction: task-start)`,
      `Docs: read task handoff context (from session handoff): \`${sessionHandoffPath}\``,
      `Docs: read session guide (fallback task parsing): \`${sessionGuidePath}\``,
      `Docs: (reference) session log path (task updates happen at task-end): \`${sessionLogPath}\``,
      'Output: show task details, citations, and auto-gathered file context (if present)',
    ];
    output.push(formatPlanModePreview(planSteps, { intro: 'This is a deterministic preview. No todo reads, file reads, or git operations will be executed.' }));
    return output.join('\n');
  }

  const taskTodoId = `session-${sessionId}-${parsed.task}`;
  let taskTodo: Todo | null = null;

  try {
    taskTodo = await findTodoById(feature, taskTodoId);
  } catch (err) {
    console.warn('Task start: failed to load task todo', taskTodoId, err);
  }

  if (taskTodo) {
    output.push('## Task Details\n');
    output.push(`**Title:** ${taskTodo.title}\n`);
    output.push(`**Status:** ${taskTodo.status}\n`);
    if (taskTodo.description) output.push(`**Description:** ${taskTodo.description}\n`);
    if (taskTodo.planningDocPath) output.push(`**Planning Doc:** ${taskTodo.planningDocPath}\n`);
    if (taskTodo.tags?.length) output.push(`**Tags:** ${taskTodo.tags.join(', ')}\n`);
    output.push('\n---\n');

    try {
      const citations = await lookupCitations(feature, taskTodoId, 'task-start');
      if (citations.length > 0) {
        output.push('## Citations\n');
        output.push(`**Found ${citations.length} citation(s) for review:**\n`);
        for (const citation of citations) {
          output.push(`- **${citation.priority.toUpperCase()}** (${citation.type}): Change ${citation.changeLogId}\n`);
          if (citation.metadata?.reason) output.push(`  - Reason: ${citation.metadata.reason}\n`);
        }
        output.push('\n---\n');
      }
    } catch (err) {
      console.warn('Task start: could not read session handoff', sessionId, err);
    }
  } else {
    output.push('## Task Details\n');
    output.push(`**WARNING: Task todo not found: ${taskTodoId}**\n`);
    output.push(`**Suggestion:** Use \`/plan-task ${taskId} [description]\` to create task todo\n`);
    output.push('\n---\n');
  }

  try {
    const handoffContent = await readHandoff('task', taskId);
    output.push('## Task Handoff Context\n');
    output.push(handoffContent);
    output.push('\n---\n');
  } catch (err) {
    console.warn('Task start: handoff context not available', sessionId, err);
    output.push('## Task Handoff Context\n');
    output.push(`**Note:** Handoff context not available. Use \`/read-handoff session ${sessionId}\` to check session context\n`);
    output.push('\n---\n');
  }

  let taskSectionContent = '';
  if (!taskTodo) {
    try {
      const sessionGuideContent = await context.readSessionGuide(sessionId);
      const taskSectionPattern = new RegExp(`### Task ${taskId.replace('.', '\\.')}:.*?(?=### Task|##|$)`, 's');
      const taskSectionMatch = sessionGuideContent.match(taskSectionPattern);
      if (taskSectionMatch) {
        taskSectionContent = taskSectionMatch[0];
        output.push('## Task Context (from guide)\n');
        output.push(taskSectionContent);
        output.push('\n---\n');
      }
    } catch (err) {
      console.warn('Task start: failed to read session guide for task context', sessionId, err);
    }
  } else if (taskTodo.description) {
    taskSectionContent = taskTodo.description;
  }

  try {
    if (taskSectionContent) {
      const filePaths = extractFilePaths(taskSectionContent);
      if (filePaths.length > 0) {
        const fileStatuses = await gatherFileStatuses(filePaths);
        const reactFiles = fileStatuses.filter(f => f.isReact);
        const vueFiles = fileStatuses.filter(f => f.isVue);
        if (reactFiles.length > 0 || vueFiles.length > 0) {
          output.push('## Auto-Gathered Context\n');
          output.push('**Files mentioned in task:**\n');
          if (reactFiles.length > 0) {
            output.push('\n**React Source Files:**');
            output.push(formatFileStatusList(reactFiles));
          }
          if (vueFiles.length > 0) {
            output.push('\n**Vue Target Files:**');
            output.push(formatFileStatusList(vueFiles));
          }
          output.push('\n---\n');
        }
      }
    }
  } catch (err) {
    console.warn('Task start: failed to gather file statuses from task section', err);
  }

  output.push('\n---\n\n');
  output.push('## Plan (same tier)\n\n');
  try {
    const planOutput = await runTierPlan(TASK_CONFIG, taskId, undefined, undefined);
    if (planOutput) {
      output.push(planOutput);
      output.push('\n---\n\n');
    }
  } catch (planError) {
    console.warn('Task start: plan step skipped', planError);
    output.push(`> Plan step skipped: ${planError instanceof Error ? planError.message : String(planError)}\n\n---\n\n`);
  }

  output.push('## Ready to Start\n');
  output.push('**Begin working on task:** ' + taskId + '\n');

  return output.join('\n');
}
