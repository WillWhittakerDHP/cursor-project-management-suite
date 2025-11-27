/**
 * Composite Command: /todo-aggregate-details [feature] [parent-todo]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Aggregate child details for parent todo and generate summary
 */

import { aggregateDetails, generateSummary } from "../../utils/todo-scoping';
import { Todo } from "../../utils/todo-types';

export async function aggregateDetailsCommand(feature: string, parentTodo: Todo): Promise<string> {
  try {
    const aggregated = await aggregateDetails(feature, parentTodo);
    const summary = await generateSummary(feature, parentTodo);
    
    const lines: string[] = [];
    lines.push(`# Aggregated Details for Todo: ${parentTodo.id}`);
    lines.push(`**Title:** ${parentTodo.title}`);
    lines.push('');
    
    lines.push('## Summary');
    lines.push(`- **Overall Status:** ${summary.status}`);
    lines.push(`- **Progress:** ${summary.progress.completed}/${summary.progress.total} completed, ${summary.progress.inProgress} in progress, ${summary.progress.pending} pending`);
    lines.push('');
    
    if (summary.objectives.length > 0) {
      lines.push('## Objectives');
      for (const objective of summary.objectives) {
        lines.push(`- ${objective}`);
      }
      lines.push('');
    }
    
    if (summary.keyDependencies.length > 0) {
      lines.push('## Key Dependencies');
      for (const dep of summary.keyDependencies) {
        lines.push(`- ${dep}`);
      }
      lines.push('');
    }
    
    if (summary.nextSteps.length > 0) {
      lines.push('## Next Steps');
      for (const step of summary.nextSteps) {
        lines.push(`- ${step}`);
      }
      lines.push('');
    }
    
    lines.push('## Detailed Progress');
    lines.push(`- **Completed:** ${aggregated.progress.completed}`);
    lines.push(`- **In Progress:** ${aggregated.progress.inProgress}`);
    lines.push(`- **Pending:** ${aggregated.progress.pending}`);
    lines.push(`- **Total:** ${aggregated.progress.total}`);
    
    if (aggregated.tasks.length > 0) {
      lines.push('');
      lines.push('## Tasks');
      for (const task of aggregated.tasks) {
        lines.push(`- **${task.id}** (${task.status}): ${task.title}`);
      }
    }
    
    return lines.join('\n');
  } catch (error) {
    return `❌ Error aggregating details: ${error instanceof Error ? error.message : String(error)}`;
  }
}

