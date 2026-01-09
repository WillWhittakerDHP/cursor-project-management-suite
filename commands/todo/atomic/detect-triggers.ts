/**
 * Atomic Command: /todo-detect-triggers [feature] [junction] [context]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Detect triggers for a specific workflow junction
 */

import { detectTriggers } from "../../utils/todo-lookup-triggers';
import { CitationContext } from "../../utils/todo-types';

export async function detectTriggersCommand(
  feature: string,
  junction: CitationContext,
  context: { todoId?: string; [key: string]: unknown }
): Promise<string> {
  try {
    const triggers = await detectTriggers(feature, junction, context);
    
    if (triggers.length === 0) {
      return `📋 No active triggers detected for junction: ${junction}`;
    }
    
    const lines: string[] = [];
    lines.push(`# Active Triggers for Junction: ${junction}`);
    lines.push(`**Count:** ${triggers.length}`);
    lines.push('');
    
    for (const trigger of triggers) {
      lines.push(`## Trigger: ${trigger.name} (${trigger.id})`);
      lines.push(`- **Priority:** ${trigger.priority}`);
      lines.push(`- **Action:** ${trigger.action}`);
      lines.push(`- **Suppressible:** ${trigger.suppressible ? 'Yes' : 'No'}`);
      lines.push(`- **Conditions:** ${trigger.conditions.length} condition(s)`);
      for (const condition of trigger.conditions) {
        lines.push(`  - ${condition.type}`);
      }
      lines.push('');
    }
    
    return lines.join('\n');
  } catch (error) {
    return `❌ Error detecting triggers: ${error instanceof Error ? error.message : String(error)}`;
  }
}

