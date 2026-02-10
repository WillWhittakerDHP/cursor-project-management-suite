/**
 * Composite Command: /verify [target] [--test]
 * Composition: /lint + /type-check + (optionally /test)
 * 
 * Enhanced to use new test command structure when available
 * 
 * NOTE: This function requires 'all' permissions to:
 * - Access node_modules directory
 * - Execute npm commands
 * - Run linting and type checking
 * 
 * When called from session-end command, permissions should be automatically granted.
 */

import { lint } from './lint';
import { typeCheck } from './type-check';
import { test } from './test';
import { testRun } from '../testing/atomic/test-run';

export async function verify(target: string = 'all', includeTests: boolean = false): Promise<{
  success: boolean;
  results: {
    lint: { success: boolean; output: string };
    typeCheck: { success: boolean; output: string };
    test?: { success: boolean; output: string };
  };
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any = {};
  
  // Run linting
  const lintResult = await lint(target);
  results.lint = lintResult;
  
  // Run type checking (only for vue or all)
  let typeCheckResult = { success: true, output: 'Skipped (not vue target)' };
  if (target === 'vue' || target === 'all') {
    typeCheckResult = await typeCheck();
  }
  results.typeCheck = typeCheckResult;
  
  // Run tests if flag provided
  // Use new test-run command if available, fallback to old test command
  if (includeTests) {
    try {
      const testResult = await testRun(target);
      results.test = testResult;
    } catch {} {
      // Fallback to old test command if new structure not available
      const testResult = await test(target);
      results.test = testResult;
    }
  }
  
  const allSuccess = results.lint.success && 
                     results.typeCheck.success && 
                     (!includeTests || results.test?.success);
  
  return {
    success: allSuccess,
    results,
  };
}

