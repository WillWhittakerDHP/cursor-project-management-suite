/**
 * Command: /create-retroactive-todos [feature] [phase] [session?]
 * 
 * Create retroactive todos from planning documents for phases/sessions
 * that were created manually without going through planning commands.
 * 
 * Usage:
 *   /create-retroactive-todos vue-migration 3
 *   /create-retroactive-todos vue-migration 3 3.1
 */

import { createRetroactiveTodos, RetroactiveTodoParams } from './create-retroactive-todos';

export async function createRetroactiveTodosCommand(
  feature: string,
  phase: string,
  sessionId?: string
): Promise<string> {
  const phaseNum = parseInt(phase);
  if (isNaN(phaseNum)) {
    return `Error: Invalid phase number: ${phase}`;
  }

  const params: RetroactiveTodoParams = {
    feature,
    phase: phaseNum,
    sessionId,
  };

  const result = await createRetroactiveTodos(params);

  const output: string[] = [];
  output.push(`# Retroactive Todo Creation: Phase ${phase}${sessionId ? `, Session ${sessionId}` : ''}\n`);
  output.push(`**Feature:** ${feature}\n`);

  if (result.success) {
    output.push(`✅ **Success:** Created ${result.created.length} todo(s)\n`);
  } else {
    output.push(`⚠️ **Partial Success:** Created ${result.created.length} todo(s) with ${result.errors.length} error(s)\n`);
  }

  if (result.created.length > 0) {
    output.push(`\n## Created Todos\n`);
    for (const todoId of result.created) {
      output.push(`- ✅ ${todoId}`);
    }
  }

  if (result.errors.length > 0) {
    output.push(`\n## Errors\n`);
    for (const error of result.errors) {
      output.push(`- ❌ ${error}`);
    }
  }

  return output.join('\n');
}

