/**
 * Atomic Command: /test-analyze-impact [file-paths...]
 * Analyze impact of code changes on tests
 * 
 * This command analyzes code changes and predicts which tests will be affected
 * and what kind of failures to expect. It does NOT modify tests.
 * 
 * LEARNING: Proactive analysis helps users prepare for test updates
 * WHY: Better UX - know what to expect before tests fail
 * PATTERN: Analyzer pattern - gathers data and provides insights without actions
 */

import { analyzeCodeChangeImpact, TestImpactAnalysis } from '../composite/test-change-detector';

export interface TestImpactAnalysisCommandResult {
  success: boolean;
  impact: TestImpactAnalysis;
  message: string;
}

/**
 * Analyze impact of code changes on tests
 * 
 * @param changedFiles Array of file paths that changed
 * @param options Analysis options
 */
export async function testAnalyzeImpact(
  changedFiles: string[],
  options: {
    includeUncommitted?: boolean;
    detailedAnalysis?: boolean;
  } = {}
): Promise<TestImpactAnalysisCommandResult> {
  try {
    const {
      includeUncommitted = true,
      detailedAnalysis = true,
    } = options;
    
    // Perform impact analysis
    const impact = await analyzeCodeChangeImpact(changedFiles, {
      includeUncommitted,
      detailedAnalysis,
    });
    
    // Build message
    let message = '📊 Test Impact Analysis\n\n';
    message += impact.summary;
    
    if (impact.predictions.length > 0) {
      message += '\n\nDetailed Predictions:\n';
      for (const prediction of impact.predictions) {
        message += `\n  📄 ${prediction.testFile}:\n`;
        message += `     Likely to fail: ${prediction.likelyFailures.join(', ')}\n`;
        message += `     Reason: ${prediction.reason}\n`;
        message += `     Action: ${prediction.suggestedAction}\n`;
      }
    }
    
    if (impact.detectedChanges.length > 0) {
      message += '\n\nDetected Changes:\n';
      for (const change of impact.detectedChanges) {
        message += `  - ${change.type}: ${change.details} (in ${change.location})\n`;
      }
    }
    
    return {
      success: true,
      impact,
      message,
    };
  } catch (error) {
    return {
      success: false,
      impact: {
        affectedTests: [],
        changeType: 'unknown',
        confidence: 'low',
        predictions: [],
        shouldPromptBeforeRunning: false,
        summary: 'Error analyzing impact',
        detectedChanges: [],
      },
      message: `Error analyzing impact: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}


