/**
 * Atomic Command: /test-run [target]
 * Execute test suite for vue/server/all
 * 
 * This is an atomic command that runs tests without watch mode.
 * Use /test-watch for watch mode execution.
 */

import { runCommand } from '../../utils/utils';

export async function testRun(target: string = 'vue'): Promise<{ success: boolean; output: string }> {
  const commands: Record<string, string> = {
    vue: 'cd client && npm run test',
    server: 'cd server && npm run test',
    all: 'cd client && npm run test && cd ../server && npm run test',
  };
  
  // Handle legacy 'react' target gracefully
  if (target === 'react') {
    return {
      success: false,
      output: 'React target no longer supported. Use "vue" for Vue app tests.',
    };
  }
  
  const command = commands[target] || commands.vue;
  const result = await runCommand(command);
  
  return {
    success: result.success,
    output: result.success ? result.output : result.error || result.output,
  };
}

