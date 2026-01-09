/**
 * Atomic Command: /type-check
 * Run type checking for Vue app
 */

import { runCommand } from './utils';

export async function typeCheck(): Promise<{ success: boolean; output: string }> {
  const result = await runCommand('cd client && npm run type-check');
  
  return {
    success: result.success,
    output: result.success ? result.output : result.error || result.output,
  };
}

