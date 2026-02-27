/**
 * Task-end implementation. Thin adapter: builds context + hooks, runs shared tier end workflow.
 * Returns { success, output, outcome } with no steps record.
 */

import { readProjectFile, writeProjectFile, PROJECT_ROOT } from '../../../utils/utils';
import { formatTaskEntry, TaskEntry } from '../atomic/format-task-entry';
import { markTaskComplete } from './task';
import { join } from 'path';
import { testEndWorkflow } from '../../../testing/composite/test-end-workflow';
import { WorkflowId } from '../../../utils/id-utils';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { reviewFile } from '../../../comments/atomic/review-file';
import { TEST_CONFIG } from '../../../testing/utils/test-config';
import { analyzeTestError } from '../../../testing/composite/test-error-analyzer';
import { requestTestFileFixPermission } from '../../../testing/composite/test-file-fix-permission';
import { analyzeCodeChangeImpact, getRecentlyModifiedFiles } from '../../../testing/composite/test-change-detector';
import { CommandExecutionMode } from '../../../utils/command-execution-mode';
import { auditVueArchitecture } from '../../../audit/atomic/audit-vue-architecture';
import { areAllTasksInSessionComplete } from '../../../utils/phase-session-utils';
import { resolveFeatureName, resolveFeatureId } from '../../../utils/feature-context';
import { TASK_CONFIG } from '../../configs/task';
import { resolveRunTests } from '../../../utils/tier-end-utils';
import { buildTierEndOutcome, type TierEndOutcome } from '../../../utils/tier-outcome';
import { buildCascadeUp, buildCascadeAcross } from '../../../utils/tier-cascade';
import { gitCommit } from '../../../git/atomic/commit';
import { readTierScope, formatScopeCommitPrefix } from '../../../utils/tier-scope';
import type {
  TierEndWorkflowContext,
  TierEndWorkflowHooks,
  TierEndWorkflowResult,
  StepExitResult,
} from '../../shared/tier-end-workflow';
import { runTierEndWorkflow } from '../../shared/tier-end-workflow';

export interface TaskEndParams {
  taskId: string;
  /** Optional; when omitted a minimal entry is used so log/guide updates succeed. */
  taskEntry?: Partial<TaskEntry>;
  nextTask?: string;
  runTests?: boolean;
  testTarget?: string;
  featureId?: string;
  addComments?: boolean;
  modifiedFiles?: string[];
  mode?: CommandExecutionMode;
  vueArchitectureOverride?: { reason: string; followUpTaskId: string };
}

export async function taskEndImpl(params: TaskEndParams): Promise<{
  success: boolean;
  output: string;
  outcome: TierEndOutcome;
}> {
  const featureName = params.featureId != null && params.featureId.trim() !== ''
    ? await resolveFeatureId(params.featureId)
    : await resolveFeatureName();
  const context = new WorkflowCommandContext(featureName);

  const parsed = WorkflowId.parseTaskId(params.taskId);
  if (!parsed) {
    return {
      success: false,
      output: 'Error: Invalid task ID format. Expected X.Y.Z.A (e.g., 4.1.3.1)',
      outcome: buildTierEndOutcome('failed', 'invalid_task_id', 'Use a valid task ID (X.Y.Z.A).'),
    };
  }

  const sessionId = parsed.sessionId;
  const sessionLogPath = context.paths.getSessionLogPath(sessionId);
  const steps: Record<string, { success: boolean; output: string }> = {};
  const output: string[] = [];
  const outcome = buildTierEndOutcome('completed', 'task_complete', '');

  const defaultTaskEntry: TaskEntry = {
    id: params.taskId,
    description: `Task ${params.taskId}`,
    goal: 'Task completed',
    filesCreated: [],
    filesModified: [],
    vueConceptsLearned: [],
    keyMethodsPorted: [],
    architectureNotes: [],
    learningCheckpoint: [],
    questionsAnswered: [],
    nextTask: `${sessionId}.${parseInt(parsed.task, 10) + 1}`,
  };
  const taskEntry: TaskEntry = { ...defaultTaskEntry, ...params.taskEntry };

  const ctx: TierEndWorkflowContext = {
    config: TASK_CONFIG,
    identifier: params.taskId,
    params: { ...params, taskEntry, sessionId, sessionLogPath, parsed },
    context,
    output,
    steps,
    shouldRunTests: false,
    outcome,
  };

  const hooks: TierEndWorkflowHooks = {
    getPlanModeSteps() {
      const { shouldRunTests } = resolveRunTests(params);
      const shouldAddComments = params.addComments ?? true;
      return [
        'Mode: plan (no side effects).',
        '',
        'Would execute:',
        '- Gate: run Vue architecture audit (client) and block if failing unless override provided',
        `- Append formatted task entry to session log: \`${sessionLogPath}\``,
        `- Mark task complete in session guide (checkbox) for \`${params.taskId}\``,
        shouldAddComments ? '- Optional: review/add comments for modified files' : '- Skip comment review (addComments=false)',
        shouldRunTests ? '- Run tests (blocking) with change impact analysis' : '- Skip tests (runTests=false)',
      ];
    },

    async runPreWork(c): Promise<StepExitResult> {
      const p = c.params as TaskEndParams & { sessionId: string; sessionLogPath: string };
      const vueAudit = await auditVueArchitecture({
        tier: 'task',
        identifier: p.taskId,
        featureName: c.context.feature.name,
        modifiedFiles: p.modifiedFiles,
      });

      if (vueAudit.status === 'fail' && !p.vueArchitectureOverride) {
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
            'Reference: `.project-manager/patterns/vue-architecture-contract.md`, `.project-manager/patterns/composable-taxonomy.md`',
          ].join('\n'),
          steps: c.steps,
          outcome: buildTierEndOutcome('blocked_fix_required', 'vue_architecture_gate_failed', 'Fix Vue architecture findings or provide override; then re-run task-end.'),
        };
      }

      const formattedEntry = formatTaskEntry(p.taskEntry);
      let sessionLogContent = '';
      try {
        sessionLogContent = await readProjectFile(p.sessionLogPath);
      } catch (_error) {
        const fullPath = join(PROJECT_ROOT, p.sessionLogPath);
        console.warn(`WARNING: Session log not found, creating new one\nAttempted: ${p.sessionLogPath}\nFull Path: ${fullPath}\nError: ${_error instanceof Error ? _error.message : String(_error)}`);
        sessionLogContent = `# Session ${p.sessionId} Log\n\n`;
      }
      sessionLogContent += '\n' + formattedEntry + '\n';
      if (p.vueArchitectureOverride) {
        sessionLogContent += ['', '---', '', '## Gate Override: Vue Architecture', `**Reason:** ${p.vueArchitectureOverride.reason}`, `**Follow-up Task:** ${p.vueArchitectureOverride.followUpTaskId}`, '',].join('\n');
      }
      await writeProjectFile(p.sessionLogPath, sessionLogContent);

      let markCompleteOutput = '';
      try {
        markCompleteOutput = await markTaskComplete({ taskId: p.taskId, entry: p.taskEntry, featureId: p.featureId });
        await TASK_CONFIG.controlDoc.writeStatus(c.context, p.taskId, 'Complete');
      } catch (_error) {
        markCompleteOutput = `Warning: Failed to mark task complete in session guide: ${_error instanceof Error ? _error.message : String(_error)}`;
      }
      c.output.push(`Task ${p.taskId} completed. Log entry added to session log.`);
      if (markCompleteOutput) c.output.push(markCompleteOutput);
      return null;
    },

    async runTests(c): Promise<StepExitResult> {
      if (!c.shouldRunTests) return null;
      const p = c.params as TaskEndParams & { sessionLogPath: string };
      const testTarget = p.testTarget ?? TEST_CONFIG.defaultTarget;
      let impactAnalysisOutput = '';

      try {
        try {
          const filesToAnalyze = p.modifiedFiles && p.modifiedFiles.length > 0
            ? p.modifiedFiles
            : await getRecentlyModifiedFiles(TEST_CONFIG.watchMode.detectionWindow);
          if (filesToAnalyze.length > 0) {
            const impact = await analyzeCodeChangeImpact(filesToAnalyze, { includeUncommitted: true, detailedAnalysis: true });
            if (impact.affectedTests.length > 0) {
              impactAnalysisOutput = `\n📊 Change Impact Analysis:\n  - Change Type: ${impact.changeType} (${impact.confidence} confidence)\n  - Affected Tests: ${impact.affectedTests.length}\n`;
              if (impact.predictions.length > 0) impactAnalysisOutput += `  - Predicted Failures: ${impact.predictions.length}\n`;
              if (impact.changeType === 'breaking' && impact.confidence === 'high') impactAnalysisOutput += `  ⚠️  Breaking changes detected - tests may need updates\n`;
            }
          }
        } catch (error) {
          console.error('Change detection failed (non-fatal):', error);
        }

        const testResult = await testEndWorkflow('task', p.taskId, testTarget);
        if (!testResult.success) {
          if (TEST_CONFIG.analyzeErrors) {
            try {
              const testFiles = p.modifiedFiles?.filter(f => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f)) || [];
              const appFiles = p.modifiedFiles?.filter(f => !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f)) || [];
              const errorAnalysis = await analyzeTestError(testResult.results.run.output, testFiles, appFiles);
              if (errorAnalysis.isTestCodeError && TEST_CONFIG.allowTestFileFixes) {
                const permission = await requestTestFileFixPermission(errorAnalysis, `task-end-${p.taskId}`);
                return {
                  success: false,
                  output: `Test code error detected. Permission required to fix test file.\n\n${JSON.stringify(permission, null, 2)}\n\nPlease grant permission to fix test file, then re-run task-end.`,
                  steps: c.steps,
                  outcome: buildTierEndOutcome('blocked_needs_input', 'test_file_fix_permission', 'Grant permission or fix test file; then re-run task-end.'),
                };
              }
              if (errorAnalysis.isTestCodeError) {
                return {
                  success: false,
                  output: `Test code error detected but test file fixes are disabled. Please fix test file manually.\n\nError: ${errorAnalysis.recommendation}`,
                  steps: c.steps,
                  outcome: buildTierEndOutcome('blocked_fix_required', 'test_code_error', 'Fix test file manually; then re-run task-end.'),
                };
              }
              return {
                success: false,
                output: `Tests failed: ${testResult.message}\n\nError Analysis: ${errorAnalysis.recommendation}`,
                steps: c.steps,
                outcome: buildTierEndOutcome('blocked_fix_required', 'test_failed', 'Fix failing tests; then re-run task-end.'),
              };
            } catch (_error) {
              return {
                success: false,
                output: `Tests failed and error analysis failed: ${_error instanceof Error ? _error.message : String(_error)}`,
                steps: c.steps,
                outcome: buildTierEndOutcome('failed', 'test_error_analysis', 'Fix test errors; then re-run task-end.'),
              };
            }
          }
          return {
            success: false,
            output: `Tests failed: ${testResult.message}`,
            steps: c.steps,
            outcome: buildTierEndOutcome('blocked_fix_required', 'test_failed', 'Fix failing tests; then re-run task-end.'),
          };
        }
        if (impactAnalysisOutput) c.output.push(impactAnalysisOutput.trim());
        c.output.push(`\nTests passed: ${testResult.message}`);
        return null;
      } catch (_error) {
        return {
          success: false,
          output: `Test execution failed: ${_error instanceof Error ? _error.message : String(_error)}`,
          steps: c.steps,
          outcome: buildTierEndOutcome('blocked_fix_required', 'test_execution_failed', 'Fix test failures; then re-run task-end.'),
        };
      }
    },

    async runMidWork(c): Promise<StepExitResult> {
      const p = c.params as TaskEndParams;
      if (p.addComments === false || !p.modifiedFiles || p.modifiedFiles.length === 0) return null;
      const commentSuggestions: string[] = [];
      for (const filePath of p.modifiedFiles) {
        try {
          const reviewResult = await reviewFile(filePath);
          if (reviewResult.includes('## Suggestions') && !reviewResult.includes('✅ **No comment suggestions**')) {
            commentSuggestions.push(`\n### ${filePath}\n${reviewResult}`);
          }
        } catch (_error) {
          console.warn(`Comment review failed for ${filePath}: ${_error instanceof Error ? _error.message : String(_error)}`);
        }
      }
      if (commentSuggestions.length > 0) {
        c.output.push('\n\n## Comment Suggestions\nReview the following files for learning-focused comments:\n' + commentSuggestions.join('\n') + '\n\nUse /comment-add to add comments based on suggestions above.');
      }
      return null;
    },

    async runGit(c): Promise<StepExitResult> {
      try {
        const scopeConfig = await readTierScope();
        const commitPrefix = formatScopeCommitPrefix(scopeConfig, 'task');
        const commitMessage = `${commitPrefix} completion`;
        const commitResult = await gitCommit(commitMessage);
        c.steps.gitCommitTask = {
          success: commitResult.success,
          output: commitResult.success ? `✅ Task work committed: ${commitMessage}` : `Failed to commit task work: ${commitResult.output}`,
        };
        if (!commitResult.success) {
          c.steps.gitCommitTask!.output += '\n⚠️ Task commit failed (non-critical). You may commit manually.';
        }
      } catch (_error) {
        c.steps.gitCommitTask = {
          success: false,
          output: `Task commit failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}\nYou can commit manually later.`,
        };
      }
      if (c.steps.gitCommitTask?.output) {
        c.output.push(c.steps.gitCommitTask.output);
      }
      return null;
    },

    runReadmeCleanup: false,
    runEndAudit: true,

    async runBeforeAudit(c): Promise<void> {
      const p = c.params as TaskEndParams & { sessionLogPath?: string };
      (c as TierEndWorkflowContext & { auditPayload?: unknown }).auditPayload = {
        modifiedFiles: p.modifiedFiles,
        testResults: c.output.some(line => line.includes('Tests passed')) ? { success: true } : undefined,
      };
    },

    async getCascade(c): Promise<import('../../../utils/tier-outcome').CascadeInfo | null> {
      const p = c.params as TaskEndParams & { sessionId: string; parsed: { task: string } };
      const sessionId = p.sessionId;
      try {
        const taskNum = parseInt(p.parsed.task, 10);
        const nextTaskId = `${sessionId}.${taskNum + 1}`;
        const sessionGuidePath = c.context.paths.getSessionGuidePath(sessionId);
        let guideContent = '';
        try {
          guideContent = await readProjectFile(sessionGuidePath);
        } catch {
          guideContent = '';
        }
        const nextTaskExists = new RegExp(`Task\\s+${nextTaskId.replace(/\./g, '\\.')}:`).test(guideContent);
        const nextTaskComplete = nextTaskExists && (await TASK_CONFIG.controlDoc.readStatus(c.context, nextTaskId)) === 'complete';

        if (nextTaskExists && !nextTaskComplete) {
          return buildCascadeAcross('task', nextTaskId) ?? null;
        }
        const allTasksComplete = await areAllTasksInSessionComplete(c.context.feature.name, sessionId);
        if (allTasksComplete) {
          const cascadeUp = buildCascadeUp('task', sessionId);
          return cascadeUp ?? null;
        }
      } catch (err) {
        console.warn('Task end: cascade check failed (non-blocking)', err);
      }
      return null;
    },

    getSuccessOutcome(c): TierEndOutcome {
      const p = c.params as TaskEndParams & { sessionId: string };
      const cascade = c.outcome.cascade;
      const nextAction = cascade
        ? (cascade.direction === 'across'
          ? `Task ${p.taskId} complete. Cascade: ${cascade.command}`
          : `All tasks in session ${p.sessionId} complete. Cascade up: ${cascade.command}`)
        : `Task ${p.taskId} complete.`;
      return buildTierEndOutcome('completed', 'task_complete', nextAction, cascade);
    },
  };

  try {
    const result: TierEndWorkflowResult = await runTierEndWorkflow(ctx, hooks);
    return {
      success: result.success,
      output: result.output || ctx.output.join('\n'),
      outcome: result.outcome,
    };
  } catch (_error) {
    const p = ctx.params as TaskEndParams & { sessionLogPath: string };
    const fullPath = join(PROJECT_ROOT, p.sessionLogPath);
    return {
      success: false,
      output: `ERROR: Failed to complete task\nTask ID: ${p.taskId}\nSession Log Path: ${p.sessionLogPath}\nFull Path: ${fullPath}\nError Details: ${_error instanceof Error ? _error.message : String(_error)}\nSuggestion: Check file permissions and ensure session log directory exists`,
      outcome: buildTierEndOutcome('failed', 'task_end_error', 'Check file permissions and ensure session log directory exists.'),
    };
  }
}
