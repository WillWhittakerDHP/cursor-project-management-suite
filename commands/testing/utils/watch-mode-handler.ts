/**
 * Watch Mode Handler
 * 
 * Centralized watch mode execution with error monitoring and resolution.
 * Handles test execution, error parsing, analysis, and prompt-driven resolution.
 * 
 * LEARNING: Watch mode requires different execution patterns than single-run tests
 * WHY: Continuous monitoring needs event-driven error handling and user interaction
 * PATTERN: Observer pattern - monitor test output and react to failures
 */

import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import * as process from 'process';
import { PROJECT_ROOT, FRONTEND_ROOT } from '../../utils/utils';
import { analyzeTestError, TestErrorAnalysis } from '../composite/test-error-analyzer';
import { testRun } from '../atomic/test-run';

export interface WatchModeResult {
  success: boolean;
  output: string;
  errors?: TestErrorAnalysis[];
  stopped: boolean;
}

export interface WatchModeOptions {
  testTarget?: string;
  onFailure?: (error: TestErrorAnalysis) => Promise<'fix-test' | 'fix-app' | 'skip' | 'stop'>;
  onSuccess?: () => void;
  conversationTurn?: string;
}

/**
 * Parse test output to extract test results
 */
export function parseTestOutput(output: string): {
  passed: boolean;
  failed: boolean;
  testOutput: string;
  errorOutput?: string;
} {
  // Look for vitest/jest test result patterns
  const passedPattern = /(\d+)\s+passed/i;
  const failedPattern = /(\d+)\s+failed/i;
  const errorPattern = /FAIL\s+(.+?)(?=\n|$)/gi;
  
  const passedMatch = output.match(passedPattern);
  const failedMatch = output.match(failedPattern);
  
  const passed = passedMatch ? parseInt(passedMatch[1], 10) > 0 : false;
  const failed = failedMatch ? parseInt(failedMatch[1], 10) > 0 : false;
  
  // Extract error output if present
  const errorMatches = Array.from(output.matchAll(errorPattern));
  const errorOutput = errorMatches.length > 0 
    ? errorMatches.map(m => m[1]).join('\n')
    : undefined;
  
  return {
    passed: passed && !failed,
    failed,
    testOutput: output,
    errorOutput,
  };
}

/**
 * Extract test files and app files from error output
 */
function extractFilesFromOutput(output: string): {
  testFiles: string[];
  appFiles: string[];
} {
  const testFilePattern = /([\w/\-.]+\.(?:test|spec)\.(?:ts|tsx|js|jsx))(?::\d+:\d+)?/g;
  const appFilePattern = /([\w/\-.]+\.(?:ts|tsx|js|jsx|vue))(?::\d+:\d+)?/g;
  
  const testMatches = Array.from(output.matchAll(testFilePattern));
  const appMatches = Array.from(output.matchAll(appFilePattern));
  
  const testFiles = Array.from(new Set(testMatches.map(m => m[1])));
  const appFiles = Array.from(new Set(
    appMatches
      .map(m => m[1])
      .filter(f => !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f))
  ));
  
  return { testFiles, appFiles };
}

/**
 * Handle test failure with error analysis and resolution
 */
async function handleTestFailure(
  output: string,
  testTarget: string,
  options: WatchModeOptions
): Promise<'fix-test' | 'fix-app' | 'skip' | 'stop'> {
  const { testFiles, appFiles } = extractFilesFromOutput(output);
  
  // Analyze error
  const errorAnalysis = await analyzeTestError(output, testFiles, appFiles);
  
  // If custom handler provided, use it
  if (options.onFailure) {
    return await options.onFailure(errorAnalysis);
  }
  
  // Default: return based on error type
  if (errorAnalysis.isTestCodeError) {
    return 'fix-test';
  } else {
    return 'fix-app';
  }
}

/**
 * Execute watch mode with monitoring and error handling
 */
export async function executeWatchModeWithMonitoring(
  testTarget: string = 'vue',
  options: WatchModeOptions = {}
): Promise<WatchModeResult> {
  const target = options.testTarget || testTarget;

  // Build watch command
  const commands: Record<string, { cwd: string; command: string; args: string[] }> = {
    vue: {
      cwd: join(PROJECT_ROOT, 'client'),
      command: 'npm',
      args: ['run', 'test:watch'],
    },
    server: {
      cwd: join(PROJECT_ROOT, 'server'),
      command: 'npm',
      args: ['run', 'test', '--', '--watch'],
    },
    all: {
      cwd: join(PROJECT_ROOT, FRONTEND_ROOT),
      command: 'npm',
      args: ['run', 'test:watch'],
    },
  };
  
  const cmdConfig = commands[target] || commands.vue;
  const actualCommand = cmdConfig.command;
  const actualArgs = cmdConfig.args;
  const cwd = cmdConfig.cwd;
  
  return new Promise((resolve) => {
    let outputBuffer = '';
    let errorBuffer = '';
    let hasFailed = false;
    const errors: TestErrorAnalysis[] = [];
    let watchProcess: ChildProcess | null = null;
    let stopped = false;
    
    // Spawn watch process
    watchProcess = spawn(actualCommand, actualArgs, {
      cwd,
      shell: process.platform === 'win32', // Use shell on Windows, direct on Unix
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    // Collect stdout
    watchProcess.stdout?.on('data', async (data: Buffer) => {
      const chunk = data.toString();
      outputBuffer += chunk;
      
      // Check for test completion/failure
      const parsed = parseTestOutput(outputBuffer);
      
      if (parsed.failed && !hasFailed) {
        hasFailed = true;
        
        // Handle failure
        const action = await handleTestFailure(outputBuffer, target, options);
        
        if (action === 'stop') {
          stopped = true;
          watchProcess?.kill();
          resolve({
            success: false,
            output: outputBuffer,
            errors,
            stopped: true,
          });
          return;
        }
        
        // If we're continuing, we might want to analyze the error
        // For now, we'll continue watching
      } else if (parsed.passed && !parsed.failed && options.onSuccess) {
        options.onSuccess();
      }
    });
    
    // Collect stderr
    watchProcess.stderr?.on('data', (data: Buffer) => {
      errorBuffer += data.toString();
    });
    
    // Handle process exit
    watchProcess.on('exit', (code) => {
      const fullOutput = outputBuffer + (errorBuffer ? `\n${errorBuffer}` : '');
      resolve({
        success: code === 0 && !hasFailed,
        output: fullOutput,
        errors,
        stopped,
      });
    });
    
    // Handle process error
    watchProcess.on('error', (error) => {
      resolve({
        success: false,
        output: outputBuffer + `\nError: ${error.message}`,
        errors,
        stopped,
      });
    });
  });
}

/**
 * Prompt user for resolution action (for use in checkpoint/test-dev-workflow)
 * This function returns a promise that resolves when user makes a choice
 * In practice, this will be called by the command handler which can use ask_question
 */
export async function promptForResolution(
  errorAnalysis: TestErrorAnalysis
): Promise<'fix-test' | 'fix-app' | 'skip' | 'stop'> {
  // This is a placeholder - actual implementation will use ask_question tool
  // The command handler (checkpoint.ts, test-dev-workflow.ts) will call this
  // and handle the actual prompting
  
  // For now, return default based on error type
  if (errorAnalysis.isTestCodeError) {
    return 'fix-test';
  } else {
    return 'fix-app';
  }
}

/**
 * Run initial test execution (foreground) before starting watch mode
 */
export async function runInitialTestExecution(
  testTarget: string = 'vue'
): Promise<{ success: boolean; output: string }> {
  return await testRun(testTarget);
}

