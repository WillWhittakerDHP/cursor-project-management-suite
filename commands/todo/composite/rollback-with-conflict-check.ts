/**
 * Composite Command: /todo-rollback-with-conflict-check [feature] [todo-id] [state-id] [reason?]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Composite workflow: detect conflicts → rollback → log
 */

import { rollbackToState } from "../../utils/todo-rollback';
import { detectConflicts } from "../../utils/todo-rollback';
import { findTodoById } from "../../utils/todo-io';
import { getPreviousState } from "../../utils/todo-rollback';

export async function rollbackWithConflictCheck(
  feature: string,
  todoId: string,
  stateId: string,
  reason?: string
): Promise<string> {
  try {
    // Get current todo and previous state
    const todo = await findTodoById(feature, todoId);
    if (!todo) {
      return `❌ Todo not found: ${todoId}`;
    }
    
    const previousState = await getPreviousState(feature, stateId);
    if (!previousState) {
      return `❌ Previous state not found: ${stateId}`;
    }
    
    // Detect conflicts first
    const conflicts = await detectConflicts(todo, previousState.state);
    
    const lines: string[] = [];
    lines.push(`# Rollback with Conflict Check: ${todoId}`);
    lines.push('');
    
    if (conflicts.length > 0) {
      lines.push('## ⚠️ Conflicts Detected');
      for (const conflict of conflicts) {
        lines.push(`- **${conflict.type}** (${conflict.severity}): ${conflict.description}`);
      }
      lines.push('');
      lines.push('⚠️ Rollback blocked due to conflicts. Please resolve conflicts before proceeding.');
      return lines.join('\n');
    }
    
    // Proceed with rollback
    const rollbackResult = await rollbackToState(feature, todoId, stateId, reason);
    
    lines.push('✅ No conflicts detected. Rollback proceeding...');
    lines.push('');
    lines.push('## Rollback Result');
    lines.push(`- **Rollback ID:** ${rollbackResult.id}`);
    lines.push(`- **Status:** ${rollbackResult.status}`);
    lines.push(`- **Type:** ${rollbackResult.type}`);
    lines.push(`- **Timestamp:** ${new Date(rollbackResult.timestamp).toLocaleString()}`);
    
    if (rollbackResult.status === 'completed') {
      lines.push('');
      lines.push('✅ Rollback completed successfully');
    }
    
    return lines.join('\n');
  } catch (error) {
    return `❌ Error in rollback with conflict check: ${error instanceof Error ? error.message : String(error)}`;
  }
}

