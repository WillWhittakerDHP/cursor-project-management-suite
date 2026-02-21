/**
 * Atomic Command: /status-query-citations [tier] [identifier]
 * Query citations for tier
 * 
 * Tier: Cross-tier utility
 * Operates on: Citation queries
 */

import { WorkflowCommandContext } from '../../utils/command-context';
import { resolveFeatureName } from '../../utils';
import { queryCitations } from '../../utils/todo-citations';
import { CitationType, CitationPriority, CitationContext } from '../../utils/todo-types';
import { StatusTier } from './get-status';

export interface QueryCitationsParams {
  tier: StatusTier;
  identifier?: string;
  featureName?: string;
  filters?: {
    type?: CitationType;
    priority?: CitationPriority;
    context?: CitationContext;
    unreviewed?: boolean;
  };
}

/**
 * Query citations for tier
 * 
 * @param params Query citations parameters
 * @returns Formatted citations output
 */
export async function queryCitationsForTier(params: QueryCitationsParams): Promise<string> {
  const featureName = await resolveFeatureName(params.featureName);
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  output.push(`# Citations: ${params.tier}${params.identifier ? ` ${params.identifier}` : ''}\n`);
  output.push('---\n\n');
  
  // Validate identifier
  if ((params.tier === 'phase' || params.tier === 'session' || params.tier === 'task') && !params.identifier) {
    return 'Error: Identifier is required for phase/session/task citation queries';
  }
  
  try {
    const feature = context.feature.name;
    
    // Build filters
    const filters: {
      todoId?: string;
      type?: CitationType;
      priority?: CitationPriority;
      context?: CitationContext;
      unreviewed?: boolean;
    } = {
      ...params.filters
    };
    
    // Add todo ID filter based on tier/identifier
    if (params.tier !== 'feature') {
      let todoId: string;
      switch (params.tier) {
        case 'phase':
          todoId = `phase-${params.identifier}`;
          break;
        case 'session':
          todoId = `session-${params.identifier}`;
          break;
        case 'task':
          todoId = `task-${params.identifier}`;
          break;
        default:
          todoId = '';
      }
      filters.todoId = todoId;
    }
    
    const citations = await queryCitations(feature, filters);
    
    if (citations.length === 0) {
      output.push('**No citations found**\n');
      if (params.filters) {
        output.push('\n**Filters Applied:**\n');
        if (params.filters.type) output.push(`- Type: ${params.filters.type}\n`);
        if (params.filters.priority) output.push(`- Priority: ${params.filters.priority}\n`);
        if (params.filters.context) output.push(`- Context: ${params.filters.context}\n`);
        if (params.filters.unreviewed !== undefined) output.push(`- Unreviewed: ${params.filters.unreviewed}\n`);
      }
      return output.join('\n');
    }
    
    output.push(`## Citations (${citations.length})\n\n`);
    
    // Group by priority
    const byPriority: Record<string, typeof citations> = {
      high: [],
      medium: [],
      low: []
    };
    
    for (const citation of citations) {
      byPriority[citation.priority] = byPriority[citation.priority] || [];
      byPriority[citation.priority].push(citation);
    }
    
    if (byPriority.high.length > 0) {
      output.push('### High Priority\n\n');
      for (const citation of byPriority.high) {
        output.push(`- **${citation.id}**: ${citation.type} - Change: ${citation.changeLogId}\n`);
        if (citation.metadata?.reason) {
          output.push(`  Reason: ${citation.metadata.reason}\n`);
        }
        if (citation.reviewedAt) {
          output.push(`  Reviewed: ${new Date(citation.reviewedAt).toLocaleString()}\n`);
        } else {
          output.push(`  ⚠️ Unreviewed\n`);
        }
        output.push('\n');
      }
    }
    
    if (byPriority.medium.length > 0) {
      output.push('### Medium Priority\n\n');
      for (const citation of byPriority.medium) {
        output.push(`- **${citation.id}**: ${citation.type} - Change: ${citation.changeLogId}\n`);
        if (citation.metadata?.reason) {
          output.push(`  Reason: ${citation.metadata.reason}\n`);
        }
        if (citation.reviewedAt) {
          output.push(`  Reviewed: ${new Date(citation.reviewedAt).toLocaleString()}\n`);
        } else {
          output.push(`  ⚠️ Unreviewed\n`);
        }
        output.push('\n');
      }
    }
    
    if (byPriority.low.length > 0) {
      output.push('### Low Priority\n\n');
      for (const citation of byPriority.low) {
        output.push(`- **${citation.id}**: ${citation.type} - Change: ${citation.changeLogId}\n`);
        if (citation.metadata?.reason) {
          output.push(`  Reason: ${citation.metadata.reason}\n`);
        }
        if (citation.reviewedAt) {
          output.push(`  Reviewed: ${new Date(citation.reviewedAt).toLocaleString()}\n`);
        } else {
          output.push(`  ⚠️ Unreviewed\n`);
        }
        output.push('\n');
      }
    }
    
    return output.join('\n');
  } catch (_error) {
    output.push(`**ERROR: Failed to query citations**\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    return output.join('\n');
  }
}

