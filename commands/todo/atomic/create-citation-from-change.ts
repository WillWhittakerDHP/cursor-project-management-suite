/**
 * Atomic Command: /todo-create-citation-from-change [feature] [todo-id] [change-log-id] [context]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Automatically create a citation from a change log entry
 */

import { createCitationFromChange } from "../../utils/todo-citations";
import { CitationContext } from "../../utils/todo-types";

export async function createCitationFromChangeCommand(
  feature: string,
  todoId: string,
  changeLogId: string,
  context: CitationContext[]
): Promise<string> {
  try {
    const citation = await createCitationFromChange(feature, todoId, changeLogId, context);
    
    if (!citation) {
      return `⚠️ Could not create citation from change log entry. Change log entry may not exist or may not be suitable for citation.`;
    }
    
    return `✅ Citation created from change: ${citation.id}\n**Todo:** ${todoId}\n**Change Log:** ${changeLogId}\n**Type:** ${citation.type}\n**Priority:** ${citation.priority}`;
  } catch (_error) {
    return `❌ Error creating citation from change: ${_error instanceof Error ? _error.message : String(_error)}`;
  }
}

