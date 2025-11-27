/**
 * Atomic Command: /todo-suppress-trigger [feature] [trigger-id] [duration-hours]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Suppress a trigger temporarily
 */

import { suppressTrigger } from "../../utils/todo-lookup-triggers';

export async function suppressTriggerCommand(
  feature: string,
  triggerId: string,
  durationHours: number = 1
): Promise<string> {
  try {
    await suppressTrigger(feature, triggerId, durationHours);
    const suppressedUntil = new Date();
    suppressedUntil.setHours(suppressedUntil.getHours() + durationHours);
    
    return `✅ Trigger suppressed: ${triggerId}\n**Duration:** ${durationHours} hour(s)\n**Suppressed until:** ${suppressedUntil.toLocaleString()}`;
  } catch (error) {
    return `❌ Error suppressing trigger: ${error instanceof Error ? error.message : String(error)}`;
  }
}

