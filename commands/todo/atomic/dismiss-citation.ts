/**
 * Atomic Command: /todo-dismiss-citation [feature] [todo-id] [citation-id]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Dismiss a citation (mark as reviewed and don't show again)
 */

import { dismissCitation } from "../../utils/todo-citations';

export async function dismissCitationCommand(
  feature: string,
  todoId: string,
  citationId: string
): Promise<string> {
  try {
    await dismissCitation(feature, todoId, citationId);
    return `✅ Citation dismissed: ${citationId}\n**Todo:** ${todoId}\n**Dismissed at:** ${new Date().toISOString()}`;
  } catch (error) {
    return `❌ Error dismissing citation: ${error instanceof Error ? error.message : String(error)}`;
  }
}

