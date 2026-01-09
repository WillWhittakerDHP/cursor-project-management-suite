/**
 * Composite Command: /todo-create-citations-for-change [feature] [change-log-id] [affected-todo-ids] [context]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Create citations for multiple todos from a planning doc change
 */

import { createCitationsForPlanningDocChange } from "../../utils/todo-citations';
import { CitationContext } from "../../utils/todo-types';

export async function createCitationsForChange(
  feature: string,
  changeLogId: string,
  affectedTodoIds: string[],
  context: CitationContext[]
): Promise<string> {
  try {
    const citations = await createCitationsForPlanningDocChange(feature, changeLogId, affectedTodoIds, context);
    
    if (citations.length === 0) {
      return `⚠️ No citations created. Change log entry may not exist or may not be suitable for citations.`;
    }
    
    const lines: string[] = [];
    lines.push(`✅ Created ${citations.length} citation(s) for planning doc change`);
    lines.push('');
    lines.push('## Change Details');
    lines.push(`- **Change Log ID:** ${changeLogId}`);
    lines.push(`- **Affected Todos:** ${affectedTodoIds.length}`);
    lines.push(`- **Context:** ${context.join(', ')}`);
    lines.push('');
    lines.push('## Citations Created');
    
    for (const citation of citations) {
      lines.push(`- **${citation.id}** (${citation.priority}): ${citation.type}`);
    }
    
    return lines.join('\n');
  } catch (error) {
    return `❌ Error creating citations for change: ${error instanceof Error ? error.message : String(error)}`;
  }
}

