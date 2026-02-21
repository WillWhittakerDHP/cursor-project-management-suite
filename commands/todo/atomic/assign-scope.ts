/**
 * Atomic Command: /todo-assign-scope [feature] [todo] [parent-todo?]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Assign scope to a todo (inherit from parent or use default)
 */

import { assignScope } from "../../utils/todo-scoping";
import { Todo } from "../../utils/todo-types";

export async function assignScopeCommand(
  feature: string,
  todo: Todo,
  parentTodo?: Todo | null
): Promise<string> {
  try {
    await assignScope(feature, todo, parentTodo);
    
    const scope = todo.scope;
    if (!scope) {
      return `❌ Scope assignment failed: No scope assigned`;
    }
    
    const lines: string[] = [];
    lines.push(`✅ Scope assigned to todo: ${todo.id}`);
    lines.push('');
    lines.push('## Scope Details');
    lines.push(`- **Level:** ${scope.level}`);
    lines.push(`- **Abstraction:** ${scope.abstraction}`);
    lines.push(`- **Detail Level:** ${scope.detailLevel}`);
    lines.push(`- **Inherited From:** ${scope.inheritedFrom || 'None (default)'}`);
    lines.push(`- **Allowed Details:** ${scope.allowedDetails.join(', ')}`);
    lines.push(`- **Forbidden Details:** ${scope.forbiddenDetails.join(', ') || 'None'}`);
    
    return lines.join('\n');
  } catch (_error) {
    return `❌ Error assigning scope: ${_error instanceof Error ? _error.message : String(_error)}`;
  }
}

