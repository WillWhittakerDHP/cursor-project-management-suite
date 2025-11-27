/**
 * Composite Command: /task-end [X.Y.Z]
 * Complete task, update task log, prepare for next task
 * 
 * Tier: Task (Tier 3 - Low-Level)
 * Operates on: Task-level workflow (completes task, updates task log embedded in session log, marks task complete in session guide)
 */

import { readProjectFile, writeProjectFile, PROJECT_ROOT } from '../../../utils/utils';
import { formatTaskEntry, TaskEntry } from '../atomic/format-task-entry';
import { markTaskComplete } from './mark-task-complete';
import { join } from 'path';
import { testEndWorkflow } from '../../../testing/composite/test-end-workflow';
import { WorkflowId } from '../../../utils/id-utils';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { reviewFile } from '../../../comments/atomic/review-file';

export interface TaskEndParams {
  taskId: string;
  taskEntry: TaskEntry;
  nextTask?: string; // Optional: next task ID
  runTests?: boolean; // If true, run tests before ending task
  testTarget?: string; // Test target: vue/server/all (default: vue)
  featureName?: string; // Optional feature name (defaults to 'vue-migration')
  addComments?: boolean; // Default: true, set to false to skip comment review
  modifiedFiles?: string[]; // Optional: list of files modified in this task for comment review
}

export async function taskEnd(params: TaskEndParams): Promise<{
  success: boolean;
  output: string;
}> {
  const featureName = params.featureName || 'vue-migration';
  const context = new WorkflowCommandContext(featureName);
  
  // Parse task ID to get session ID
  const parsed = WorkflowId.parseTaskId(params.taskId);
  if (!parsed) {
    return {
      success: false,
      output: 'Error: Invalid task ID format. Expected X.Y.Z (e.g., 1.3.1)'
    };
  }
  
  const sessionId = `${parsed.phase}.${parsed.session}`;
  const sessionLogPath = context.paths.getSessionLogPath(sessionId);
  
  try {
    // Format task entry
    const formattedEntry = formatTaskEntry(params.taskEntry);
    
    // Append to session log with explicit error handling
    let sessionLogContent = '';
    try {
      sessionLogContent = await readProjectFile(sessionLogPath);
    } catch (error) {
      // Create new session log if it doesn't exist, but log the error
      const fullPath = join(PROJECT_ROOT, sessionLogPath);
      console.warn(
        `WARNING: Session log not found, creating new one\n` +
        `Attempted: ${sessionLogPath}\n` +
        `Full Path: ${fullPath}\n` +
        `Tier: Task (Tier 3 - Low-Level)\n` +
        `Error: ${error instanceof Error ? error.message : String(error)}\n`
      );
      sessionLogContent = `# Session ${sessionId} Log\n\n`;
    }
    
    sessionLogContent += '\n' + formattedEntry + '\n';
    await writeProjectFile(sessionLogPath, sessionLogContent);
    
    // Mark task complete in session guide (update checkbox)
    let markCompleteOutput = '';
    try {
      markCompleteOutput = await markTaskComplete({
        taskId: params.taskId,
        entry: params.taskEntry,
        featureName: featureName,
      });
    } catch (error) {
      // Don't fail entire task-end if this fails, but include warning in output
      markCompleteOutput = `Warning: Failed to mark task complete in session guide: ${error instanceof Error ? error.message : String(error)}`;
    }
    
    // Run tests if requested
    let testOutput = '';
    if (params.runTests) {
      try {
        const testTarget = params.testTarget || 'vue';
        const testResult = await testEndWorkflow('task', params.taskId, testTarget);
        testOutput = testResult.success 
          ? `\nTests passed: ${testResult.message}`
          : `\n⚠️ Tests failed: ${testResult.message}`;
        // Don't fail task-end if tests fail, but log it
      } catch (error) {
        testOutput = `\n⚠️ Test execution failed (non-critical): ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    
    // Review files for comment suggestions (if enabled and files provided)
    let commentReviewOutput = '';
    if (params.addComments !== false && params.modifiedFiles && params.modifiedFiles.length > 0) {
      try {
        const commentSuggestions: string[] = [];
        for (const filePath of params.modifiedFiles) {
          try {
            const reviewResult = await reviewFile(filePath);
            // Only include in output if there are suggestions (not "No comment suggestions")
            if (reviewResult.includes('## Suggestions') && !reviewResult.includes('✅ **No comment suggestions**')) {
              commentSuggestions.push(`\n### ${filePath}\n${reviewResult}`);
            }
          } catch (error) {
            // Don't fail task-end if comment review fails for a file
            console.warn(`Comment review failed for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        
        if (commentSuggestions.length > 0) {
          commentReviewOutput = `\n\n## Comment Suggestions\n` +
            `Review the following files for learning-focused comments:\n` +
            commentSuggestions.join('\n') +
            `\n\nUse /comment-add to add comments based on suggestions above.`;
        }
      } catch (error) {
        // Don't fail task-end if comment review fails, but log it
        commentReviewOutput = `\n⚠️ Comment review failed (non-critical): ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    
    const outputMessages = [
      `Task ${params.taskId} completed. Log entry added to session log.`,
    ];
    if (markCompleteOutput) {
      outputMessages.push(markCompleteOutput);
    }
    if (testOutput) {
      outputMessages.push(testOutput);
    }
    if (commentReviewOutput) {
      outputMessages.push(commentReviewOutput);
    }
    
    // Run audit (non-blocking)
    let auditOutput = '';
    try {
      const { auditTask } = await import('../../../audit/composite/audit-task');
      const { readFile } = await import('fs/promises');
      const testResults = params.runTests && testOutput ? { success: testOutput.includes('passed') } : undefined;
      const auditResult = await auditTask({
        taskId: params.taskId,
        featureName: featureName,
        modifiedFiles: params.modifiedFiles,
        testResults,
      });
      
      // Open audit report file in editor
      if (auditResult.fullReportPath) {
        try {
          await readFile(auditResult.fullReportPath, 'utf-8');
          // File read will cause it to open in editor
        } catch {
          // If file doesn't exist yet, that's okay
        }
      }
      
      auditOutput = `\n\n## Audit Results\n${auditResult.output}`;
      if (!auditResult.success) {
        auditOutput += '\n⚠️ Audit completed with issues. Review audit report.';
      }
    } catch (error) {
      auditOutput = `\n\n⚠️ Audit failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
        `You can run /audit-task ${params.taskId} manually.`;
    }
    
    if (auditOutput) {
      outputMessages.push(auditOutput);
    }
    
    return {
      success: true,
      output: outputMessages.join('\n')
    };
  } catch (error) {
    const fullPath = join(PROJECT_ROOT, sessionLogPath);
    return {
      success: false,
      output: `ERROR: Failed to complete task\n` +
        `Task ID: ${params.taskId}\n` +
        `Session Log Path: ${sessionLogPath}\n` +
        `Full Path: ${fullPath}\n` +
        `Tier: Task (Tier 3 - Low-Level)\n` +
        `Error Details: ${error instanceof Error ? error.message : String(error)}\n` +
        `Suggestion: Check file permissions and ensure session log directory exists`
    };
  }
}

