/**
 * Atomic Command: /todo-detect-scope-creep [todo]
 * 
 * Tier: Todo (Cross-tier utility)
 * Operates on: Todo management operations
 * 
 * Description: Detect scope creep violations in a todo
 */

import { detectScopeCreep } from "../../utils/todo-scoping";
import { Todo } from "../../utils/todo-types";

export async function detectScopeCreepCommand(todo: Todo): Promise<string> {
  try {
    const violations = detectScopeCreep(todo);
    
    const lines: string[] = [];
    lines.push(`# Scope Creep Detection for Todo: ${todo.id}`);
    lines.push(`**Violations Found:** ${violations.length}`);
    lines.push('');
    
    if (violations.length === 0) {
      lines.push('✅ No scope creep violations detected');
    } else {
      lines.push('## Violations');
      for (const violation of violations) {
        lines.push(`- **${violation.type}**`);
        if (violation.detailType) {
          lines.push(`  - Detail Type: ${violation.detailType}`);
        }
        if (violation.location) {
          lines.push(`  - Location: ${violation.location}`);
        }
        lines.push(`  - Description: ${violation.description}`);
        lines.push('');
      }
    }
    
    return lines.join('\n');
  } catch (_error) {
    return `❌ Error detecting scope creep: ${_error instanceof Error ? _error.message : String(_error)}`;
  }
}

