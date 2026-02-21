/**
 * Composite Command: /todo-create-from-plain-language [feature] [input] [context?]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Full workflow: parse natural language → validate → create → enforce scope
 */

import { createTodoFromPlainLanguage } from "../../utils/todo-plain-language";
import { Todo, ParsingError } from "../../utils/todo-types";

export async function createFromPlainLanguage(
  feature: string,
  input: string,
  context?: {
    currentPhase?: number;
    currentSession?: string;
  }
): Promise<string> {
  try {
    const result = await createTodoFromPlainLanguage(feature, input, context);
    
    if (!result.success) {
      const lines: string[] = [];
      lines.push('❌ Failed to create todo from plain language');
      lines.push('');
      
      if (result.errors && result.errors.length > 0) {
        lines.push('## Errors');
        for (const error of result.errors) {
          lines.push(`- **${error.type}**${error.field ? ` (${error.field})` : ''}: ${error.message}`);
        }
        lines.push('');
      }
      
      if (result.suggestions && result.suggestions.length > 0) {
        lines.push('## Suggestions');
        for (const suggestion of result.suggestions) {
          lines.push(`- ${suggestion}`);
        }
      }
      
      return lines.join('\n');
    }
    
    if (!result.todo) {
      return '❌ Todo creation succeeded but no todo returned';
    }
    
    const todo = result.todo;
    const lines: string[] = [];
    lines.push('✅ Todo created from plain language');
    lines.push('');
    lines.push('## Todo Details');
    lines.push(`- **ID:** ${todo.id}`);
    lines.push(`- **Title:** ${todo.title}`);
    lines.push(`- **Tier:** ${todo.tier}`);
    lines.push(`- **Status:** ${todo.status}`);
    if (todo.description) {
      lines.push(`- **Description:** ${todo.description}`);
    }
    if (todo.parentId) {
      lines.push(`- **Parent:** ${todo.parentId}`);
    }
    if (todo.planningDocPath) {
      lines.push(`- **Planning Doc:** ${todo.planningDocPath}`);
    }
    
    return lines.join('\n');
  } catch (_error) {
    return `❌ Error creating todo from plain language: ${_error instanceof Error ? _error.message : String(_error)}`;
  }
}

/**
 * Programmatic API: Create todo from plain language (returns structured data)
 * 
 * Use this function when calling from other commands (e.g., planning commands)
 * that need structured data rather than formatted string output.
 * 
 * @param feature Feature name
 * @param input Plain language input
 * @param context Optional context (currentPhase, currentSession)
 * @returns Structured result with todo, errors, and suggestions
 */
export async function createFromPlainLanguageProgrammatic(
  feature: string,
  input: string,
  context?: {
    currentPhase?: number;
    currentSession?: string;
  }
): Promise<{ success: boolean; todo?: Todo; errors?: ParsingError[]; suggestions?: string[] }> {
  // Call utility directly and return structured result
  return await createTodoFromPlainLanguage(feature, input, context);
}

