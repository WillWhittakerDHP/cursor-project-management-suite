/**
 * Atomic Command: /todo-get-all [feature]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Get all todos for a feature with summary statistics
 */

import { getAllTodos } from "../../utils/todo-io';
import { Todo } from "../../utils/todo-types';

export async function getAllTodosCommand(feature: string): Promise<string> {
  try {
    const todos = await getAllTodos(feature);
    
    if (todos.length === 0) {
      return `📋 No todos found for feature: ${feature}`;
    }
    
    const stats = calculateStats(todos);
    const lines: string[] = [];
    
    lines.push(`# All Todos for Feature: ${feature}`);
    lines.push('');
    lines.push('## Summary Statistics');
    lines.push(`- **Total:** ${stats.total}`);
    lines.push(`- **By Tier:**`);
    lines.push(`  - Feature: ${stats.byTier.feature}`);
    lines.push(`  - Phase: ${stats.byTier.phase}`);
    lines.push(`  - Session: ${stats.byTier.session}`);
    lines.push(`  - Task: ${stats.byTier.task}`);
    lines.push(`- **By Status:**`);
    lines.push(`  - Pending: ${stats.byStatus.pending}`);
    lines.push(`  - In Progress: ${stats.byStatus.in_progress}`);
    lines.push(`  - Completed: ${stats.byStatus.completed}`);
    lines.push(`  - Cancelled: ${stats.byStatus.cancelled}`);
    lines.push(`  - Blocked: ${stats.byStatus.blocked}`);
    lines.push('');
    lines.push('## Todos');
    
    for (const todo of todos) {
      lines.push(`- **${todo.id}** (${todo.tier}): ${todo.title} [${todo.status}]`);
    }
    
    return lines.join('\n');
  } catch (error) {
    return `❌ Error getting todos: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function calculateStats(todos: Todo[]): {
  total: number;
  byTier: Record<string, number>;
  byStatus: Record<string, number>;
} {
  const stats = {
    total: todos.length,
    byTier: {
      feature: 0,
      phase: 0,
      session: 0,
      task: 0,
    },
    byStatus: {
      pending: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
      blocked: 0,
    },
  };
  
  for (const todo of todos) {
    stats.byTier[todo.tier]++;
    stats.byStatus[todo.status] = (stats.byStatus[todo.status] || 0) + 1;
  }
  
  return stats;
}

