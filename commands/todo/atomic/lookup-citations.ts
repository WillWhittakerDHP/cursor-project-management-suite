/**
 * Atomic Command: /todo-lookup-citations [feature] [todo-id] [context]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Lookup citations for a todo in a specific context
 */

import { lookupCitations } from "../../utils/todo-citations";
import { CitationContext } from "../../utils/todo-types";

export async function lookupCitationsCommand(
  feature: string,
  todoId: string,
  context: CitationContext
): Promise<string> {
  try {
    const citations = await lookupCitations(feature, todoId, context);
    
    if (citations.length === 0) {
      return `📋 No citations found for todo ${todoId} in context: ${context}`;
    }
    
    const lines: string[] = [];
    lines.push(`# Citations for Todo: ${todoId}`);
    lines.push(`**Context:** ${context}`);
    lines.push(`**Count:** ${citations.length}`);
    lines.push('');
    
    for (const citation of citations) {
      lines.push(`## Citation: ${citation.id}`);
      lines.push(`- **Type:** ${citation.type}`);
      lines.push(`- **Priority:** ${citation.priority}`);
      lines.push(`- **Change Log:** ${citation.changeLogId}`);
      lines.push(`- **Created:** ${new Date(citation.createdAt).toLocaleString()}`);
      lines.push(`- **Reviewed:** ${citation.reviewedAt ? new Date(citation.reviewedAt).toLocaleString() : 'Not reviewed'}`);
      if (citation.metadata?.reason) {
        lines.push(`- **Reason:** ${citation.metadata.reason}`);
      }
      if (citation.metadata?.impact) {
        lines.push(`- **Impact:** ${citation.metadata.impact}`);
      }
      lines.push('');
    }
    
    return lines.join('\n');
  } catch (_error) {
    return `❌ Error looking up citations: ${_error instanceof Error ? _error.message : String(_error)}`;
  }
}

