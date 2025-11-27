/**
 * Atomic Command: /status-query-changes [tier] [identifier]
 * Query changes for tier
 * 
 * Tier: Cross-tier utility
 * Operates on: Change log queries
 */

import { WorkflowCommandContext } from '../../utils/command-context';
import { WorkflowId } from '../../utils/id-utils';
import { readChangeLog, getChangeLogEntry } from '../../utils/todo-io';
import { ChangeLogEntry } from '../../utils/todo-types';
import { StatusTier } from './get-status';

export interface QueryChangesParams {
  tier: StatusTier;
  identifier?: string;
  featureName?: string;
  filters?: {
    todoId?: string;
    changeType?: string;
    since?: string; // ISO date string
  };
}

/**
 * Query changes for tier
 * 
 * @param params Query changes parameters
 * @returns Formatted changes output
 */
export async function queryChanges(params: QueryChangesParams): Promise<string> {
  const featureName = params.featureName || 'vue-migration';
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  output.push(`# Changes: ${params.tier}${params.identifier ? ` ${params.identifier}` : ''}\n`);
  output.push('---\n\n');
  
  // Validate identifier
  if ((params.tier === 'phase' || params.tier === 'session' || params.tier === 'task') && !params.identifier) {
    return 'Error: Identifier is required for phase/session/task change queries';
  }
  
  try {
    const feature = context.feature.name;
    const changeLog = await readChangeLog(feature);
    
    if (!changeLog || changeLog.entries.length === 0) {
      output.push('**No changes found**\n');
      return output.join('\n');
    }
    
    // Filter changes
    let filteredEntries = changeLog.entries;
    
    if (params.filters?.todoId) {
      const todoId = params.filters.todoId;
      filteredEntries = filteredEntries.filter(entry => 
        entry.todoId === todoId || entry.relatedChanges?.includes(todoId)
      );
    }
    
    if (params.filters?.changeType) {
      filteredEntries = filteredEntries.filter(entry => 
        entry.changeType === params.filters!.changeType
      );
    }
    
    if (params.filters?.since) {
      const sinceDate = new Date(params.filters.since);
      filteredEntries = filteredEntries.filter(entry => 
        new Date(entry.timestamp) >= sinceDate
      );
    }
    
    // Filter by tier/identifier
    if (params.tier === 'feature') {
      // Feature-level changes (no specific todo filter)
    } else {
      let targetTodoId: string;
      switch (params.tier) {
        case 'phase':
          targetTodoId = `phase-${params.identifier}`;
          break;
        case 'session':
          targetTodoId = `session-${params.identifier}`;
          break;
        case 'task':
          targetTodoId = `task-${params.identifier}`;
          break;
        default:
          targetTodoId = '';
      }
      
      filteredEntries = filteredEntries.filter(entry => 
        entry.todoId === targetTodoId || entry.relatedChanges?.includes(targetTodoId)
      );
    }
    
    if (filteredEntries.length === 0) {
      output.push('**No changes found matching filters**\n');
      return output.join('\n');
    }
    
    output.push(`## Changes (${filteredEntries.length})\n\n`);
    
    // Sort by timestamp (newest first)
    filteredEntries.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    for (const entry of filteredEntries) {
      output.push(`### ${entry.id}\n`);
      output.push(`**Type:** ${entry.changeType}\n`);
      output.push(`**Todo:** ${entry.todoId}\n`);
      output.push(`**Timestamp:** ${new Date(entry.timestamp).toLocaleString()}\n`);
      if (entry.reason) {
        output.push(`**Reason:** ${entry.reason}\n`);
      }
      if (entry.relatedChanges && entry.relatedChanges.length > 0) {
        output.push(`**Related:** ${entry.relatedChanges.join(', ')}\n`);
      }
      output.push('\n');
    }
    
    return output.join('\n');
  } catch (error) {
    output.push(`**ERROR: Failed to query changes**\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    return output.join('\n');
  }
}

/**
 * Query changes (programmatic API)
 * 
 * @param params Query changes parameters
 * @returns Structured changes result
 */
export async function queryChangesProgrammatic(
  params: QueryChangesParams
): Promise<{ success: boolean; changes?: ChangeLogEntry[]; error?: string }> {
  const featureName = params.featureName || 'vue-migration';
  
  try {
    const changeLog = await readChangeLog(featureName);
    
    if (!changeLog || changeLog.entries.length === 0) {
      return {
        success: true,
        changes: []
      };
    }
    
    // Apply filters (same logic as CLI version)
    let filteredEntries = changeLog.entries;
    
    if (params.filters?.todoId) {
      const todoId = params.filters.todoId;
      filteredEntries = filteredEntries.filter(entry => 
        entry.todoId === todoId || entry.relatedChanges?.includes(todoId)
      );
    }
    
    if (params.filters?.changeType) {
      filteredEntries = filteredEntries.filter(entry => 
        entry.changeType === params.filters!.changeType
      );
    }
    
    if (params.filters?.since) {
      const sinceDate = new Date(params.filters.since);
      filteredEntries = filteredEntries.filter(entry => 
        new Date(entry.timestamp) >= sinceDate
      );
    }
    
    // Filter by tier/identifier
    if (params.tier !== 'feature' && params.identifier) {
      let targetTodoId: string;
      switch (params.tier) {
        case 'phase':
          targetTodoId = `phase-${params.identifier}`;
          break;
        case 'session':
          targetTodoId = `session-${params.identifier}`;
          break;
        case 'task':
          targetTodoId = `task-${params.identifier}`;
          break;
        default:
          targetTodoId = '';
      }
      
      filteredEntries = filteredEntries.filter(entry => 
        entry.todoId === targetTodoId || entry.relatedChanges?.includes(targetTodoId)
      );
    }
    
    // Sort by timestamp (newest first)
    filteredEntries.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    return {
      success: true,
      changes: filteredEntries
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

