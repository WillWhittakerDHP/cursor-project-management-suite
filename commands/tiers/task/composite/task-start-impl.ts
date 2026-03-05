/**
 * Task-start implementation. Thin adapter: builds hooks and runs shared start workflow.
 */

import { readHandoff } from '../../../utils/read-handoff';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { WorkflowId } from '../../../utils/id-utils';
import { readTierUpContext, getTierContextSourcePolicy } from '../../shared/context-policy';
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
  TierStartWorkflowResult,
} from '../../shared/tier-start-workflow-types';
import { runTierStartWorkflow } from '../../../harness/run-start-steps';
import type { RunRecorder, RunTraceHandle } from '../../../harness/contracts';
import { getInventoryMatchesForFiles } from '../../../audit/governance-context';
import { getPlanningDocPathForTier, parsePlanningDocSections } from '../../shared/tier-start-steps';
import { readProjectFile } from '../../../utils/utils';

export type ShadowContext = { recorder: RunRecorder; handle: RunTraceHandle };

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

async function readSessionHandoffExcerpt(
  context: WorkflowCommandContext,
  sessionId: string
): Promise<string> {
  try {
    const content = await readHandoff('session', sessionId);
    if (!content?.trim()) return '';
    return content.trim().slice(0, 1000) + (content.length > 1000 ? '\n\n*(excerpt truncated)*' : '');
  } catch {
    return '';
  }
}

export async function taskStartImpl(
  taskId: string,
  featureId?: string,
  options?: import('../../../utils/command-execution-mode').CommandExecutionOptions,
  shadow?: ShadowContext
): Promise<TierStartResult | TierStartWorkflowResult> {
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
    ...(shadow && {
      runRecorder: shadow.recorder,
      runTraceHandle: shadow.handle,
      stepPath: [],
    }),
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
      const prevTaskId = WorkflowId.getPreviousSiblingId(taskId, 'task');
      const prevTaskHandoffPath = prevTaskId ? context.paths.getTaskHandoffPath(prevTaskId) : null;
      const sessionLogPath = context.paths.getSessionLogPath(sessionId);
      const steps = [
        `Read session handoff (tierUp): \`${sessionHandoffPath}\``,
        `Read session guide task section: \`${sessionGuidePath}\``,
        `Reference session log: \`${sessionLogPath}\``,
        'Output task details + gathered file context',
      ];
      if (prevTaskHandoffPath) {
        steps.splice(1, 0, `Read previous task handoff (tierAcross): \`${prevTaskHandoffPath}\``);
      }
      return steps;
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

      const lines: string[] = [
        '**Task plan**',
        `**Task ${taskId}:** ${title || '(untitled)'}`,
      ];
      if (goal) lines.push(`**Goal:** ${goal}`);
      if (files) lines.push(`**Files:** ${files}`);
      if (approach) lines.push(`**Approach:** ${approach}`);
      if (checkpoint) lines.push(`**Checkpoint:** ${checkpoint}`);
      if (lines.length === 2) lines.push('(No task details found in session guide)');
      lines.push('');
      lines.push('After you approve the design (Begin Coding), we\'ll load context and begin implementation.');
      return lines.join('\n');
    },

    async getTierDownFilePaths(): Promise<string[]> {
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

      // Always include a discussion opener so we always create task-<id>-planning.md (align with session-start).
      questions.push({
        category: 'scope',
        insight: guide.trim()
          ? `Task context: ${taskTitle}. Goal/Files/Approach from the session guide inform the design.`
          : `Task ${taskId}: we'll lock the coding goal and design from context or chat.`,
        proposal: "We'll create a task planning doc (Design Before Execute) and use it as the single source of truth. Discuss in chat, then run /accepted-code when ready to begin coding.",
        question: 'What do you want to lock in or adjust before we begin coding?',
        context: 'Where you and the agent talk about the task plan.',
        options: ["Let's discuss in chat", "I'm ready to lock the design and begin coding"],
      });

      if (placeholderLike(goal)) {
        questions.push({
          category: 'scope',
          insight: `The task section describes "${taskTitle}". The Goal field is not yet filled or is placeholder.`,
          proposal: 'We\'ll implement a concrete deliverable once you confirm the outcome; the session guide and handoff can inform it.',
          question: `What's the specific outcome you want for this task?`,
          context: 'Task goal: the deliverable we\'re building.',
          options: ['Describe in chat', 'Copy from session objective', 'Match checklist in guide'],
        });
      }
      if (placeholderLike(files)) {
        questions.push({
          category: 'files',
          insight: 'The task section has no concrete Files listed (or placeholder).',
          proposal: 'We\'ll target files inferred from the goal and approach, or you can specify areas/components to touch.',
          question: 'Which files or areas should this task touch?',
          context: 'Where the deliverable lives.',
          options: ['Infer from goal', 'List in chat', 'Match session guide'],
        });
      }
      if (placeholderLike(approach)) {
        questions.push({
          category: 'approach',
          insight: 'The Approach field is empty or placeholder. Governance suggests thin components and composables for logic.',
          proposal: 'We\'ll choose an approach that reuses existing components/composables where the inventory suggests fit, unless you prefer a different pattern.',
          question: 'How should we implement it?',
          context: 'Approach for this deliverable.',
          options: ['Reuse from inventory where possible', 'New composable/component', 'Describe in chat'],
        });
      }
      if (hasInventory) {
        questions.push({
          category: 'dependencies',
          insight: 'The start workflow mentioned existing composables or utilities in the inventory that may relate to this task.',
          proposal: 'We can prefer reusing those where they fit the goal, or implement from scratch if you want a clean boundary.',
          question: 'Should we reuse existing composables or utilities from the codebase for this task?',
          context: 'Related code was mentioned in the inventory.',
          options: ['Reuse where it fits', 'Implement from scratch', 'Mix (specify in chat)'],
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

    /** TierUp only: session guide (task section). Task handoff is excluded from planning input. */
    async readContext(): Promise<TierStartReadResult> {
      const resolvedDescription = await deriveTaskDescription(taskId, context);
      return readTierUpContext({
        tier: 'task',
        identifier: taskId,
        resolvedDescription,
        context,
      });
    },

    getContextSourcePolicy() {
      return getTierContextSourcePolicy('task');
    },

    async getTierGoals(): Promise<string> {
      const section = await readTaskSection(taskId, context, sessionId);
      const title = extractTaskHeading(section) || `Task ${taskId}`;
      const goal = extractField('Goal', section).trim();
      return goal ? `${title}: ${goal}` : `Deliver: ${title}. Define acceptance criteria before execute.`;
    },

    async getTierDownBuildPlan(): Promise<string> {
      const guide = ctx.readResult?.guide ?? await readTaskSection(taskId, context, sessionId);
      const taskFiles = extractFilePaths(guide);
      const inventoryMatches = getInventoryMatchesForFiles(taskFiles);
      const goal = extractField('Goal', guide).trim();
      const approach = extractField('Approach', guide).trim();

      const lines: string[] = [];
      if (inventoryMatches.length > 0) {
        lines.push('**Reuse (from inventory):**');
        lines.push(inventoryMatches.map(m => `- ${m}`).join('\n'));
        lines.push('');
      }
      lines.push('**Create/add (from Goal/Approach):**');
      if (approach?.trim()) {
        const steps = approach.split(/\n+/).map(s => s.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean);
        steps.slice(0, 6).forEach(s => lines.push(`- ${s}`));
      } else if (goal?.trim()) {
        lines.push(`- ${goal.slice(0, 200)}${goal.length > 200 ? '…' : ''}`);
      } else {
        lines.push('- [List concrete code moves: reuse/create function X, build table/model Y, add switch, import Z, etc.]');
      }
      lines.push('');
      lines.push('Then run task-end and cascade to next task or session-end.');
      return lines.join('\n');
    },

    async getContextWorkBrief() {
      const guide = ctx.readResult?.guide ?? await readTaskSection(taskId, context, sessionId);
      const taskTitle = extractTaskHeading(guide) || `Task ${taskId}`;
      const goal = extractField('Goal', guide).trim();
      const filesRaw = extractField('Files', guide).trim();
      const approach = extractField('Approach', guide).trim();
      const checkpointRaw = extractField('Checkpoint', guide).trim();
      const fileList = filesRaw
        .split('\n')
        .map(line => line.replace(/^\s*-\s*/, '').trim())
        .filter(Boolean);
      const acceptanceList = checkpointRaw
        .split('\n')
        .map(line => line.replace(/^\s*-\s*/, '').trim())
        .filter(Boolean);
      const planningSummary = goal
        ? `**Explicit coding goal:** ${goal}`
        : `Task ${taskId}: ${taskTitle}. Define an explicit coding goal before beginning implementation.`;
      const executionProposal = [
        approach ? `**Approach:** ${approach}` : 'Define approach (e.g. thin component + composable).',
        'Add pseudocode steps and key snippets in the Design Before Execute section, then approve to begin coding.',
      ].join('\n');
      const taskDesign = {
        codingGoal: goal || `Deliver: ${taskTitle}. [Refine in planning doc.]`,
        files: fileList.length > 0 ? fileList : extractFilePaths(guide),
        pseudocodeSteps: approach ? [approach] : ['[Outline steps in planning doc before execute]'],
        snippets: '[Add key signatures or code shapes in planning doc]',
        acceptanceChecks: acceptanceList.length > 0 ? acceptanceList : ['[Define verification steps in planning doc]'],
      };
      return { planningSummary, executionProposal, taskDesign };
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
      const basePath = context.paths.getBasePath();
      const planningDocPath = getPlanningDocPathForTier('task', taskId, basePath);
      let goal = '';
      let files = '';
      let approach = '';
      let checkpoint = '';
      try {
        const content = await readProjectFile(planningDocPath);
        const parsed = parsePlanningDocSections(content);
        if (parsed) {
          goal = parsed.goal?.trim() ?? '';
          files = parsed.files?.trim() ?? '';
          approach = parsed.approach?.trim() ?? '';
          checkpoint = parsed.checkpoint?.trim() ?? '';
        }
      } catch {
        // planning doc missing or unreadable
      }
      if (!goal && !files && !approach && !checkpoint) {
        const taskSectionContent = ctx.readResult?.guide ?? '';
        goal = extractField('Goal', taskSectionContent);
        files = extractField('Files', taskSectionContent);
        approach = extractField('Approach', taskSectionContent);
        checkpoint = extractField('Checkpoint', taskSectionContent);
      }
      return [
        '## Implementation Orders',
        '',
        '**Implement the task now** (write code, edit files per Goal/Files/Approach above). When implementation is complete, run the End command below. Do not run /task-end until code changes are done.',
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
      return `Implement the task per Implementation Orders above (Goal, Files, Approach, Checkpoint). When implementation is complete, run /task-end ${taskId}. Do not run task-end until code is written.`;
    },

    runStartAudit: true,
  };

  return runTierStartWorkflow(ctx, hooks);
}
