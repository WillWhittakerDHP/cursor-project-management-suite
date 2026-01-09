/**
 * Composite Command: Test Error Analyzer
 * 
 * Analyzes test failures to classify them as test code errors vs app code errors.
 * This enables intelligent handling of test failures.
 */

export interface TestErrorAnalysis {
  isTestCodeError: boolean;
  confidence: 'high' | 'medium' | 'low';
  errorType: 'syntax' | 'import' | 'setup' | 'mock' | 'assertion' | 'runtime' | 'type';
  affectedFiles: string[];
  errorMessage: string;
  stackTrace?: string;
  recommendation: string;
}

/**
 * Analyze test error output to determine if error is in test code or app code
 */
export async function analyzeTestError(
  testOutput: string,
  testFiles: string[],
  appFiles: string[]
): Promise<TestErrorAnalysis> {
  const errorMessage = testOutput;
  const stackTrace = testOutput;
  
  // Extract file paths from stack trace
  const filePathPattern = /([\w\/\-\.]+\.(?:test|spec|ts|tsx|js|jsx))(?::\d+:\d+)?/g;
  const fileMatches = Array.from(testOutput.matchAll(filePathPattern));
  const affectedFiles = Array.from(new Set(fileMatches.map(m => m[1])));
  
  // Check if error originates in test files
  const testFileErrors = affectedFiles.filter(file => 
    /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file) ||
    testFiles.some(tf => file.includes(tf))
  );
  
  const appFileErrors = affectedFiles.filter(file =>
    !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file) &&
    appFiles.some(af => file.includes(af))
  );
  
  // Error type detection patterns
  const syntaxErrorPattern = /SyntaxError|Unexpected token|Parse error/i;
  const importErrorPattern = /Cannot find module|Cannot resolve|Module not found|import.*from/i;
  const setupErrorPattern = /beforeEach|beforeAll|afterEach|afterAll|setup|teardown/i;
  const mockErrorPattern = /mock|stub|spy|jest\.mock|vi\.mock/i;
  const assertionErrorPattern = /expect|assert|toBe|toEqual|toMatch/i;
  const typeErrorPattern = /TypeError|Type.*is not assignable|Property.*does not exist/i;
  
  let errorType: TestErrorAnalysis['errorType'] = 'runtime';
  let confidence: 'high' | 'medium' | 'low' = 'medium';
  let isTestCodeError = false;
  
  // High confidence indicators for test code errors
  if (syntaxErrorPattern.test(testOutput) && testFileErrors.length > 0) {
    errorType = 'syntax';
    isTestCodeError = true;
    confidence = 'high';
  } else if (importErrorPattern.test(testOutput)) {
    // Check if import error is for test utilities
    const testUtilityImports = /from ['"]vitest['"]|from ['"]@testing-library|from ['"]jest['"]|from ['"]@vue\/test-utils/i;
    if (testUtilityImports.test(testOutput) && testFileErrors.length > 0) {
      errorType = 'import';
      isTestCodeError = true;
      confidence = 'high';
    } else if (testFileErrors.length > 0) {
      errorType = 'import';
      isTestCodeError = true;
      confidence = 'medium';
    } else {
      errorType = 'import';
      isTestCodeError = false;
      confidence = 'medium';
    }
  } else if (setupErrorPattern.test(testOutput) && testFileErrors.length > 0) {
    errorType = 'setup';
    isTestCodeError = true;
    confidence = 'high';
  } else if (mockErrorPattern.test(testOutput) && testFileErrors.length > 0) {
    errorType = 'mock';
    isTestCodeError = true;
    confidence = 'high';
  } else if (typeErrorPattern.test(testOutput)) {
    // Type errors could be in either test or app code
    if (testFileErrors.length > 0 && appFileErrors.length === 0) {
      errorType = 'type';
      isTestCodeError = true;
      confidence = 'high';
    } else if (appFileErrors.length > 0 && testFileErrors.length === 0) {
      errorType = 'type';
      isTestCodeError = false;
      confidence = 'high';
    } else {
      errorType = 'type';
      isTestCodeError = testFileErrors.length > appFileErrors.length;
      confidence = 'medium';
    }
  } else if (assertionErrorPattern.test(testOutput)) {
    // Assertion failures are usually app code issues (test is working, app is wrong)
    errorType = 'assertion';
    isTestCodeError = false;
    confidence = 'high';
  } else {
    // Default: check file locations
    if (testFileErrors.length > 0 && appFileErrors.length === 0) {
      isTestCodeError = true;
      confidence = 'medium';
    } else if (appFileErrors.length > 0 && testFileErrors.length === 0) {
      isTestCodeError = false;
      confidence = 'medium';
    } else {
      // Mixed - default to app code error (safer)
      isTestCodeError = false;
      confidence = 'low';
    }
  }
  
  // Generate recommendation
  let recommendation = '';
  if (isTestCodeError) {
    recommendation = `This error is in the test code (${errorType} error). `;
    if (errorType === 'syntax') {
      recommendation += 'Fix syntax errors in the test file.';
    } else if (errorType === 'import') {
      recommendation += 'Fix import statements or install missing test dependencies.';
    } else if (errorType === 'setup') {
      recommendation += 'Fix test setup/teardown configuration.';
    } else if (errorType === 'mock') {
      recommendation += 'Fix mock/stub configuration.';
    } else if (errorType === 'type') {
      recommendation += 'Fix TypeScript type errors in test code.';
    } else {
      recommendation += 'Fix the test code error.';
    }
  } else {
    recommendation = `This error is in the app code (${errorType} error). `;
    if (errorType === 'assertion') {
      recommendation += 'Fix the implementation to match test expectations.';
    } else if (errorType === 'type') {
      recommendation += 'Fix TypeScript type errors in app code.';
    } else {
      recommendation += 'Fix the app code error.';
    }
  }
  
  return {
    isTestCodeError,
    confidence,
    errorType,
    affectedFiles,
    errorMessage,
    stackTrace,
    recommendation,
  };
}

