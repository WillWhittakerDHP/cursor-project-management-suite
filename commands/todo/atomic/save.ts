/**
 * Atomic Command: /todo-save [feature] [todo]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Save a todo with validation feedback
 */

import { saveTodo } from "../../utils/todo-io";
import { Todo } from "../../utils/todo-types";

export async function saveTodoCommand(feature: string, todo: Todo): Promise<string> {
  try {
    await saveTodo(feature, todo);
    return `✅ Todo saved: ${todo.id}\n**Title:** ${todo.title}\n**Status:** ${todo.status}`;
  } catch (_error) {
    return `❌ Error saving todo: ${_error instanceof Error ? _error.message : String(_error)}`;
  }
}

