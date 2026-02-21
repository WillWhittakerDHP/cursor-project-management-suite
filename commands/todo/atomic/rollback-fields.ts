/**
 * Atomic Command: /todo-rollback-fields [feature] [todo-id] [state-id] [fields] [reason]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Rollback specific fields of a todo to a previous state
 */

import { rollbackFields } from "../../utils/todo-rollback";

export async function rollbackFieldsCommand(
  feature: string,
  todoId: string,
  stateId: string,
  fields: string[],
  reason?: string
): Promise<string> {
  try {
    const rollbackResult = await rollbackFields(feature, todoId, stateId, fields, reason);
    
    const lines: string[] = [];
    lines.push(`# Selective Rollback: ${rollbackResult.id}`);
    lines.push(`**Status:** ${rollbackResult.status}`);
    lines.push(`**Todo:** ${todoId}`);
    lines.push(`**Rolled back to:** ${stateId}`);
    lines.push(`**Fields:** ${fields.join(', ')}`);
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
      lines.push('✅ Selective rollback completed successfully');
    } else if (rollbackResult.status === 'conflict') {
      lines.push('');
      lines.push('⚠️ Rollback blocked due to conflicts. Review conflicts above.');
    }
    
    return lines.join('\n');
  } catch (_error) {
    return `❌ Error rolling back fields: ${_error instanceof Error ? _error.message : String(_error)}`;
  }
}

