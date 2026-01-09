/**
 * Atomic Command: /test-watch [target]
 * Run tests in watch mode for vue/server/all
 * 
 * This command runs tests in watch mode, automatically re-running tests
 * when files change. Use /test-run for single execution.
 */

import { runCommand } from '../../utils/utils';

export async function testWatch(target: string = 'vue'): Promise<{ success: boolean; output: string }> {
  const commands: Record<string, string> = {
    vue: 'cd client && npm run test:watch',
    server: 'cd server && npm run test -- --watch',
    all: 'cd client && npm run test:watch',
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

