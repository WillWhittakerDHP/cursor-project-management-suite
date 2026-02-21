/**
 * Atomic Command: /status-get [tier] [identifier]
 * Get status for specific tier
 * 
 * Tier: Cross-tier utility
 * Operates on: Status queries across all tiers
 */

import { WorkflowCommandContext } from '../../utils/command-context';
import { WorkflowId } from '../../utils/id-utils';
import { getAllTodos } from '../../utils/todo-io';
import { aggregateDetails } from '../../utils/todo-scoping';
import { DocumentTier } from '../../utils/document-manager';
import { resolveFeatureName } from '../../utils';

export type StatusTier = DocumentTier | 'task';

export interface GetStatusParams {
  tier: StatusTier;
  identifier?: string;
  featureName?: string;
}

export interface StatusInfo {
  tier: StatusTier;
  identifier?: string;
  todoId: string;
  status: string;
  title: string;
  description?: string;
  progress?: {
    completed: number;
    total: number;
    inProgress: number;
    pending: number;
  };
  children?: StatusInfo[];
}

/**
 * Get status for specific tier
 * 
 * @param params Get status parameters
 * @returns Status information
 */
export async function getStatus(params: GetStatusParams): Promise<StatusInfo | null> {
  const featureName = await resolveFeatureName(params.featureName);
  const context = new WorkflowCommandContext(featureName);
  
  // Validate identifier
  if ((params.tier === 'phase' || params.tier === 'session' || params.tier === 'task') && !params.identifier) {
    return null;
  }
  
  if (params.tier === 'session' && params.identifier && !WorkflowId.isValidSessionId(params.identifier)) {
    return null;
  }
  
  if (params.tier === 'task' && params.identifier && !WorkflowId.isValidTaskId(params.identifier)) {
    return null;
  }
  
  try {
    const feature = context.feature.name;
    const allTodos = await getAllTodos(feature);
    
    let todoId: string;
    
    switch (params.tier) {
      case 'feature':
        todoId = `feature-${featureName}`;
        break;
      case 'phase':
        todoId = `phase-${params.identifier}`;
        break;
      case 'session':
        todoId = `session-${params.identifier}`;
        break;
      case 'task':
        todoId = `task-${params.identifier}`;
        break;
    }
    
    const todo = allTodos.find(t => t.id === todoId);
    
    if (!todo) {
      return null;
    }
    
    // Aggregate progress for feature/phase/session
    let progress: StatusInfo['progress'] | undefined;
    let children: StatusInfo['children'] | undefined;
    
    if (params.tier === 'feature' || params.tier === 'phase' || params.tier === 'session') {
      const aggregated = await aggregateDetails(feature, todo);
      progress = {
        completed: aggregated.progress.completed,
        total: aggregated.progress.total,
        inProgress: aggregated.progress.inProgress,
        pending: aggregated.progress.pending
      };
      
      // Get child statuses
      const childTodos = allTodos.filter(t => t.parentId === todoId);
      children = await Promise.all(
        childTodos.map(async (childTodo) => {
          const childParams: GetStatusParams = {
            tier: childTodo.tier as StatusTier,
            identifier: childTodo.tier === 'phase' ? childTodo.id.replace('phase-', '') :
                       childTodo.tier === 'session' ? childTodo.id.replace('session-', '') :
                       childTodo.tier === 'task' ? childTodo.id.replace('task-', '') :
                       undefined,
            featureName
          };
          return await getStatus(childParams) || {
            tier: childTodo.tier as StatusTier,
            identifier: childParams.identifier,
            todoId: childTodo.id,
            status: childTodo.status,
            title: childTodo.title,
            description: childTodo.description
          };
        })
      );
    }
    
    return {
      tier: params.tier,
      identifier: params.identifier,
      todoId: todo.id,
      status: todo.status,
      title: todo.title,
      description: todo.description,
      progress,
      children
    };
  } catch (err) {
    console.warn('Get status: failed to get todo status', err);
    return null;
  }
}

