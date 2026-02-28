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
  ContextQuestion,
} from '../../shared/tier-start-workflow';
import { runTierStartWorkflow } from '../../shared/tier-start-workflow';

function extractField(name: string, content: string): string {
  const re = new RegExp(`\\*\\*${name}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*|\\n\\n|$)`, 'i');
  const m = content.match(re);
  return m ? m[1].trim() : '';
}

function extractTaskHeading(content: string): string {
  const m = content.match(/(?:####|###)\s*Task\s+[\d.]+:\s*(.+)/i);
  return m ? m[1].trim() : '';
}

async function readTaskSection(
  taskId: string,
  context: WorkflowCommandContext,
  sessionId: string
): Promise<string> {
  try {
    const guideContent = await context.readSessionGuide(sessionId);
    const escaped = taskId.replace(/\./g, '\\.');
    const pattern = new RegExp(
      `(?:- \\[[ x]\\])?\\s*(?:####|###) Task ${escaped}:.*?(?=(?:- \\[|#### Task|### Task|## |$))`,
      's'
    );
    const match = guideContent.match(pattern);
    return match ? match[0] : '';
  } catch {
    return '';
  }
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
        `Read task handoff: \`${sessionHandoffPath}\``,
        `Read session guide task section: \`${sessionGuidePath}\``,
        `Reference session log: \`${sessionLogPath}\``,
        'Output task details + gathered file context',
      ];
    },

    async getPlanContentSummary(): Promise<string | undefined> {
      const section = await readTaskSection(taskId, context, sessionId);
      if (!section) return undefined;
      const title = extractTaskHeading(section);
      const goal = extractField('Goal', section);
      if (!title && !goal) return undefined;
      const header = `## Task plan\n\n**Task ${taskId}:** ${title || '(untitled)'}`;
      return goal ? `${header}\n**Goal:** ${goal}` : header;
    },

    async getTierDeliverables(): Promise<string> {
      const section = await readTaskSection(taskId, context, sessionId);
      const title = extractTaskHeading(section);
      const goal = extractField('Goal', section);
      const files = extractField('Files', section);
      const approach = extractField('Approach', section);
      const checkpoint = extractField('Checkpoint', section);

      const lines: string[] = [`**Task ${taskId}:** ${title || '(untitled)'}`];
      if (goal) lines.push(`**Goal:** ${goal}`);
      if (files) lines.push(`**Files:** ${files}`);
      if (approach) lines.push(`**Approach:** ${approach}`);
      if (checkpoint) lines.push(`**Checkpoint:** ${checkpoint}`);
      if (lines.length === 1) lines.push('(No task details found in session guide)');
      return lines.join('\n');
    },

    async getTaskFilePaths(): Promise<string[]> {
      const taskSectionContent = ctx.readResult?.guide ?? await readTaskSection(taskId, context, sessionId);
      if (!taskSectionContent) return [];
      return extractFilePaths(taskSectionContent);
    },

    async getContextQuestions(): Promise<ContextQuestion[]> {
      const guide = ctx.readResult?.guide ?? '';
      const taskTitle = extractTaskHeading(guide) || `Task ${taskId}`;
      const goal = extractField('Goal', guide).trim();
      const files = extractField('Files', guide).trim();
      const approach = extractField('Approach', guide).trim();
      const outputText = ctx.output.join('\n');
      const hasInventory = /inventory|composable|utility.*match/i.test(outputText);
      const placeholderLike = (s: string) =>
        !s || /TBD|to be refined|see above|\.\.\.|placeholder|fill in/i.test(s) || s.length < 3;
      const questions: ContextQuestion[] = [];
      if (placeholderLike(goal)) {
        questions.push({
          category: 'scope',
          question: `This task is about "${taskTitle}". What's the specific outcome you want?`,
          context: 'Task goal: the deliverable we\'re building.',
        });
      }
      if (placeholderLike(files)) {
        questions.push({
          category: 'files',
          question: 'Which files or areas will this task touch?',
          context: 'Where the deliverable lives.',
        });
      }
      if (placeholderLike(approach)) {
        questions.push({
          category: 'approach',
          question: 'How should we implement it? (e.g. reuse an existing component, add a new composable)',
          context: 'Approach for this deliverable.',
        });
      }
      if (hasInventory) {
        questions.push({
          category: 'dependencies',
          question: 'Should we reuse existing composables or utilities from the codebase for this task?',
          context: 'Related code was mentioned in the inventory.',
        });
      }
      return questions;
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
      const taskSectionContent = await readTaskSection(taskId, context, sessionId);
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
