/**
 * Atomic Command: Core checkpoint creation logic
 * 
 * Tier: Cross-tier utility
 * Operates on: Checkpoint creation across all tiers
 */

import { WorkflowCommandContext } from '../../utils/command-context';
import { resolveFeatureName } from '../../utils';
import { WorkflowId } from '../../utils/id-utils';
import { getAllTodos } from '../../utils/todo-io';
import { aggregateDetails } from '../../utils/todo-scoping';
import { verify } from '../../utils/verify';

export type CheckpointTier = 'feature' | 'phase' | 'session' | 'task';

export interface CreateCheckpointParams {
  tier: CheckpointTier;
  identifier?: string;
  featureName?: string;
  runQualityChecks?: boolean;
  notes?: string;
}

export interface CheckpointResult {
  success: boolean;
  output: string;
  qualityChecks?: {
    success: boolean;
    results: {
      lint: { success: boolean; output: string };
      typeCheck: { success: boolean; output: string };
      test?: { success: boolean; output: string };
    };
  };
}

/**
 * Create checkpoint for any tier
 * 
 * @param params Checkpoint parameters
 * @returns Checkpoint result
 */
export async function createCheckpoint(params: CreateCheckpointParams): Promise<CheckpointResult> {
  const featureName = await resolveFeatureName(params.featureName);
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  // Validate identifier
  if ((params.tier === 'phase' || params.tier === 'session' || params.tier === 'task') && !params.identifier) {
    return {
      success: false,
      output: `Error: ${params.tier} identifier is required for ${params.tier} checkpoints`
    };
  }
  
  if (params.tier === 'session' && params.identifier && !WorkflowId.isValidSessionId(params.identifier)) {
    return {
      success: false,
      output: `Error: Invalid session ID format. Expected X.Y.Z (e.g., 4.1.3)\nAttempted: ${params.identifier}`
    };
  }
  
  if (params.tier === 'task' && params.identifier && !WorkflowId.isValidTaskId(params.identifier)) {
    return {
      success: false,
      output: `Error: Invalid task ID format. Expected X.Y.Z.A (e.g., 4.1.3.1)\nAttempted: ${params.identifier}`
    };
  }
  
  // Run quality checks if requested
  let qualityChecks: CheckpointResult['qualityChecks'] | undefined;
  if (params.runQualityChecks) {
    try {
      const verifyResult = await verify('vue', false);
      qualityChecks = {
        success: verifyResult.success,
        results: verifyResult.results
      };
      
      if (!verifyResult.success) {
        output.push('⚠️ **Quality checks failed**\n');
        output.push('Fix errors before continuing.\n\n');
      } else {
        output.push('✅ **Quality checks passed**\n\n');
      }
    } catch (_error) {
      output.push(`⚠️ **Quality checks error:** ${_error instanceof Error ? _error.message : String(_error)}\n\n`);
    }
  }
  
  // Get todo status
  try {
    const feature = context.feature.name;
    const allTodos = await getAllTodos(feature);
    
    let todoId: string;
    let todoTitle: string;
    
    switch (params.tier) {
      case 'feature':
        todoId = `feature-${featureName}`;
        todoTitle = `Feature: ${featureName}`;
        break;
      case 'phase':
        todoId = `phase-${params.identifier}`;
        todoTitle = `Phase ${params.identifier}`;
        break;
      case 'session':
        todoId = `session-${params.identifier}`;
        todoTitle = `Session ${params.identifier}`;
        break;
      case 'task':
        todoId = `task-${params.identifier}`;
        todoTitle = `Task ${params.identifier}`;
        break;
    }
    
    const todo = allTodos.find(t => t.id === todoId);
    
    if (todo) {
      // Aggregate progress for feature/phase/session
      if (params.tier === 'feature' || params.tier === 'phase' || params.tier === 'session') {
        const aggregated = await aggregateDetails(feature, todo);
        
        output.push(`# ${todoTitle} Checkpoint\n`);
        output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n`);
        output.push(`**Status:** ${todo.status}\n`);
        output.push(`**Progress:** ${aggregated.progress.completed}/${aggregated.progress.total} completed\n`);
        
        if (params.notes) {
          output.push(`**Notes:** ${params.notes}\n`);
        }
        
        output.push('\n---\n');
        
        if (aggregated.tasks.length > 0) {
          const completed = aggregated.tasks.filter(t => t.status === 'completed');
          const inProgress = aggregated.tasks.filter(t => t.status === 'in_progress');
          const pending = aggregated.tasks.filter(t => t.status === 'pending');
          
          if (completed.length > 0) {
            output.push('## Completed\n');
            for (const item of completed) {
              output.push(`- ✅ **${item.id}**: ${item.title}\n`);
            }
            output.push('\n');
          }
          
          if (inProgress.length > 0) {
            output.push('## In Progress\n');
            for (const item of inProgress) {
              output.push(`- 🔄 **${item.id}**: ${item.title}\n`);
            }
            output.push('\n');
          }
          
          if (pending.length > 0) {
            output.push('## Pending\n');
            for (const item of pending) {
              output.push(`- ⏳ **${item.id}**: ${item.title}\n`);
            }
            output.push('\n');
          }
        }
      } else {
        // Task checkpoint
        output.push(`# ${todoTitle} Checkpoint\n`);
        output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n`);
        output.push(`**Status:** ${todo.status}\n`);
        
        if (params.notes) {
          output.push(`**Notes:** ${params.notes}\n`);
        }
        
        output.push('\n---\n');
      }
    } else {
      output.push(`# ${todoTitle} Checkpoint\n`);
      output.push(`**WARNING: Todo not found: ${todoId}**\n`);
      output.push(`**Suggestion:** Create the todo first using planning commands\n`);
      output.push('\n---\n');
    }
  } catch (_error) {
    output.push(`**WARNING: Could not load todos**\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('\n---\n');
  }
  
  return {
    success: true,
    output: output.join('\n'),
    qualityChecks
  };
}

