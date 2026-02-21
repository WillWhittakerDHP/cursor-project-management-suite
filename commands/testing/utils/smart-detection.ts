/**
 * Smart Detection Utility
 * 
 * Detects when watch mode should be enabled based on:
 * - File modification timestamps
 * - Git status (uncommitted files)
 * - Session context (test-writing indicators)
 * 
 * LEARNING: Multi-signal detection provides better accuracy than single indicators
 * WHY: Different development patterns require different detection methods
 * PATTERN: Strategy pattern - multiple detection strategies combined for robust detection
 */

import { stat, readdir } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import { PROJECT_ROOT, FRONTEND_ROOT } from '../../utils/utils';
import { WorkflowCommandContext } from '../../utils/command-context';

export interface DetectionResult {
  enabled: boolean;
  reason: string;
  signals: {
    fileModification: boolean;
    gitStatus: boolean;
    sessionContext: boolean;
  };
}

/**
 * Check if test files were modified recently
 */
async function checkFileModifications(
  detectionWindowMinutes: number
): Promise<{ detected: boolean; files: string[] }> {
  const cutoffTime = Date.now() - (detectionWindowMinutes * 60 * 1000);
  const testFilePattern = /\.(test|spec)\.(ts|tsx|js|jsx)$/;
  const modifiedFiles: string[] = [];
  
  try {
    // Check common test directories
    const testDirs = [
      join(PROJECT_ROOT, FRONTEND_ROOT, 'src'),
      join(PROJECT_ROOT, 'server', 'src'),
    ];
    
    for (const dir of testDirs) {
      try {
        const files = await findTestFiles(dir, testFilePattern);
        for (const file of files) {
          try {
            const stats = await stat(file);
            if (stats.mtime.getTime() > cutoffTime) {
              modifiedFiles.push(file);
            }
          } catch (err) {
            console.warn('Smart detection: file stat failed (may have been deleted)', file, err);
          }
        }
      } catch (err) {
        console.warn('Smart detection: directory not found or not readable', dir, err);
      }
    }
    
    // Also check app files (non-test files)
    for (const dir of testDirs) {
      try {
        const files = await findAppFiles(dir, testFilePattern);
        for (const file of files) {
          try {
            const stats = await stat(file);
            if (stats.mtime.getTime() > cutoffTime) {
              modifiedFiles.push(file);
            }
          } catch (err) {
            console.warn('Smart detection: app file stat failed (may have been deleted)', file, err);
          }
        }
      } catch (err) {
        console.warn('Smart detection: app directory not found or not readable', dir, err);
      }
    }
  } catch (err) {
    console.warn('Smart detection: failed to detect modified files', err);
    return { detected: false, files: [] };
  }
  
  return {
    detected: modifiedFiles.length > 0,
    files: modifiedFiles,
  };
}

/**
 * Recursively find test files
 */
async function findTestFiles(dir: string, pattern: RegExp): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and other common ignore directories
        if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
          files.push(...await findTestFiles(fullPath, pattern));
        }
      } else if (entry.isFile() && pattern.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    console.warn('Smart detection: findTestFiles directory not accessible', dir, err);
  }
  
  return files;
}

/**
 * Recursively find app files (non-test files)
 */
async function findAppFiles(dir: string, testPattern: RegExp): Promise<string[]> {
  const files: string[] = [];
  const appFilePattern = /\.(ts|tsx|js|jsx|vue)$/;
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and other common ignore directories
        if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
          files.push(...await findAppFiles(fullPath, testPattern));
        }
      } else if (entry.isFile() && 
                 appFilePattern.test(entry.name) && 
                 !testPattern.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    console.warn('Smart detection: findAppFiles directory not accessible', dir, err);
  }
  
  return files;
}

/**
 * Check git status for uncommitted test/app files
 */
function checkGitStatus(): { detected: boolean; files: string[] } {
  try {
    const statusOutput = execSync('git status --porcelain', {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
    });
    
    const testFilePattern = /\.(test|spec)\.(ts|tsx|js|jsx)$/;
    const appFilePattern = /\.(ts|tsx|js|jsx|vue)$/;
    
    const lines = statusOutput.trim().split('\n').filter(line => line.length > 0);
    const relevantFiles: string[] = [];
    
    for (const line of lines) {
      // Git status format: XY filename
      const filename = line.substring(3).trim();
      
      if (testFilePattern.test(filename) || 
          (appFilePattern.test(filename) && !testFilePattern.test(filename))) {
        relevantFiles.push(filename);
      }
    }
    
    return {
      detected: relevantFiles.length > 0,
      files: relevantFiles,
    };
  } catch (err) {
    console.warn('Smart detection: git not available or not a repo', err);
    return { detected: false, files: [] };
  }
}

/**
 * Check session context for test-writing indicators
 */
async function checkSessionContext(
  context: WorkflowCommandContext
): Promise<{ detected: boolean; reason: string }> {
  try {
    // Check session log for test-related keywords
    const sessionLog = await context.readFeatureLog();
    const testKeywords = [
      'test',
      'spec',
      'testing',
      'test file',
      'write test',
      'test case',
      'test suite',
      'unit test',
      'integration test',
    ];
    
    const lowerLog = sessionLog.toLowerCase();
    const hasTestKeywords = testKeywords.some(keyword => lowerLog.includes(keyword));
    
    if (hasTestKeywords) {
      return {
        detected: true,
        reason: 'Session log contains test-related keywords',
      };
    }
    
    // Check for test-writing phase indicators in recent entries
    const recentEntries = sessionLog.split('\n').slice(-50).join('\n');
    const hasRecentTestActivity = testKeywords.some(keyword => 
      recentEntries.toLowerCase().includes(keyword)
    );
    
    if (hasRecentTestActivity) {
      return {
        detected: true,
        reason: 'Recent session log entries contain test-related activity',
      };
    }
    
    return {
      detected: false,
      reason: 'No test-related activity detected in session context',
    };
  } catch (err) {
    console.warn('Smart detection: could not read session log for test context', err);
    return {
      detected: false,
      reason: 'Could not read session context',
    };
  }
}

/**
 * Determine if watch mode should be enabled based on multiple signals
 */
export async function shouldEnableWatchMode(
  context: WorkflowCommandContext,
  detectionWindowMinutes: number
): Promise<DetectionResult> {
  // Check file modifications
  const fileModResult = await checkFileModifications(detectionWindowMinutes);
  const fileModDetected = fileModResult.detected;
  
  // Check git status
  const gitResult = checkGitStatus();
  const gitDetected = gitResult.detected;
  
  // Check session context
  const sessionResult = await checkSessionContext(context);
  const sessionDetected = sessionResult.detected;
  
  // Enable watch mode if any signal is detected
  const enabled = fileModDetected || gitDetected || sessionDetected;
  
  // Build reason string
  const reasons: string[] = [];
  if (fileModDetected) {
    reasons.push(`File modifications detected (${fileModResult.files.length} files)`);
  }
  if (gitDetected) {
    reasons.push(`Uncommitted test/app files detected (${gitResult.files.length} files)`);
  }
  if (sessionDetected) {
    reasons.push(sessionResult.reason);
  }
  
  const reason = enabled
    ? `Watch mode enabled: ${reasons.join('; ')}`
    : 'Watch mode disabled: No detection signals found (will use mandatory fallback)';
  
  return {
    enabled,
    reason,
    signals: {
      fileModification: fileModDetected,
      gitStatus: gitDetected,
      sessionContext: sessionDetected,
    },
  };
}

