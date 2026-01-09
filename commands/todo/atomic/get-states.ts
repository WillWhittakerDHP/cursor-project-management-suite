/**
 * Atomic Command: /todo-get-states [feature] [todo-id]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Get all available rollback states for a todo
 */

import { getAvailableStates } from "../../utils/todo-rollback';

export async function getStates(feature: string, todoId: string): Promise<string> {
  try {
    const states = await getAvailableStates(feature, todoId);
    
    if (states.length === 0) {
      return `📋 No rollback states available for todo: ${todoId}`;
    }
    
    const lines: string[] = [];
    lines.push(`# Available States for Todo: ${todoId}`);
    lines.push(`**Count:** ${states.length}`);
    lines.push('');
    
    for (const state of states) {
      lines.push(`## State: ${state.id}`);
      lines.push(`- **Timestamp:** ${new Date(state.timestamp).toLocaleString()}`);
      lines.push(`- **Change Log:** ${state.changeLogId}`);
      if (state.metadata?.reason) {
        lines.push(`- **Reason:** ${state.metadata.reason}`);
      }
      lines.push(`- **Todo Status:** ${state.state.status}`);
      lines.push('');
    }
    
    return lines.join('\n');
  } catch (error) {
    return `❌ Error getting states: ${error instanceof Error ? error.message : String(error)}`;
  }
}

