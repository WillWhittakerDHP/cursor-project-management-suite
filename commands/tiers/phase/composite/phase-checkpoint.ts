/**
 * Composite Command: /phase-checkpoint [phase]
 * Mid-phase review after completing sessions
 * 
 * Tier: Phase (Tier 1 - High-Level)
 * Operates on: Phase-level checkpoints (after completing sessions)
 * 
 * TODO MANAGEMENT INTEGRATION: This command should use todo management status tracking
 * instead of parsing logs directly. Use todo commands from `.cursor/commands/todo/` for integration.
 * Status should be loaded from todo files using `findTodo()` or `getAllTodosCommand()` instead of extracting from logs.
 * 
 * @param phase Phase identifier (e.g., "1", "2")
 * @param featureName Optional feature name (defaults to "vue-migration" for backward compatibility)
 */

import { getCurrentDate } from '../../../utils/utils';
import { getAllTodos, findTodoById } from '../../../utils/todo-io';
import { aggregateDetails } from '../../../utils/todo-scoping';
import { Todo } from '../../../utils/todo-types';
import { WorkflowCommandContext } from '../../../utils/command-context';

export async function phaseCheckpoint(
  phase: string,
  featureName: string = 'vue-migration'
): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  output.push(`# Phase ${phase} Checkpoint\n`);
  output.push(`**Date:** ${getCurrentDate()}\n`);
  output.push('---\n');
  
  // Use todo management to get phase progress
  try {
    const feature = context.feature.name;
    const phaseTodoId = `phase-${phase}`;
    
    // Get phase todo
    const phaseTodo = await findTodoById(feature, phaseTodoId);
    
    if (phaseTodo) {
      output.push('## Phase Status\n');
      output.push(`**Status:** ${phaseTodo.status}\n`);
      output.push(`**Title:** ${phaseTodo.title}\n`);
      if (phaseTodo.description) {
        output.push(`**Description:** ${phaseTodo.description}\n`);
      }
      output.push('\n---\n');
      
      // Aggregate details from child sessions
      const aggregated = await aggregateDetails(feature, phaseTodo);
      
      output.push('## Phase Progress\n');
      output.push(`**Completed:** ${aggregated.progress.completed}/${aggregated.progress.total}\n`);
      output.push(`**In Progress:** ${aggregated.progress.inProgress}\n`);
      output.push(`**Pending:** ${aggregated.progress.pending}\n`);
      output.push('\n---\n');
      
      if (aggregated.tasks.length > 0) {
        const completedSessions = aggregated.tasks.filter(t => t.status === 'completed');
        const inProgressSessions = aggregated.tasks.filter(t => t.status === 'in_progress');
        const pendingSessions = aggregated.tasks.filter(t => t.status === 'pending');
        
        if (completedSessions.length > 0) {
          output.push('## Completed Sessions\n');
          for (const session of completedSessions) {
            output.push(`- ✅ **${session.id}**: ${session.title}\n`);
          }
          output.push('\n---\n');
        }
        
        if (inProgressSessions.length > 0) {
          output.push('## Sessions In Progress\n');
          for (const session of inProgressSessions) {
            output.push(`- 🔄 **${session.id}**: ${session.title}\n`);
          }
          output.push('\n---\n');
        }
        
        if (pendingSessions.length > 0) {
          output.push('## Pending Sessions\n');
          for (const session of pendingSessions) {
            output.push(`- ⏳ **${session.id}**: ${session.title}\n`);
          }
          output.push('\n---\n');
        }
      } else {
        // Fallback: get sessions directly
        const allTodos = await getAllTodos(feature);
        const phaseSessions = allTodos.filter(todo => 
          todo.parentId === phaseTodoId && todo.tier === 'session'
        );
        
        if (phaseSessions.length > 0) {
          output.push('## Sessions\n');
          for (const session of phaseSessions) {
            const statusIcon = session.status === 'completed' ? '✅' : 
                             session.status === 'in_progress' ? '🔄' : '⏳';
            output.push(`- ${statusIcon} **${session.id}**: ${session.title} [${session.status}]\n`);
          }
          output.push('\n---\n');
        }
      }
      
      if (aggregated.objectives.length > 0) {
        output.push('## Objectives\n');
        for (const objective of aggregated.objectives) {
          output.push(`- ${objective}\n`);
        }
        output.push('\n---\n');
      }
      
    } else {
      output.push('## Phase Status\n');
      output.push(`**WARNING: Phase todo not found: ${phaseTodoId}**\n`);
      output.push(`**Suggestion:** Use \`/plan-phase ${phase} [description]\` to create phase todo\n`);
      output.push('\n---\n');
    }
    
  } catch (error) {
    output.push('## Phase Status\n');
    output.push(`**WARNING: Could not load todos from todo management system**\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    const context = new WorkflowCommandContext(feature);
    output.push(`**Suggestion:** Ensure todo files exist in \`${context.paths.getBasePath()}/todos/\`\n`);
    output.push('\n---\n');
  }
  
  output.push('## Phase Progress Review\n');
  output.push('**Review:**\n');
  output.push('- Sessions completed in this phase\n');
  output.push('- Blockers or issues encountered\n');
  output.push('- Decisions made that affect downstream phases\n');
  output.push('- Next sessions to work on\n');
  
  return output.join('\n');
}

