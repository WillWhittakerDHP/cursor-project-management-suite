/**
 * Composite Command: /test-dev [filePath] [testTarget] [options]
 * Comprehensive test development workflow
 * 
 * Combines validation, immutability checks, watch mode, and error resolution
 * for iterative test development with immediate feedback.
 * 
 * LEARNING: Composite commands combine multiple atomic operations for complex workflows
 * WHY: Test development requires multiple validation steps and continuous feedback
 * PATTERN: Facade pattern - simplified interface to complex test development process
 */

import { testValidate, TestValidationResult } from '../atomic/test-validate';
import { testCheckImmutable, ImmutabilityCheckCommandResult } from '../atomic/test-check-immutable';
import { testWatch } from '../atomic/test-watch';
import { TEST_CONFIG } from '../utils/test-config';
import { 
  runInitialTestExecution,
  executeWatchModeWithMonitoring,
  parseTestOutput,
  promptForResolution 
} from '../utils/watch-mode-handler';
import { analyzeTestError, TestErrorAnalysis } from './test-error-analyzer';
import { 
  requestTestFileFixPermission,
  grantTestFileFixPermission,
  checkTestFileFixPermission 
} from './test-file-fix-permission';
import { executeTestFileFix } from './test-file-fix-workflow';
import { WorkflowCommandContext } from '../../utils/command-context';

export interface TestDevWorkflowOptions {
  filePath?: string;
  testTarget?: string;
  skipValidation?: boolean;
  skipImmutability?: boolean;
  conversationTurn?: string;
}

export interface TestDevWorkflowResult {
  success: boolean;
  results: {
    validation?: TestValidationResult;
    immutability?: ImmutabilityCheckCommandResult;
    initialTest?: { success: boolean; output: string };
    watchMode?: { success: boolean; output: string; errors?: TestErrorAnalysis[] };
  };
  message: string;
}

/**
 * Execute comprehensive test development workflow
 */
export async function testDevWorkflow(
  options: TestDevWorkflowOptions = {}
): Promise<TestDevWorkflowResult> {
  const {
    filePath,
    testTarget = TEST_CONFIG.defaultTarget,
    skipValidation = false,
    skipImmutability = false,
    conversationTurn = `test-dev-${Date.now()}`,
  } = options;
  
  const results: any = {};
  const context = new WorkflowCommandContext('vue-migration');
  
  // Step 1: Validate test file structure (if file path provided)
  if (filePath && !skipValidation) {
    const validationResult = await testValidate(filePath);
    results.validation = validationResult;
    
    if (!validationResult.isValid) {
      return {
        success: false,
        results,
        message: `Test file validation failed. Issues: ${validationResult.issues.join('; ')}`,
      };
    }
  }
  
  // Step 2: Check immutability (if file path provided)
  if (filePath && !skipImmutability) {
    const immutabilityResult = await testCheckImmutable(filePath);
    results.immutability = immutabilityResult;
    
    if (immutabilityResult.isImmutable && !immutabilityResult.canModify) {
      return {
        success: false,
        results,
        message: `Test file is immutable and cannot be modified: ${immutabilityResult.message}`,
      };
    }
  }
  
  // Step 3: Run initial test execution (foreground)
  const initialTest = await runInitialTestExecution(testTarget);
  results.initialTest = initialTest;
  
  if (!initialTest.success) {
    // Tests failed - analyze and provide resolution options
    const parsed = parseTestOutput(initialTest.output);
    
    if (parsed.failed) {
      // Extract files from output
      const testFilePattern = /([\w\/\-\.]+\.(?:test|spec)\.(?:ts|tsx|js|jsx))(?::\d+:\d+)?/g;
      const appFilePattern = /([\w\/\-\.]+\.(?:ts|tsx|js|jsx|vue))(?::\d+:\d+)?/g;
      const testMatches = Array.from(initialTest.output.matchAll(testFilePattern));
      const appMatches = Array.from(initialTest.output.matchAll(appFilePattern));
      const testFiles = Array.from(new Set(testMatches.map(m => m[1])));
      const appFiles = Array.from(new Set(
        appMatches.map(m => m[1]).filter(f => !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f))
      ));
      
      // Analyze error
      const errorAnalysis = await analyzeTestError(initialTest.output, testFiles, appFiles);
      
      // Build error message
      const errorMessage = `Tests failed. Error analysis indicates ${errorAnalysis.isTestCodeError ? 'test code error' : 'app code error'}.

Error Type: ${errorAnalysis.errorType}
Confidence: ${errorAnalysis.confidence}
Affected Files: ${errorAnalysis.affectedFiles.join(', ')}
Recommendation: ${errorAnalysis.recommendation}

How would you like to proceed?
- Fix test file (if test code error)
- Fix app code (if app code error)
- Skip and continue watching
- Stop watch mode`;

      return {
        success: false,
        results: {
          ...results,
          watchMode: {
            success: false,
            output: errorMessage,
            errors: [errorAnalysis],
          },
        },
        message: `Test development workflow: Initial tests failed. ${errorAnalysis.recommendation}`,
      };
    }
  }
  
  // Step 4: Start watch mode (default for test development)
  if (TEST_CONFIG.watchMode.enabled && TEST_CONFIG.promptResolution.enabled) {
    // Execute watch mode with monitoring
    const watchResult = await executeWatchModeWithMonitoring(testTarget, {
      testTarget,
      conversationTurn,
      onFailure: async (errorAnalysis: TestErrorAnalysis) => {
        // This will be handled by the command handler using ask_question
        // For now, return default action
        return promptForResolution(errorAnalysis);
      },
      onSuccess: () => {
        // Tests passed - can continue watching
      },
    });
    
    results.watchMode = watchResult;
    
    const allSuccess = initialTest.success && watchResult.success;
    
    return {
      success: allSuccess,
      results,
      message: allSuccess
        ? 'Test development workflow completed successfully. Watch mode active.'
        : 'Test development workflow completed with errors. Review output for details.',
    };
  } else {
    // Watch mode disabled or non-interactive - just return initial test results
    return {
      success: initialTest.success,
      results,
      message: initialTest.success
        ? 'Test development workflow completed. Watch mode disabled (non-interactive or disabled in config).'
        : 'Test development workflow: Initial tests failed.',
    };
  }
}

/**
 * Helper function to handle test file fix workflow
 * Called when user chooses to fix test file
 */
export async function handleTestFileFix(
  errorAnalysis: TestErrorAnalysis,
  testTarget: string,
  conversationTurn: string
): Promise<{ success: boolean; message: string }> {
  // Request permission
  const permission = await requestTestFileFixPermission(errorAnalysis, conversationTurn);
  
  // Grant permission (in real implementation, this would be based on user response)
  grantTestFileFixPermission(permission, conversationTurn);
  
  // Execute fix
  const fixResult = await executeTestFileFix(errorAnalysis, testTarget, conversationTurn);
  
  return {
    success: fixResult.success,
    message: fixResult.message,
  };
}

