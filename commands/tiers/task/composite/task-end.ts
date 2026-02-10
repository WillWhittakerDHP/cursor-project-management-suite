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
import { TEST_CONFIG } from '../../../testing/utils/test-config';
import { analyzeTestError } from '../../../testing/composite/test-error-analyzer';
import { requestTestFileFixPermission } from '../../../testing/composite/test-file-fix-permission';
import { 
  analyzeCodeChangeImpact, 
  getRecentlyModifiedFiles 
} from '../../../testing/composite/test-change-detector';
import { CommandExecutionMode, isPlanMode, resolveCommandExecutionMode } from '../../../utils/command-execution-mode';
import { auditVueArchitecture } from '../../../audit/atomic/audit-vue-architecture';

export interface TaskEndParams {
  taskId: string;
  taskEntry: TaskEntry;
  nextTask?: string; // Optional: next task ID
  runTests?: boolean; // Set by user prompt before command execution. Default: true if not specified, but should be explicitly set via prompt.
  testTarget?: string; // Test target: vue/server/all (default: vue)
  featureName?: string; // Optional feature name (defaults to 'vue-migration')
  addComments?: boolean; // Default: true, set to false to skip comment review
  modifiedFiles?: string[]; // Optional: list of files modified in this task for comment review
  mode?: CommandExecutionMode; // Plan vs execute (plan mode performs no side effects)
  vueArchitectureOverride?: {
    reason: string;
    followUpTaskId: string;
  };
}

export async function taskEnd(params: TaskEndParams): Promise<{
  success: boolean;
  output: string;
}> {
  const featureName = params.featureName || 'vue-migration';
  const context = new WorkflowCommandContext(featureName);
  const mode = resolveCommandExecutionMode(params);
  
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

  if (isPlanMode(mode)) {
    const shouldRunTests = params.runTests ?? TEST_CONFIG.defaultRunTests;
    const shouldAddComments = params.addComments ?? true;
    return {
      success: true,
      output: [
        'Mode: plan (no side effects).',
        '',
        'Would execute:',
        '- Gate: run Vue architecture audit (client) and block if failing unless override provided',
        `- Append formatted task entry to session log: \`${sessionLogPath}\``,
        `- Mark task complete in session guide (checkbox) for \`${params.taskId}\``,
        shouldAddComments ? '- Optional: review/add comments for modified files' : '- Skip comment review (addComments=false)',
        shouldRunTests ? '- Run tests (blocking) with change impact analysis' : '- Skip tests (runTests=false)',
      ].join('\n'),
    };
  }
  
  try {
    // Gate 0: Vue architecture consistency (blocking unless explicitly overridden)
    const vueAudit = await auditVueArchitecture({
      tier: 'task',
      identifier: params.taskId,
      featureName,
      modifiedFiles: params.modifiedFiles,
    });

    if (vueAudit.status === 'fail' && !params.vueArchitectureOverride) {
      const topFindings = vueAudit.findings.slice(0, 12).map(f => `- ${f.type.toUpperCase()}: ${f.message}${f.location ? ` (${f.location})` : ''}`);
      return {
        success: false,
        output: [
          '❌ Vue architecture gate failed.',
          '',
          'This prevents completing the task until component/composable boundaries are corrected.',
          '',
          `Summary: ${vueAudit.summary || ''}`.trim(),
          '',
          'Top findings:',
          ...topFindings,
          '',
          'To proceed anyway (not recommended), re-run `/task-end` with:',
          '`vueArchitectureOverride: { reason: "...", followUpTaskId: "X.Y.Z" }`',
          '',
          'Reference:',
          '- `.project-manager/patterns/vue-architecture-contract.md`',
          '- `.project-manager/patterns/composable-taxonomy.md`',
        ].join('\n'),
      };
    }

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

    if (params.vueArchitectureOverride) {
      sessionLogContent += [
        '',
        '---',
        '',
        '## Gate Override: Vue Architecture',
        `**Reason:** ${params.vueArchitectureOverride.reason}`,
        `**Follow-up Task:** ${params.vueArchitectureOverride.followUpTaskId}`,
        '',
      ].join('\n');
    }

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
    
    // Run tests if requested (blocking)
    let testOutput = '';
    const shouldRunTests = params.runTests ?? TEST_CONFIG.defaultRunTests;
    if (params.runTests === undefined) {
      console.warn('runTests not explicitly set - using default: true');
    }
    
    if (shouldRunTests) {
      try {
        const testTarget = params.testTarget || TEST_CONFIG.defaultTarget;
        
        // NEW: Analyze change impact before running tests
        let impactAnalysisOutput = '';
        try {
          // Use modified files if provided, otherwise detect recent changes
          const filesToAnalyze = params.modifiedFiles && params.modifiedFiles.length > 0
            ? params.modifiedFiles
            : await getRecentlyModifiedFiles(TEST_CONFIG.watchMode.detectionWindow);
          
          if (filesToAnalyze.length > 0) {
            const impact = await analyzeCodeChangeImpact(filesToAnalyze, {
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
              
              // Add to test output
              testOutput += impactAnalysisOutput;
            }
          }
        } catch (error) {
          // Non-fatal: If change detection fails, continue without it
          console.error('Change detection failed (non-fatal):', error);
        }
        
        const testResult = await testEndWorkflow('task', params.taskId, testTarget);
        
        if (!testResult.success) {
          // Analyze error
          if (TEST_CONFIG.analyzeErrors) {
            try {
              const testFiles = params.modifiedFiles?.filter(f => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f)) || [];
              const appFiles = params.modifiedFiles?.filter(f => !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f)) || [];
              
              const errorAnalysis = await analyzeTestError(
                testResult.results.run.output,
                testFiles,
                appFiles
              );
              
              // If test code error and fixes allowed, request permission
              if (errorAnalysis.isTestCodeError && TEST_CONFIG.allowTestFileFixes) {
                const permission = await requestTestFileFixPermission(
                  errorAnalysis,
                  `task-end-${params.taskId}`
                );
                
                return {
                  success: false,
                  output: `Test code error detected. Permission required to fix test file.\n\n${JSON.stringify(permission, null, 2)}\n\nPlease grant permission to fix test file, then re-run task-end.`,
                };
              } else if (errorAnalysis.isTestCodeError) {
                return {
                  success: false,
                  output: `Test code error detected but test file fixes are disabled. Please fix test file manually.\n\nError: ${errorAnalysis.recommendation}`,
                };
              } else {
                // App code error - block workflow
                return {
                  success: false,
                  output: `Tests failed: ${testResult.message}\n\nError Analysis: ${errorAnalysis.recommendation}`,
                };
              }
            } catch (error) {
              // Error analysis failed - block workflow to be safe
              return {
                success: false,
                output: `Tests failed and error analysis failed: ${error instanceof Error ? error.message : String(error)}`,
              };
            }
          } else {
            // Error analysis disabled - block workflow
            return {
              success: false,
              output: `Tests failed: ${testResult.message}`,
            };
          }
        }
        
        testOutput = `\nTests passed: ${testResult.message}`;
      } catch (error) {
        return {
          success: false,
          output: `Test execution failed: ${error instanceof Error ? error.message : String(error)}`,
        };
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

