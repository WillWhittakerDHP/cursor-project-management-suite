/**
 * Atomic Command: /todo-enforce-scope [feature] [todo] [parent-todo?] [mode]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Enforce scope on a todo with specified mode (strict/warn/auto)
 */

import { enforceScope } from "../../utils/todo-scoping";
import { Todo } from "../../utils/todo-types";

export async function enforceScopeCommand(
  feature: string,
  todo: Todo,
  parentTodo: Todo | null | undefined,
  mode: 'strict' | 'warn' | 'auto' = 'warn'
): Promise<string> {
  try {
    const enforcedTodo = await enforceScope(feature, todo, parentTodo, mode);
    
    const lines: string[] = [];
    lines.push(`✅ Scope enforced for todo: ${enforcedTodo.id}`);
    lines.push(`**Mode:** ${mode}`);
    lines.push('');
    
    if (enforcedTodo.scope) {
      lines.push('## Scope Details');
      lines.push(`- **Level:** ${enforcedTodo.scope.level}`);
      lines.push(`- **Abstraction:** ${enforcedTodo.scope.abstraction}`);
      lines.push(`- **Detail Level:** ${enforcedTodo.scope.detailLevel}`);
    }
    
    if (mode === 'auto') {
      lines.push('');
      lines.push('ℹ️ Auto-corrections may have been applied to fix scope violations');
    }
    
    return lines.join('\n');
  } catch (_error) {
    return `❌ Error enforcing scope: ${_error instanceof Error ? _error.message : String(_error)}`;
  }
}

