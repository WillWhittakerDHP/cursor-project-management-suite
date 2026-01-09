/**
 * Atomic Command: /todo-review-citation [feature] [todo-id] [citation-id]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Mark a citation as reviewed
 */

import { reviewCitation } from "../../utils/todo-citations';

export async function reviewCitationCommand(
  feature: string,
  todoId: string,
  citationId: string
): Promise<string> {
  try {
    await reviewCitation(feature, todoId, citationId);
    return `✅ Citation reviewed: ${citationId}\n**Todo:** ${todoId}\n**Reviewed at:** ${new Date().toISOString()}`;
  } catch (error) {
    return `❌ Error reviewing citation: ${error instanceof Error ? error.message : String(error)}`;
  }
}

