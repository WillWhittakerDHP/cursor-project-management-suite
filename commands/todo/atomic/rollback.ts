/**
 * Atomic Command: /todo-rollback [feature] [todo-id] [state-id] [reason]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Rollback a todo to a previous state
 */

import { rollbackToState } from "../../utils/todo-rollback";

export async function rollback(feature: string, todoId: string, stateId: string, reason?: string): Promise<string> {
  try {
    const rollbackResult = await rollbackToState(feature, todoId, stateId, reason);
    
    const lines: string[] = [];
    lines.push(`# Rollback Operation: ${rollbackResult.id}`);
    lines.push(`**Status:** ${rollbackResult.status}`);
    lines.push(`**Todo:** ${todoId}`);
    lines.push(`**Rolled back to:** ${stateId}`);
    lines.push(`**Rolled back from:** ${rollbackResult.rolledBackFrom}`);
    lines.push(`**Type:** ${rollbackResult.type}`);
    lines.push(`**Timestamp:** ${new Date(rollbackResult.timestamp).toLocaleString()}`);
    
    if (rollbackResult.reason) {
      lines.push(`**Reason:** ${rollbackResult.reason}`);
    }
    
    if (rollbackResult.conflicts && rollbackResult.conflicts.length > 0) {
      lines.push('');
      lines.push('## Conflicts Detected');
      for (const conflict of rollbackResult.conflicts) {
        lines.push(`- **${conflict.type}** (${conflict.severity}): ${conflict.description}`);
      }
    }
    
    if (rollbackResult.status === 'completed') {
      lines.push('');
      lines.push('✅ Rollback completed successfully');
    } else if (rollbackResult.status === 'conflict') {
      lines.push('');
      lines.push('⚠️ Rollback blocked due to conflicts. Review conflicts above.');
    }
    
    return lines.join('\n');
  } catch (_error) {
    return `❌ Error rolling back: ${_error instanceof Error ? _error.message : String(_error)}`;
  }
}

