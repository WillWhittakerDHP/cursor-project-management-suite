/**
 * Atomic Command: /todo-activate-trigger [feature] [trigger] [context]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Activate a trigger and return citations to show
 */

import { activateTrigger } from "../../utils/todo-lookup-triggers";
import { TriggerDefinition } from "../../utils/todo-types";

export async function activateTriggerCommand(
  feature: string,
  trigger: TriggerDefinition,
  context: { todoId: string; [key: string]: unknown }
): Promise<string> {
  try {
    const result = await activateTrigger(feature, trigger, context);
    
    const lines: string[] = [];
    lines.push(`# Trigger Activated: ${trigger.name}`);
    lines.push(`**Priority:** ${result.priority}`);
    lines.push(`**Citations Found:** ${result.citations.length}`);
    lines.push('');
    
    if (result.citations.length === 0) {
      lines.push('⚠️ No citations found for this trigger');
    } else {
      lines.push('## Citations');
      for (const item of result.citations) {
        lines.push(`### Todo: ${item.todoId}`);
        lines.push(`**Citation Count:** ${item.citations.length}`);
        for (const citation of item.citations as Array<{ id: string; priority: string; type: string; changeLogId: string }>) {
          lines.push(`- **${citation.id}** (${citation.priority}): ${citation.type} - Change: ${citation.changeLogId}`);
        }
        lines.push('');
      }
    }
    
    return lines.join('\n');
  } catch (_error) {
    return `❌ Error activating trigger: ${_error instanceof Error ? _error.message : String(_error)}`;
  }
}

