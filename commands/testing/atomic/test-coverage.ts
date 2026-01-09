/**
 * Atomic Command: /test-coverage [target]
 * Generate test coverage reports for vue/server/all
 * 
 * This command runs tests with coverage reporting enabled.
 * Coverage reports are typically generated in coverage/ directories.
 */

import { runCommand } from '../../utils/utils';

export async function testCoverage(target: string = 'vue'): Promise<{ success: boolean; output: string }> {
  const commands: Record<string, string> = {
    vue: 'cd client && npm run test -- --coverage',
    server: 'cd server && npm run test -- --coverage',
    all: 'cd client && npm run test -- --coverage && cd ../server && npm run test -- --coverage',
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

