/**
 * Composite Command: /test-before-commit [target]
 * Pre-commit test suite: run unit tests and linting
 * 
 * This command runs a lightweight test suite suitable for pre-commit hooks.
 * It focuses on fast feedback rather than comprehensive coverage.
 */

import { testRun } from '../atomic/test-run';
import { testLint } from '../atomic/test-lint';

export interface TestBeforeCommitResult {
  success: boolean;
  results: {
    lint: { success: boolean; output: string };
    run: { success: boolean; output: string };
  };
  message: string;
}

/**
 * Run pre-commit test suite
 */
export async function testBeforeCommit(target: string = 'vue'): Promise<TestBeforeCommitResult> {
  // Step 1: Lint test files
  const lintResult = await testLint(target);
  
  if (!lintResult.success) {
    return {
      success: false,
      results: {
        lint: lintResult,
        run: { success: false, output: 'Skipped due to linting failures' },
      },
      message: 'Pre-commit checks failed at linting step',
    };
  }
  
  // Step 2: Run unit tests (fast tests only)
  // In a real implementation, this might filter to only unit tests
  const runResult = await testRun(target);
  
  const allSuccess = lintResult.success && runResult.success;
  
  return {
    success: allSuccess,
    results: {
      lint: lintResult,
      run: runResult,
    },
    message: allSuccess 
      ? 'Pre-commit checks passed' 
      : 'Pre-commit checks failed',
  };
}

