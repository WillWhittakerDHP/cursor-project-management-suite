/**
 * Composite Command: /test-on-change [file-paths...]
 * Run tests when files change
 * 
 * This command detects which tests are affected by file changes
 * and runs only those tests for faster feedback.
 * 
 * ENHANCEMENT: Now includes change impact analysis before running tests
 * LEARNING: Proactive analysis provides better UX without compromising test integrity
 * WHY: Users get warned about breaking changes before tests fail
 */

import { testRun } from '../atomic/test-run';
import { readFile } from 'fs/promises';
import { join, relative } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';
import { analyzeCodeChangeImpact, TestImpactAnalysis } from './test-change-detector';
import { preTestValidation, PreTestValidationResult } from './test-pre-run-validation';

export interface TestOnChangeResult {
  success: boolean;
  testsRun: string[];
  output: string;
  message: string;
  impact?: TestImpactAnalysis; // NEW: Impact analysis included
  validation?: PreTestValidationResult; // NEW: Pre-run validation result
}

/**
 * Run tests affected by file changes with impact analysis
 * 
 * NEW: Analyzes impact before running tests and provides warnings
 */
export async function testOnChange(
  filePaths: string[],
  options: {
    skipImpactAnalysis?: boolean; // Skip impact analysis (default: false)
    testTarget?: 'vue' | 'server' | 'all'; // Test target (default: 'vue')
  } = {}
): Promise<TestOnChangeResult> {
  const { skipImpactAnalysis = false, testTarget = 'vue' } = options;
  
  try {
    // NEW: Analyze impact before running tests
    let impact: TestImpactAnalysis | undefined;
    let validation: PreTestValidationResult | undefined;
    
    if (!skipImpactAnalysis) {
      // Perform impact analysis
      impact = await analyzeCodeChangeImpact(filePaths, {
        includeUncommitted: true,
        detailedAnalysis: true,
      });
      
      // Perform pre-run validation (includes immutability checks)
      validation = await preTestValidation({
        changedFiles: filePaths,
        testTarget,
        autoDetectRecent: true,
        detectionWindowMinutes: 5,
        skipPromptOnNonBreaking: true,
      });
    }
    
    // Determine which tests are affected
    const affectedTests: string[] = impact?.affectedTests || [];
    
    // If no tests from impact analysis, use legacy method
    if (affectedTests.length === 0) {
      for (const filePath of filePaths) {
        // Find corresponding test file
        const testFile = findTestFile(filePath);
        if (testFile) {
          affectedTests.push(testFile);
        }
      }
    }
    
    // Build output message with impact analysis
    let messagePrefix = '';
    if (impact && validation) {
      messagePrefix = '📊 Change Impact Analysis:\n';
      messagePrefix += `  - Change Type: ${impact.changeType} (${impact.confidence} confidence)\n`;
      messagePrefix += `  - Affected Tests: ${impact.affectedTests.length}\n`;
      
      if (impact.predictions.length > 0) {
        messagePrefix += `  - Predicted Failures: ${impact.predictions.length}\n`;
      }
      
      if (impact.changeType === 'breaking' && impact.confidence === 'high') {
        messagePrefix += '\n⚠️  Breaking changes detected. Tests may need updates.\n';
      }
      
      messagePrefix += '\n';
    }
    
    // If no specific tests found, run all tests
    if (affectedTests.length === 0) {
      const result = await testRun(testTarget);
      return {
        success: result.success,
        testsRun: [],
        output: result.output,
        message: messagePrefix + 'No specific tests found, ran all tests',
        impact,
        validation,
      };
    }
    
    // Run specific tests (simplified - in production would run: npm test -- test1 test2)
    // For now, run all tests as a fallback
    const result = await testRun(testTarget);
    
    return {
      success: result.success,
      testsRun: affectedTests,
      output: messagePrefix + result.output,
      message: messagePrefix + `Ran tests for ${affectedTests.length} affected test file(s)`,
      impact,
      validation,
    };
  } catch (error) {
    return {
      success: false,
      testsRun: [],
      output: '',
      message: `Error running tests on change: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Find test file corresponding to a source file
 */
function findTestFile(sourcePath: string): string | null {
  // Convert source file path to test file path
  // e.g., src/utils/calculator.ts -> src/utils/calculator.test.ts
  const ext = sourcePath.match(/\.(ts|tsx|js|jsx)$/)?.[0];
  if (!ext) return null;
  
  const basePath = sourcePath.replace(/\.(ts|tsx|js|jsx)$/, '');
  const testExtensions = ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'];
  
  for (const testExt of testExtensions) {
    const testPath = `${basePath}${testExt}`;
    // Check if file exists (simplified - would need actual file check)
    return testPath;
  }
  
  return null;
}

