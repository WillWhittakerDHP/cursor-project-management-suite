/**
 * Atomic Command: /todo-get-rollback-history [feature] [todo-id?]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Get rollback history for a feature or specific todo
 */

import { getRollbackHistory } from "../../utils/todo-rollback";

export async function getRollbackHistoryCommand(feature: string, todoId?: string): Promise<string> {
  try {
    const rollbacks = await getRollbackHistory(feature, todoId);
    
    if (rollbacks.length === 0) {
      return `📋 No rollback history found${todoId ? ` for todo: ${todoId}` : ` for feature: ${feature}`}`;
    }
    
    const lines: string[] = [];
    lines.push(`# Rollback History${todoId ? ` for Todo: ${todoId}` : ` for Feature: ${feature}`}`);
    lines.push(`**Count:** ${rollbacks.length}`);
    lines.push('');
    
    for (const rollback of rollbacks) {
      lines.push(`## Rollback: ${rollback.id}`);
      lines.push(`- **Status:** ${rollback.status}`);
      lines.push(`- **Todo:** ${rollback.todoId}`);
      lines.push(`- **Type:** ${rollback.type}`);
      lines.push(`- **Rolled back to:** ${rollback.rolledBackTo}`);
      lines.push(`- **Rolled back from:** ${rollback.rolledBackFrom}`);
      lines.push(`- **Timestamp:** ${new Date(rollback.timestamp).toLocaleString()}`);
      lines.push(`- **Author:** ${rollback.author}`);
      
      if (rollback.reason) {
        lines.push(`- **Reason:** ${rollback.reason}`);
      }
      
      if (rollback.fields && rollback.fields.length > 0) {
        lines.push(`- **Fields:** ${rollback.fields.join(', ')}`);
      }
      
      if (rollback.conflicts && rollback.conflicts.length > 0) {
        lines.push(`- **Conflicts:** ${rollback.conflicts.length} conflict(s)`);
      }
      
      lines.push('');
    }
    
    return lines.join('\n');
  } catch (_error) {
    return `❌ Error getting rollback history: ${_error instanceof Error ? _error.message : String(_error)}`;
  }
}

