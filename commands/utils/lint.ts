/**
 * Atomic Command: /lint [target]
 * Run linting for vue/server/all
 * 
 * Use 'vue' for Vue app, 'server' for backend, or 'all' for both.
 * 
 * NOTE: This function requires 'all' permissions to:
 * - Access node_modules directory
 * - Execute npm commands
 * - Read and write files for linting
 * 
 * When called from session-end command, permissions should be automatically granted.
 */

import { runCommand } from './utils';

export async function lint(target: string = 'all'): Promise<{ success: boolean; output: string }> {
  const commands: Record<string, string> = {
    vue: 'cd client && npm run lint',
    server: 'cd server && npm run lint',
    all: 'cd client && npm run lint && cd ../server && npm run lint',
  };
  
  const command = commands[target] || commands.all;
  const result = await runCommand(command);
  
  return {
    success: result.success,
    output: result.success ? result.output : result.error || result.output,
  };
}

