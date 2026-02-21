/**
 * Session checkpoint implementation. Used by tier-checkpoint and by session-checkpoint (thin wrapper).
 */

import { getCurrentDate } from '../../../utils/utils';
import { getAllTodos } from '../../../utils/todo-io';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { resolveFeatureName } from '../../../utils';

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
    const feature = context.feature.name;
    const allTodos = await getAllTodos(feature);
    const sessionTodoId = `session-${sessionId}`;
    const sessionTasks = allTodos.filter(todo =>
      todo.parentId === sessionTodoId && todo.tier === 'task'
    );

    const completedTasks = sessionTasks.filter(todo => todo.status === 'completed');
    const inProgressTasks = sessionTasks.filter(todo => todo.status === 'in_progress');
    const pendingTasks = sessionTasks.filter(todo => todo.status === 'pending');

    if (completedTasks.length > 0) {
      output.push('## Completed Tasks\n');
      for (const task of completedTasks) {
        output.push(`- ✅ **${task.id}**: ${task.title}`);
        if (task.completedAt) {
          output.push(` (Completed: ${new Date(task.completedAt).toLocaleDateString()})`);
        }
        output.push('\n');
      }
      output.push('\n---\n');
    }
    if (inProgressTasks.length > 0) {
      output.push('## Tasks In Progress\n');
      for (const task of inProgressTasks) {
        output.push(`- 🔄 **${task.id}**: ${task.title}\n`);
      }
      output.push('\n---\n');
    }
    if (pendingTasks.length > 0) {
      output.push('## Pending Tasks\n');
      for (const task of pendingTasks) {
        output.push(`- ⏳ **${task.id}**: ${task.title}\n`);
      }
      output.push('\n---\n');
    }
    if (sessionTasks.length === 0) {
      output.push('## Tasks\n');
      output.push('**No tasks found for this session.**\n');
      output.push('**Suggestion:** Use `/plan-task [X.Y.Z] [description]` to create tasks for this session\n');
      output.push('\n---\n');
    }

    const sessionTodo = allTodos.find(t => t.id === sessionTodoId);
    if (sessionTodo) {
      output.push('## Session Status\n');
      output.push(`**Status:** ${sessionTodo.status}\n`);
      output.push(`**Title:** ${sessionTodo.title}\n`);
      if (sessionTodo.description) output.push(`**Description:** ${sessionTodo.description}\n`);
      output.push('\n---\n');
    }
  } catch (_error) {
    output.push('## Tasks\n');
    output.push(`**WARNING: Could not load todos from todo management system**\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push(`**Suggestion:** Ensure todo files exist in \`${context.paths.getBasePath()}/todos/\`\n`);
    output.push('\n---\n');
  }

  output.push('## Session Progress Review\n');
  output.push('**Review:**\n');
  output.push('- Tasks completed in this session\n');
  output.push('- Concepts learned\n');
  output.push('- Next tasks to work on\n');

  return output.join('\n');
}
