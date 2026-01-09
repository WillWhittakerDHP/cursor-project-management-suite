/**
 * Atomic Command: /test [target] [--watch]
 * Run tests for vue/server/all
 * 
 * Use 'vue' for Vue app tests, 'server' for backend tests, or 'all' for both.
 */

import { runCommand } from './utils';

export async function test(target: string = 'vue', watch: boolean = false): Promise<{ success: boolean; output: string }> {
  const commands: Record<string, { normal: string; watch: string }> = {
    vue: {
      normal: 'cd client && npm run test',
      watch: 'cd client && npm run test:watch',
    },
    server: {
      normal: 'cd server && npm run test',
      watch: 'cd server && npm run test -- --watch',
    },
    all: {
      normal: 'cd client && npm run test && cd ../server && npm run test',
      watch: 'cd client && npm run test:watch',
    },
  };
  
  const targetConfig = commands[target] || commands.vue;
  const command = watch ? targetConfig.watch : targetConfig.normal;
  
  const result = await runCommand(command);
  
  return {
    success: result.success,
    output: result.success ? result.output : result.error || result.output,
  };
}

