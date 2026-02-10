/**
 * Composite Command: /test-workflow [target]
 * Full test workflow: validate → lint → run → coverage
 * 
 * This composite command combines multiple atomic test commands
 * to provide a complete testing workflow.
 */

import { testValidate } from '../atomic/test-validate';
import { testLint } from '../atomic/test-lint';
import { testRun } from '../atomic/test-run';
import { testCoverage } from '../atomic/test-coverage';

export interface TestWorkflowResult {
  success: boolean;
  results: {
    validate?: { success: boolean; isValid: boolean; issues: string[]; warnings: string[] };
    lint: { success: boolean; output: string };
    run: { success: boolean; output: string };
    coverage?: { success: boolean; output: string };
  };
  message: string;
}

/**
 * Run complete test workflow
 */
export async function testWorkflow(
  target: string = 'vue',
  includeCoverage: boolean = false
): Promise<TestWorkflowResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any = {};
  
  // Step 1: Validate test files (optional - can skip if no specific file)
  // This would typically be run on specific files, so we'll skip it in the workflow
  
  // Step 2: Lint test files
  const lintResult = await testLint(target);
  results.lint = lintResult;
  
  if (!lintResult.success) {
    return {
      success: false,
      results,
      message: 'Test workflow failed at linting step',
    };
  }
  
  // Step 3: Run tests
  const runResult = await testRun(target);
  results.run = runResult;
  
  if (!runResult.success) {
    return {
      success: false,
      results,
      message: 'Test workflow failed at test execution step',
    };
  }
  
  // Step 4: Generate coverage (optional)
  if (includeCoverage) {
    const coverageResult = await testCoverage(target);
    results.coverage = coverageResult;
  }
  
  const allSuccess = results.lint.success && 
                     results.run.success && 
                     (!includeCoverage || results.coverage?.success);
  
  return {
    success: allSuccess,
    results,
    message: allSuccess 
      ? 'Test workflow completed successfully' 
      : 'Test workflow completed with errors',
  };
}

