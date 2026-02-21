/**
 * Atomic Command: /todo-find [feature] [todo-id]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Find a todo by ID and return formatted output
 */

import { findTodoById } from "../../utils/todo-io";
import { Todo } from "../../utils/todo-types";

export async function findTodo(feature: string, todoId: string): Promise<string> {
  try {
    const todo = await findTodoById(feature, todoId);
    
    if (!todo) {
      return `❌ Todo not found: ${todoId}`;
    }
    
    return formatTodo(todo);
  } catch (_error) {
    return `❌ Error finding todo: ${_error instanceof Error ? _error.message : String(_error)}`;
  }
}

function formatTodo(todo: Todo): string {
  const lines: string[] = [];
  
  lines.push(`# Todo: ${todo.id}`);
  lines.push(`**Title:** ${todo.title}`);
  lines.push(`**Status:** ${todo.status}`);
  lines.push(`**Tier:** ${todo.tier}`);
  
  if (todo.description) {
    lines.push(`**Description:** ${todo.description}`);
  }
  
  if (todo.parentId) {
    lines.push(`**Parent:** ${todo.parentId}`);
  }
  
  if (todo.planningDocPath) {
    lines.push(`**Planning Doc:** ${todo.planningDocPath}`);
  }
  
  if (todo.createdAt) {
    lines.push(`**Created:** ${new Date(todo.createdAt).toLocaleString()}`);
  }
  
  if (todo.updatedAt) {
    lines.push(`**Updated:** ${new Date(todo.updatedAt).toLocaleString()}`);
  }
  
  if (todo.completedAt) {
    lines.push(`**Completed:** ${new Date(todo.completedAt).toLocaleString()}`);
  }
  
  if (todo.tags && todo.tags.length > 0) {
    lines.push(`**Tags:** ${todo.tags.join(', ')}`);
  }
  
  if (todo.citations && todo.citations.length > 0) {
    lines.push(`**Citations:** ${todo.citations.length} citation(s)`);
  }
  
  return lines.join('\n');
}

