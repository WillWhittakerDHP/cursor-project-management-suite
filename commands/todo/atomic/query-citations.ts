/**
 * Atomic Command: /todo-query-citations [feature] [filters]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Query citations with various filters
 */

import { queryCitations } from "../../utils/todo-citations';
import { CitationType, CitationPriority, CitationContext } from "../../utils/todo-types';

export async function queryCitationsCommand(
  feature: string,
  filters: {
    todoId?: string;
    changeLogId?: string;
    type?: CitationType;
    priority?: CitationPriority;
    context?: CitationContext;
    unreviewed?: boolean;
  }
): Promise<string> {
  try {
    const citations = await queryCitations(feature, filters);
    
    if (citations.length === 0) {
      return `📋 No citations found matching filters`;
    }
    
    const lines: string[] = [];
    lines.push(`# Query Results: ${citations.length} citation(s)`);
    lines.push('');
    lines.push('## Filters Applied');
    if (filters.todoId) lines.push(`- Todo ID: ${filters.todoId}`);
    if (filters.changeLogId) lines.push(`- Change Log ID: ${filters.changeLogId}`);
    if (filters.type) lines.push(`- Type: ${filters.type}`);
    if (filters.priority) lines.push(`- Priority: ${filters.priority}`);
    if (filters.context) lines.push(`- Context: ${filters.context}`);
    if (filters.unreviewed !== undefined) lines.push(`- Unreviewed: ${filters.unreviewed}`);
    lines.push('');
    lines.push('## Citations');
    
    for (const citation of citations) {
      lines.push(`- **${citation.id}** (${citation.priority}): ${citation.type} - Change: ${citation.changeLogId}`);
    }
    
    return lines.join('\n');
  } catch (error) {
    return `❌ Error querying citations: ${error instanceof Error ? error.message : String(error)}`;
  }
}

