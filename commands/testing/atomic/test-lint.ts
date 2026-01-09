/**
 * Atomic Command: /test-lint [target]
 * Lint test files specifically for vue/server/all
 * 
 * This command runs linting on test files only, useful for validating
 * test file structure and compliance with coding standards.
 */

import { runCommand } from '../../utils/utils';

export async function testLint(target: string = 'vue'): Promise<{ success: boolean; output: string }> {
  // Lint test files specifically by targeting test file patterns
  // If no test files exist, lint all files instead
  const commands: Record<string, string> = {
    vue: 'cd client && npm run lint',
    server: 'cd server && npm run lint',
    all: 'cd client && npm run lint && cd ../server && npm run lint',
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

