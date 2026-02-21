/**
 * Atomic Command: /todo-store-state [feature] [todo] [change-log-id] [reason]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Store a snapshot of a todo's current state for rollback purposes
 */

import { storePreviousState } from "../../utils/todo-rollback";
import { Todo } from "../../utils/todo-types";

export async function storeState(
  feature: string,
  todo: Todo,
  changeLogId: string,
  reason?: string
): Promise<string> {
  try {
    const state = await storePreviousState(feature, todo, changeLogId, reason);
    return `✅ State stored: ${state.id}\n**Todo:** ${todo.id}\n**Change Log:** ${changeLogId}\n**Timestamp:** ${new Date(state.timestamp).toLocaleString()}${reason ? `\n**Reason:** ${reason}` : ''}`;
  } catch (_error) {
    return `❌ Error storing state: ${_error instanceof Error ? _error.message : String(_error)}`;
  }
}

