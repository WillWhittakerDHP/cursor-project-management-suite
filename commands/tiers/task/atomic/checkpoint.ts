/**
 * Atomic Command: /task-checkpoint [X.Y.Z] [notes] [testTarget]
 * Task-level quality check without full end-of-session overhead
 * Updates log only (not handoff), doesn't commit/push
 * 
 * Tier: Task (Tier 3 - Low-Level)
 * Operates on: Task-level checkpoints embedded in session log
 * 
 * Alias: /checkpoint (for backward compatibility)
 * 
 * Watch Mode: Runs tests in watch mode (mandatory with smart detection fallback)
 * - Smart detection checks file modifications, git status, and session context
 * - If tests fail, automatically analyzes errors and prompts for resolution
 * - Supports prompt-driven resolution: fix test file, fix app code, skip, or stop
 */

import { verify } from '../../../utils/verify';
import { appendLog } from '../../../utils/append-log';
import { getCurrentDate } from '../../../utils/utils';
import { WorkflowId } from '../../../utils/id-utils';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { TEST_CONFIG } from '../../../testing/utils/test-config';
import { shouldEnableWatchMode } from '../../../testing/utils/smart-detection';
import { 
  runInitialTestExecution,
  parseTestOutput 
} from '../../../testing/utils/watch-mode-handler';
import { analyzeTestError } from '../../../testing/composite/test-error-analyzer';
import { analyzeCodeChangeImpact, getRecentlyModifiedFiles } from '../../../testing/composite/test-change-detector';
import { resolveFeatureName } from '../../../utils';

export async function taskCheckpoint(
  taskId: string, 
  notes?: string, 
  featureName?: string,
  testTarget?: string
): Promise<{
  success: boolean;
  output: string;
}> {
  const resolvedFeatureName = await resolveFeatureName(featureName);
  const context = new WorkflowCommandContext(resolvedFeatureName);
  const target = testTarget || TEST_CONFIG.defaultTarget;

  // Run quality checks (lint/type-check)
  const verifyResult = await verify('vue', false);
  
  if (!verifyResult.success) {
    return {
      success: false,
      output: 'Quality checks failed. Fix errors before continuing.',
    };
  }
  
  // Guard: If the master test switch is off, skip all test execution
  if (!TEST_CONFIG.enabled) {
    return {
      success: true,
      output: 'Quality checks passed. Tests skipped (TEST_ENABLED is not set to true).',
    };
  }
  
  // Analyze change impact before running tests
  let impactAnalysisOutput = '';
  try {
    const changedFiles = await getRecentlyModifiedFiles(TEST_CONFIG.watchMode.detectionWindow);
    
    if (changedFiles.length > 0) {
      const impact = await analyzeCodeChangeImpact(changedFiles, {
        includeUncommitted: true,
        detailedAnalysis: true,
      });
      
      if (impact.affectedTests.length > 0) {
        impactAnalysisOutput = `\n📊 Change Impact Analysis:\n`;
        impactAnalysisOutput += `  - Change Type: ${impact.changeType} (${impact.confidence} confidence)\n`;
        impactAnalysisOutput += `  - Affected Tests: ${impact.affectedTests.length}\n`;
        
        if (impact.predictions.length > 0) {
          impactAnalysisOutput += `  - Predicted Failures: ${impact.predictions.length}\n`;
        }
        
        if (impact.changeType === 'breaking' && impact.confidence === 'high') {
          impactAnalysisOutput += `  ⚠️  Breaking changes detected - tests may need updates\n`;
        }
      }
    }
  } catch (error) {
    // Non-fatal: If change detection fails, continue without it
    console.error('Change detection failed (non-fatal):', error);
  }
  
  // Determine if watch mode should be enabled
  let watchModeEnabled = false;
  let watchModeReason = '';
  
  if (TEST_CONFIG.watchMode.enabled) {
    if (TEST_CONFIG.watchMode.smartDetection) {
      const detectionResult = await shouldEnableWatchMode(
        context,
        TEST_CONFIG.watchMode.detectionWindow
      );
      watchModeEnabled = detectionResult.enabled;
      watchModeReason = detectionResult.reason;
    } else {
      // Mandatory watch mode (no smart detection)
      watchModeEnabled = true;
      watchModeReason = 'Watch mode enabled (mandatory mode)';
    }
  }
  
  let testStatus = '✅ Quality checks passed';
  let testOutput = '';
  
  // Run tests (watch mode if enabled, single-run otherwise)
  if (watchModeEnabled) {
    // Run initial test execution in foreground
    const initialTest = await runInitialTestExecution(target);
    
    if (!initialTest.success) {
      // Tests failed on initial run - analyze and prompt
      const parsed = parseTestOutput(initialTest.output);
      
      if (parsed.failed) {
        // Extract files from output
        const testFilePattern = /([\w/\-.]+\.(?:test|spec)\.(?:ts|tsx|js|jsx))(?::\d+:\d+)?/g;
        const appFilePattern = /([\w/\-.]+\.(?:ts|tsx|js|jsx|vue))(?::\d+:\d+)?/g;
        const testMatches = Array.from(initialTest.output.matchAll(testFilePattern));
        const appMatches = Array.from(initialTest.output.matchAll(appFilePattern));
        const testFiles = Array.from(new Set(testMatches.map(m => m[1])));
        const appFiles = Array.from(new Set(
          appMatches.map(m => m[1]).filter(f => !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f))
        ));
        
        // Analyze error
        const errorAnalysis = await analyzeTestError(initialTest.output, testFiles, appFiles);
        
        // Build error message for user
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

        testStatus = `⚠️ Tests failed: ${errorAnalysis.errorType} error (${errorAnalysis.confidence} confidence)`;
        testOutput = errorMessage;
        
        // Note: Actual user prompting will be handled by the command handler
        // This function returns the error information for the handler to use
      } else {
        testStatus = '✅ Quality checks and initial tests passed';
        testOutput = 'Watch mode will continue in background.';
      }
    } else {
      testStatus = '✅ Quality checks and initial tests passed';
      testOutput = 'Watch mode will continue in background.';
    }
  } else {
    // Single-run test execution (non-interactive or watch disabled)
    const testResult = await runInitialTestExecution(target);
    
    if (testResult.success) {
      testStatus = '✅ Quality checks and tests passed';
      testOutput = testResult.output;
    } else {
      testStatus = '⚠️ Tests failed';
      testOutput = testResult.output;
    }
  }
  
  // Extract session ID from task ID (X.Y.Z -> X.Y)
  const parsed = WorkflowId.parseTaskId(taskId);
  const sessionId = parsed ? parsed.sessionId : undefined;
  
  // Create checkpoint entry
  const checkpointEntry = `### Task Checkpoint: ${taskId}
**Time**: ${getCurrentDate()}
**Status**: ${testStatus}
${watchModeEnabled ? `**Watch Mode**: ${watchModeReason}` : ''}
${notes ? `**Notes**: ${notes}` : ''}
${testOutput ? `**Test Output**: ${testOutput}` : ''}
`;
  
  // Update log (lightweight entry) - use session-specific log if sessionId available
  await appendLog(checkpointEntry, sessionId);
  
  const outputMessage = watchModeEnabled
    ? `✅ Task checkpoint complete. ${testStatus}. Watch mode: ${watchModeReason}`
    : `✅ Task checkpoint complete. ${testStatus}`;
  
  return {
    success: verifyResult.success,
    output: impactAnalysisOutput + outputMessage + (testOutput ? `\n\n${testOutput}` : ''),
  };
}

// Backward compatibility alias
export const checkpoint = taskCheckpoint;

