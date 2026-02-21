/**
 * Atomic Command: /todo-create-citation [feature] [todo-id] [change-log-id] [type] [context] [priority]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Create a citation linking a todo to a change log entry
 */

import { createCitation } from "../../utils/todo-citations";
import { CitationType, CitationContext, CitationPriority } from "../../utils/todo-types";

export async function createCitationCommand(
  feature: string,
  todoId: string,
  changeLogId: string,
  type: CitationType,
  context: CitationContext[],
  priority: CitationPriority,
  metadata?: { reason?: string; impact?: string; affectedTodos?: string[]; requiresReview?: boolean; reviewDeadline?: string }
): Promise<string> {
  try {
    const citation = await createCitation(feature, todoId, changeLogId, type, context, priority, metadata);
    return `✅ Citation created: ${citation.id}\n**Todo:** ${todoId}\n**Change Log:** ${changeLogId}\n**Type:** ${type}\n**Priority:** ${priority}\n**Context:** ${context.join(', ')}`;
  } catch (_error) {
    return `❌ Error creating citation: ${_error instanceof Error ? _error.message : String(_error)}`;
  }
}

