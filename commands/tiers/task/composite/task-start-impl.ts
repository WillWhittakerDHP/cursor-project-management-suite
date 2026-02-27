/**
 * Task-start implementation. Thin adapter: builds hooks and runs shared start workflow.
 */

import { readHandoff } from '../../../utils/read-handoff';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { WorkflowId } from '../../../utils/id-utils';
import { extractFilePaths, gatherFileStatuses } from '../../../utils/context-gatherer';
import { formatFileStatusList } from '../../../utils/context-templates';
import { resolveFeatureName, resolveFeatureId } from '../../../utils/feature-context';
import { TASK_CONFIG } from '../../configs/task';
import { validateTask, formatTaskValidation } from './task';
import { updateTierScope } from '../../../utils/tier-scope';
import { deriveTaskDescription } from '../../../planning/utils/resolve-planning-description';
import type { TierStartResult } from '../../../utils/tier-outcome';
import type {
  TierStartWorkflowContext,
  TierStartWorkflowHooks,
  TierStartValidationResult,
  TierStartReadResult,
} from '../../shared/tier-start-workflow';
import { runTierStartWorkflow } from '../../shared/tier-start-workflow';

function extractField(name: string, content: string): string {
  const re = new RegExp(`\\*\\*${name}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*|\\n\\n|$)`, 'i');
  const m = content.match(re);
  return m ? m[1].trim() : '';
}

export async function taskStartImpl(
  taskId: string,
  featureId?: string,
  options?: import('../../../utils/command-execution-mode').CommandExecutionOptions
): Promise<TierStartResult> {
  const resolvedFeatureName =
    featureId != null && featureId.trim() !== '' ? await resolveFeatureId(featureId) : await resolveFeatureName();
  const context = new WorkflowCommandContext(resolvedFeatureName);
  const output: string[] = [];

  const parsed = WorkflowId.parseTaskId(taskId);
  if (!parsed) {
    return {
      success: false,
      output: `# Task Start: ${taskId}\n---\n\nError: Invalid task ID format. Expected X.Y.Z.A (e.g., 4.1.3.1)`,
      outcome: { status: 'failed', reasonCode: 'invalid_task_id', nextAction: 'Use a valid task ID (X.Y.Z.A).' },
    };
  }

  const sessionId = parsed.sessionId;

  const ctx: TierStartWorkflowContext = {
    config: TASK_CONFIG,
    identifier: taskId,
    resolvedId: taskId,
    options,
    context,
    output,
  };

  const hooks: TierStartWorkflowHooks = {
    buildHeader() {
      return [`# Task Start: ${taskId}\n`, '---\n'];
    },

    getBranchHierarchyOptions() {
      return { featureName: context.feature.name };
    },

    async validate(): Promise<TierStartValidationResult> {
      const validation = await validateTask(taskId);
      const validationMessage = formatTaskValidation(validation, taskId);
      return {
        canStart: validation.canStart,
        validationMessage: '## Task Validation\n' + validationMessage + '\n---\n',
      };
    },

    getPlanModeSteps() {
      const sessionGuidePath = context.paths.getSessionGuidePath(sessionId);
      const sessionHandoffPath = context.paths.getSessionHandoffPath(sessionId);
      const sessionLogPath = context.paths.getSessionLogPath(sessionId);
      return [
        `Docs: read task handoff context (from session handoff): \`${sessionHandoffPath}\``,
        `Docs: read session guide (task section): \`${sessionGuidePath}\``,
        `Docs: (reference) session log path (task updates at task-end): \`${sessionLogPath}\``,
        'Output: show task details and auto-gathered file context (if present)',
      ];
    },

    async afterBranch() {
      const taskName = await deriveTaskDescription(taskId, context);
      await updateTierScope('task', { id: taskId, name: taskName });
    },

    async runExtras(): Promise<string> {
      const taskName = await deriveTaskDescription(taskId, context);
      await updateTierScope('task', { id: taskId, name: taskName });
      return '';
    },

    async readContext(): Promise<TierStartReadResult> {
      let handoff = '';
      try {
        handoff = await readHandoff('task', taskId);
      } catch {
        handoff = `**Note:** Handoff context not available. Use \`/read-handoff session ${sessionId}\` to check session context\n`;
      }
      let taskSectionContent = '';
      try {
        const sessionGuideContent = await context.readSessionGuide(sessionId);
        const escapedTaskId = taskId.replace(/\./g, '\\.');
        const taskSectionPattern = new RegExp(
          `(?:- \\[[ x]\\])?\\s*(?:####|###) Task ${escapedTaskId}:.*?(?=(?:- \\[|#### Task|### Task|## |$))`,
          's'
        );
        const taskSectionMatch = sessionGuideContent.match(taskSectionPattern);
        if (taskSectionMatch) taskSectionContent = taskSectionMatch[0];
      } catch {
        // non-blocking
      }
      return {
        handoff: '## Task Handoff Context\n' + handoff,
        guide: taskSectionContent || undefined,
        sectionTitle: 'Task Context (from guide)',
      };
    },

    async gatherContext(): Promise<string> {
      const taskSectionContent = ctx.readResult?.guide ?? '';
      if (!taskSectionContent) return '';
      try {
        const filePaths = extractFilePaths(taskSectionContent);
        if (filePaths.length === 0) return '';
        const fileStatuses = await gatherFileStatuses(filePaths);
        const reactFiles = fileStatuses.filter((f) => f.isReact);
        const vueFiles = fileStatuses.filter((f) => f.isVue);
        if (reactFiles.length === 0 && vueFiles.length === 0) return '';
        const parts: string[] = ['## Auto-Gathered Context\n', '**Files mentioned in task:**\n'];
        if (reactFiles.length > 0) {
          parts.push('\n**React Source Files:**');
          parts.push(formatFileStatusList(reactFiles));
        }
        if (vueFiles.length > 0) {
          parts.push('\n**Vue Target Files:**');
          parts.push(formatFileStatusList(vueFiles));
        }
        return parts.join('');
      } catch {
        return '';
      }
    },

    async getTrailingOutput(): Promise<string> {
      const taskSectionContent = ctx.readResult?.guide ?? '';
      const goal = extractField('Goal', taskSectionContent);
      const files = extractField('Files', taskSectionContent);
      const approach = extractField('Approach', taskSectionContent);
      const checkpoint = extractField('Checkpoint', taskSectionContent);
      return [
        '## Implementation Orders',
        '',
        `**Task:** ${taskId}`,
        `**Goal:** ${goal || '(see task context above)'}`,
        `**Files:**`,
        files || '(see task context above)',
        `**Approach:** ${approach || '(see task context above)'}`,
        `**Checkpoint:** ${checkpoint || '(see task context above)'}`,
        '',
        `**End command:** \`/task-end ${taskId}\``,
      ].join('\n');
    },

    getCompactPrompt() {
      return `Task ${taskId} ready. End with /task-end ${taskId}.`;
    },

    runStartAudit: true,
  };

  return runTierStartWorkflow(ctx, hooks);
}
