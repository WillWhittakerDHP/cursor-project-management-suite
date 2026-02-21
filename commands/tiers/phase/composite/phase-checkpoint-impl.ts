/**
 * Phase checkpoint implementation. Used by tier-checkpoint and by phase-checkpoint (thin wrapper).
 */

import { getCurrentDate } from '../../../utils/utils';
import { getAllTodos, findTodoById } from '../../../utils/todo-io';
import { aggregateDetails } from '../../../utils/todo-scoping';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { resolveFeatureName } from '../../../utils';

export async function phaseCheckpointImpl(
  phase: string,
  featureName?: string
): Promise<string> {
  const resolved = await resolveFeatureName(featureName);
  const context = new WorkflowCommandContext(resolved);
  const output: string[] = [];

  output.push(`# Phase ${phase} Checkpoint\n`);
  output.push(`**Date:** ${getCurrentDate()}\n`);
  output.push('---\n');

  try {
    const feature = context.feature.name;
    const phaseTodoId = `phase-${phase}`;
    const phaseTodo = await findTodoById(feature, phaseTodoId);

    if (phaseTodo) {
      output.push('## Phase Status\n');
      output.push(`**Status:** ${phaseTodo.status}\n`);
      output.push(`**Title:** ${phaseTodo.title}\n`);
      if (phaseTodo.description) output.push(`**Description:** ${phaseTodo.description}\n`);
      output.push('\n---\n');

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
        const allTodos = await getAllTodos(feature);
        const phaseSessions = allTodos.filter(todo =>
          todo.parentId === phaseTodoId && todo.tier === 'session'
        );
        if (phaseSessions.length > 0) {
          output.push('## Sessions\n');
          for (const session of phaseSessions) {
            const statusIcon = session.status === 'completed' ? '✅' : session.status === 'in_progress' ? '🔄' : '⏳';
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
      output.push(`**Suggestion:** Use \`/phase-plan ${phase} [description]\` to create phase todo\n`);
      output.push('\n---\n');
    }
  } catch (_error) {
    output.push('## Phase Status\n');
    output.push(`**WARNING: Could not load todos from todo management system**\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
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
