/**
 * Composite Command: Test Pre-Run Validation
 * 
 * Validates code changes and prompts user BEFORE running tests if breaking changes detected.
 * This provides proactive warnings without auto-modifying tests.
 * 
 * LEARNING: Pre-run validation gives users control over test execution
 * WHY: Better UX - users can decide whether to proceed when breaking changes detected
 * PATTERN: Chain of Responsibility - validation steps can be chained
 * COMPARISON: Unlike auto-updating tests, this preserves test integrity while providing awareness
 */

import { analyzeCodeChangeImpact, TestImpactAnalysis, getRecentlyModifiedFiles } from './test-change-detector';
import { testCheckImmutableWithContext } from '../utils/test-immutability';

/**
 * Options for pre-run validation
 */
export interface PreTestValidationOptions {
  changedFiles?: string[]; // Specific files that changed (if known)
  testTarget: 'vue' | 'server' | 'all';
  autoDetectRecent?: boolean; // Auto-detect recently modified files (default: true)
  detectionWindowMinutes?: number; // Window for recent file detection (default: 5)
  skipPromptOnNonBreaking?: boolean; // Skip prompt if no breaking changes (default: true)
}

/**
 * Result of pre-run validation
 */
export interface PreTestValidationResult {
  shouldProceed: boolean;
  impact: TestImpactAnalysis;
  immutabilityOverrides: Array<{
    testFile: string;
    canModify: boolean;
    reason: string;
  }>;
  userPrompted: boolean;
  message: string;
}

/**
 * Pre-test validation workflow
 * 
 * Analyzes changes and prompts if breaking changes detected.
 * Returns whether to proceed with test execution.
 */
export async function preTestValidation(
  options: PreTestValidationOptions
): Promise<PreTestValidationResult> {
  const {
    changedFiles = [],
    autoDetectRecent = true,
    detectionWindowMinutes = 5,
    skipPromptOnNonBreaking = true,
  } = options;
  
  // Step 1: Gather all changed files
  let allChangedFiles = [...changedFiles];
  
  if (autoDetectRecent) {
    const recentFiles = await getRecentlyModifiedFiles(detectionWindowMinutes);
    allChangedFiles.push(...recentFiles);
  }
  
  // Remove duplicates
  allChangedFiles = Array.from(new Set(allChangedFiles));
  
  // If no changed files, proceed without validation
  if (allChangedFiles.length === 0) {
    return {
      shouldProceed: true,
      impact: {
        affectedTests: [],
        changeType: 'unknown',
        confidence: 'low',
        predictions: [],
        shouldPromptBeforeRunning: false,
        summary: 'No changed files detected. Proceeding with tests.',
        detectedChanges: [],
      },
      immutabilityOverrides: [],
      userPrompted: false,
      message: 'No changed files detected. Tests will run normally.',
    };
  }
  
  // Step 2: Analyze change impact
  const impact = await analyzeCodeChangeImpact(allChangedFiles, {
    includeUncommitted: true,
    detailedAnalysis: true,
  });
  
  // Step 3: Check immutability for affected tests with context
  const immutabilityOverrides: Array<{
    testFile: string;
    canModify: boolean;
    reason: string;
  }> = [];
  
  for (const testFile of impact.affectedTests) {
    const immutabilityCheck = await testCheckImmutableWithContext(testFile, {
      recentCodeChanges: allChangedFiles,
      changeType: impact.changeType === 'breaking' ? 'feature' : undefined,
      userIntent: 'pre-run-validation',
    });
    
    immutabilityOverrides.push({
      testFile,
      canModify: immutabilityCheck.canModify,
      reason: immutabilityCheck.message,
    });
  }
  
  // Step 4: Determine if we should prompt user
  const shouldPrompt = 
    impact.shouldPromptBeforeRunning ||
    (!skipPromptOnNonBreaking && impact.affectedTests.length > 0);
  
  // Step 5: Build message
  const message = buildValidationMessage(
    impact,
    immutabilityOverrides,
    shouldPrompt
  );
  
  // Step 6: Return result (prompt handling done by caller)
  return {
    shouldProceed: !shouldPrompt, // If prompt needed, don't auto-proceed
    impact,
    immutabilityOverrides,
    userPrompted: shouldPrompt,
    message,
  };
}

/**
 * Build validation message for user
 */
function buildValidationMessage(
  impact: TestImpactAnalysis,
  immutabilityOverrides: Array<{ testFile: string; canModify: boolean; reason: string }>,
  shouldPrompt: boolean
): string {
  let message = impact.summary;
  
  if (shouldPrompt) {
    message += '\n\n⚠️  BREAKING CHANGES DETECTED\n';
    message += '\nImpact Analysis:\n';
    message += `  - Changed Files: ${impact.detectedChanges.length}\n`;
    message += `  - Affected Tests: ${impact.affectedTests.length}\n`;
    message += `  - Change Type: ${impact.changeType}\n`;
    message += `  - Confidence: ${impact.confidence}\n`;
    
    if (impact.predictions.length > 0) {
      message += '\nPredicted Test Failures:\n';
      for (const prediction of impact.predictions) {
        message += `\n  📄 ${prediction.testFile}:\n`;
        message += `     Likely failures: ${prediction.likelyFailures.join(', ')}\n`;
        message += `     Reason: ${prediction.reason}\n`;
        message += `     Suggested: ${prediction.suggestedAction}\n`;
      }
    }
    
    // Show immutability status
    const immutableTests = immutabilityOverrides.filter(t => !t.canModify);
    const modifiableTests = immutabilityOverrides.filter(t => t.canModify);
    
    if (modifiableTests.length > 0) {
      message += '\n✅ Test Modification Status:\n';
      for (const test of modifiableTests) {
        message += `  - ${test.testFile}: CAN MODIFY (${test.reason})\n`;
      }
    }
    
    if (immutableTests.length > 0) {
      message += '\n🔒 Immutable Tests (Cannot Modify):\n';
      for (const test of immutableTests) {
        message += `  - ${test.testFile}: ${test.reason}\n`;
      }
    }
    
    message += '\n---\n';
    message += 'This is a FEATURE CHANGE - test modifications are allowed for affected tests.\n';
    message += '\nOptions:\n';
    message += '  1. Proceed with test run (tests may fail, you can fix them after)\n';
    message += '  2. Cancel and update tests manually first\n';
    message += '  3. Mark as feature change and bypass immutability checks\n';
  } else {
    message += '\n\n✅ No breaking changes detected. Tests will run normally.\n';
  }
  
  return message;
}

/**
 * Simplified pre-validation that just reports (no prompting)
 * Useful for non-interactive contexts
 */
export async function preTestValidationReport(
  options: PreTestValidationOptions
): Promise<{
  impact: TestImpactAnalysis;
  report: string;
}> {
  const result = await preTestValidation(options);
  
  return {
    impact: result.impact,
    report: result.message,
  };
}


