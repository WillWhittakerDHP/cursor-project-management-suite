/**
 * Composite Command: /session-checkpoint [X.Y]
 * Mid-session review after completing tasks
 * 
 * Tier: Session (Tier 2 - Medium-Level)
 * Operates on: Session-level checkpoints (after completing tasks)
 * 
 * TODO MANAGEMENT INTEGRATION: This command should use todo management status tracking
 * instead of parsing logs directly. Use todo commands from `.cursor/commands/todo/` for integration.
 * Status should be loaded using `findTodo()` or `getAllTodosCommand()` instead of extracting from logs.
 * 
 * @param sessionId Session ID in format X.Y (e.g., "2.1")
 * @param featureName Optional feature name (defaults to "vue-migration" for backward compatibility)
 */

import { getCurrentDate } from '../../../utils/utils';
import { getAllTodos } from '../../../utils/todo-io';
import { Todo } from '../../../utils/todo-types';
import { WorkflowCommandContext } from '../../../utils/command-context';

export async function sessionCheckpoint(
  sessionId: string,
  featureName: string = 'vue-migration'
): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  output.push(`# Session ${sessionId} Checkpoint\n`);
  output.push(`**Date:** ${getCurrentDate()}\n`);
  output.push('---\n');
  
  // Use todo management to get completed tasks
  try {
    const feature = context.feature.name;
    const allTodos = await getAllTodos(feature);
    
    // Filter for tasks in this session
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
          const completedDate = new Date(task.completedAt).toLocaleDateString();
          output.push(` (Completed: ${completedDate})`);
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
    
    // Get session todo status
    const sessionTodo = allTodos.find(t => t.id === sessionTodoId);
    if (sessionTodo) {
      output.push('## Session Status\n');
      output.push(`**Status:** ${sessionTodo.status}\n`);
      output.push(`**Title:** ${sessionTodo.title}\n`);
      if (sessionTodo.description) {
        output.push(`**Description:** ${sessionTodo.description}\n`);
      }
      output.push('\n---\n');
    }
    
  } catch (error) {
    output.push('## Tasks\n');
    output.push(`**WARNING: Could not load todos from todo management system**\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    const context = new WorkflowCommandContext(feature);
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

