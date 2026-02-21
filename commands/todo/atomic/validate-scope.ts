/**
 * Atomic Command: /todo-validate-scope [feature] [todo] [parent-todo?]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Validate a todo's scope against its tier and parent
 */

import { validateScope } from "../../utils/todo-scoping";
import { Todo } from "../../utils/todo-types";

export async function validateScopeCommand(
  feature: string,
  todo: Todo,
  parentTodo?: Todo | null
): Promise<string> {
  try {
    const validation = await validateScope(feature, todo, parentTodo);
    
    const lines: string[] = [];
    lines.push(`# Scope Validation for Todo: ${todo.id}`);
    lines.push(`**Valid:** ${validation.valid ? '✅ Yes' : '❌ No'}`);
    lines.push('');
    
    if (validation.errors.length > 0) {
      lines.push('## Errors');
      for (const error of validation.errors) {
        lines.push(`- **${error.type}:** ${error.description}`);
      }
    } else {
      lines.push('✅ No scope violations detected');
    }
    
    return lines.join('\n');
  } catch (_error) {
    return `❌ Error validating scope: ${_error instanceof Error ? _error.message : String(_error)}`;
  }
}

