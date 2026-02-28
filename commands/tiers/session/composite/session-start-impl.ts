/**
 * Session-start implementation. Thin adapter: builds hooks and runs shared start workflow.
 */

import { join, resolve } from 'path';
import { execSync } from 'child_process';
import { readHandoff } from '../../../utils/read-handoff';
import { readGuide } from '../../../utils/read-guide';
import { readProjectFile, writeProjectFile } from '../../../utils/utils';
import { createSessionLabel, formatSessionLabel } from '../atomic/create-session-label';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { generateCurrentStateSummary } from '../../../utils/context-gatherer';
import { formatAutoGatheredContext } from '../../../utils/context-templates';
import { ensureTierBranch } from '../../../git/shared/tier-branch-manager';
import { validateSession, formatSessionValidation } from './session';
import { deriveSessionDescription } from './session-end-impl';
import { SESSION_CONFIG } from '../../configs/session';
import { getConfigForTier } from '../../configs/index';
import { updateTierScope } from '../../../utils/tier-scope';
import type { TierStartResult } from '../../../utils/tier-outcome';
import type {
  TierStartWorkflowContext,
  TierStartWorkflowHooks,
  TierStartValidationResult,
  TierStartReadResult,
  ContextQuestion,
} from '../../shared/tier-start-workflow';
import { runTierStartWorkflow } from '../../shared/tier-start-workflow';

export async function sessionStartImpl(
  sessionId: string,
  description?: string,
  options?: import('../../../utils/command-execution-mode').CommandExecutionOptions
): Promise<TierStartResult> {
  const context = await WorkflowCommandContext.getCurrent();
  const resolvedDescription =
    description !== undefined && description !== ''
      ? description
      : await deriveSessionDescription(sessionId, context);
  const output: string[] = [];

  const ctx: TierStartWorkflowContext = {
    config: SESSION_CONFIG,
    identifier: sessionId,
    resolvedId: sessionId,
    resolvedDescription,
    options,
    context,
    output,
  };

  const hooks: TierStartWorkflowHooks = {
    buildHeader() {
      return [
        `# Session ${sessionId} Start\n`,
        `**Date:** ${new Date().toISOString().split('T')[0]}\n`,
        `**Command:** \`/session-start ${sessionId}\`\n`,
      ];
    },

    getBranchHierarchyOptions() {
      const phase = sessionId.split('.').slice(0, 2).join('.');
      return { featureName: context.feature.name, phase, sessionId };
    },

    async validate(): Promise<TierStartValidationResult> {
      const validation = await validateSession(sessionId);
      const validationMessage = formatSessionValidation(validation, sessionId);
      return {
        canStart: validation.canStart,
        validationMessage: '## Session Validation\n' + validationMessage,
      };
    },

    getPlanModeSteps() {
      const phase = sessionId.split('.').slice(0, 2).join('.');
      const featureBranch = getConfigForTier('feature').getBranchName(context, context.feature.name);
      const phaseBranchName = SESSION_CONFIG.getParentBranchName(context, sessionId);
      const sessionBranchName = SESSION_CONFIG.getBranchName(context, sessionId);
      const featureBranchStr = featureBranch ?? `feature/${context.feature.name}`;
      const phaseBranchStr = phaseBranchName ?? '';
      const sessionBranchStr = sessionBranchName ?? '';
      const sessionGuidePath = context.paths.getSessionGuidePath(sessionId);
      const sessionHandoffPath = context.paths.getSessionHandoffPath(sessionId);
      const phaseGuidePath = context.paths.getPhaseGuidePath(phase);
      return [
        `Git: ensure phase branch exists: \`${phaseBranchStr}\``,
        `Git: create/switch session branch: \`${sessionBranchStr}\``,
        `Git: verify branch ancestry: \`${sessionBranchStr}\` is based on \`${phaseBranchStr}\` (and \`${phaseBranchStr}\` is based on \`${featureBranchStr}\`)`,
        `Docs: read session guide: \`${sessionGuidePath}\``,
        `Docs: read session handoff: \`${sessionHandoffPath}\``,
        `Docs: (reference) phase guide: \`${phaseGuidePath}\``,
        'Output: render session-start response format + auto-gathered context',
        'Audit: run session-start audit (non-blocking)',
      ];
    },

    async getPlanContentSummary(): Promise<string | undefined> {
      try {
        const guideContent = await context.readSessionGuide(sessionId);
        const escaped = sessionId.replace(/\./g, '\\.');
        const taskHeadingRegex = new RegExp(
          `(?:-\\s*\\[[ x]\\]\\s*)?(?:####|###)\\s*Task\\s+${escaped}\\.(\\d+):\\s*([^\\n]*)`,
          'gi'
        );
        const taskLines: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = taskHeadingRegex.exec(guideContent)) !== null) {
          const taskId = `${sessionId}.${m[1]}`;
          const nameOrGoal = m[2].trim().slice(0, 80);
          taskLines.push(`- Task ${taskId}: ${nameOrGoal || '(no title)'}`);
        }
        if (taskLines.length === 0) return undefined;
        const header = `## Session plan (what we're building)\n\n**Session:** ${resolvedDescription}\n\n**Tasks:**`;
        return `${header}\n${taskLines.join('\n')}`;
      } catch {
        return undefined;
      }
    },

    async getTierDeliverables(): Promise<string> {
      const lines: string[] = [`**Session ${sessionId}:** ${resolvedDescription}`];
      try {
        const guideContent = await context.readSessionGuide(sessionId);
        const escaped = sessionId.replace(/\./g, '\\.');
        const taskHeadingRegex = new RegExp(
          `(?:-\\s*\\[[ x]\\]\\s*)?(?:####|###)\\s*Task\\s+${escaped}\\.(\\d+):\\s*([^\\n]*)`,
          'gi'
        );
        let m: RegExpExecArray | null;
        while ((m = taskHeadingRegex.exec(guideContent)) !== null) {
          const tid = `${sessionId}.${m[1]}`;
          const name = m[2].trim().slice(0, 80);
          lines.push(`- Task ${tid}: ${name || '(untitled)'}`);
        }
      } catch { /* non-blocking */ }
      if (lines.length === 1) lines.push('(No tasks found in session guide)');
      return lines.join('\n');
    },

    async ensureBranch() {
      return ensureTierBranch(SESSION_CONFIG, sessionId, context);
    },

    async afterBranch() {
      await updateTierScope('session', { id: sessionId, name: resolvedDescription });
    },

    async ensureChildDocs(): Promise<void> {
      const guidePath = context.paths.getSessionGuidePath(sessionId);
      let content: string;
      try {
        content = await readProjectFile(guidePath);
      } catch {
        try {
          const template = await context.templates.loadTemplate('session', 'guide');
          content = context.templates.render(template, {
            SESSION_ID: sessionId,
            DESCRIPTION: resolvedDescription,
            DATE: new Date().toISOString().split('T')[0],
          });
          await context.documents.writeGuide('session', sessionId, content);
        } catch (err) {
          console.warn('Session-start ensureChildDocs: could not create session guide', err);
        }
        try {
          await readProjectFile(context.paths.getSessionLogPath(sessionId));
        } catch {
          try {
            await writeProjectFile(
              context.paths.getSessionLogPath(sessionId),
              `# Session ${sessionId}: ${resolvedDescription}\n\n`
            );
          } catch (logErr) {
            console.warn('Session-start ensureChildDocs: could not create session log', logErr);
          }
        }
        return;
      }
      const firstTaskId = `${sessionId}.1`;
      const hasFirstTask = new RegExp(`(?:####|###)\\s+Task\\s+${firstTaskId.replace(/\./g, '\\.')}[\\s:]`).test(content);
      if (hasFirstTask) return;
      const taskSection = [
        '',
        `- [ ] #### Task ${firstTaskId}: ${resolvedDescription}`,
        '**Goal:** [Fill in]',
        '**Files:**',
        '- [Files to work with]',
        '**Approach:** [Fill in]',
        '**Checkpoint:** [What needs to be verified]',
      ].join('\n');
      try {
        await context.documents.writeGuide('session', sessionId, content.trimEnd() + '\n\n' + taskSection);
      } catch (err) {
        console.warn('Session-start ensureChildDocs: could not append task section', err);
      }
    // Ensure session log exists so derivation and task-end have a consistent file (avoids missing-log warnings).
    try {
      await readProjectFile(context.paths.getSessionLogPath(sessionId));
    } catch {
      try {
        await writeProjectFile(
          context.paths.getSessionLogPath(sessionId),
          `# Session ${sessionId}: ${resolvedDescription}\n\n`
        );
      } catch (err) {
        console.warn('Session-start ensureChildDocs: could not create session log', err);
      }
    }
  },

    async readContext(): Promise<TierStartReadResult> {
      const handoffContent = await readHandoff('session', sessionId);
      const guideContent = await readGuide(sessionId);
      const sessionLabel = createSessionLabel(sessionId, resolvedDescription);
      const formattedLabel = formatSessionLabel(sessionLabel);
      return {
        label: formattedLabel,
        handoff:
          '## Transition Context\n**Where we left off and what you need to start:**\n\n' + handoffContent,
        guide: guideContent,
        sectionTitle: 'Session Guide\n**Structure and workflow for this session:**',
      };
    },

    async gatherContext(): Promise<string> {
      try {
        const contextSummary = await generateCurrentStateSummary(sessionId, context.feature.name);
        if (
          contextSummary.filesStatus.length > 0 ||
          contextSummary.implementationStatus.done.length > 0 ||
          contextSummary.implementationStatus.missing.length > 0
        ) {
          return formatAutoGatheredContext(contextSummary);
        }
      } catch {
        // non-blocking
      }
      return '';
    },

    async getContextQuestions(): Promise<ContextQuestion[]> {
      const guide = ctx.readResult?.guide ?? '';
      const sessionName = resolvedDescription || `Session ${sessionId}`;
      const escaped = sessionId.replace(/\./g, '\\.');
      const taskHeadingRegex = new RegExp(
        `(?:-\\s*\\[[ x]\\]\\s*)?(?:####|###)\\s*Task\\s+${escaped}\\.(\\d+):\\s*([^\\n]*)`,
        'gi'
      );
      const taskLines: string[] = [];
      let firstTaskTitle = '';
      let m: RegExpExecArray | null;
      while ((m = taskHeadingRegex.exec(guide)) !== null) {
        const name = m[2].trim().slice(0, 50);
        taskLines.push(`Task ${sessionId}.${m[1]}: ${name}`);
        if (!firstTaskTitle && m[1] === '1') firstTaskTitle = m[2].trim().slice(0, 80);
      }
      const taskSummary = taskLines.length > 0 ? taskLines.join('; ') : '';

      const questions: ContextQuestion[] = [];
      questions.push({
        category: 'scope',
        insight: taskSummary
          ? `The session guide indicates we're building "${sessionName}" through the listed tasks (${taskSummary}).`
          : `The session guide describes "${sessionName}" as the session we're starting.`,
        proposal: taskSummary
          ? 'We\'ll work through tasks in order from the guide, starting with the first task and aligning behavior with the plan.'
          : 'We\'ll align the session outcome with whatever tasks exist in the session guide once they\'re present.',
        question: `What's the main outcome you want for this session when we're done?`,
        context: 'Session goal: what we\'re building.',
        options: ['Match the session guide exactly', 'Add or change scope', 'Prioritize speed over full scope'],
      });
      if (firstTaskTitle) {
        questions.push({
          category: 'scope',
          insight: `The first task in the guide is: ${firstTaskTitle}.`,
          proposal: 'We\'ll treat this as the initial implementation focus unless you want to shift scope.',
          question: `For the first task (${firstTaskTitle}), what's the main behavior or change you want?`,
          context: 'Concrete deliverable for task one.',
          options: ['As in the guide', 'Narrow to a subset', 'Expand or clarify'],
        });
      }
      questions.push({
        category: 'approach',
        insight: 'Session structure and component/composable governance suggest reusing existing patterns and keeping tasks testable.',
        proposal: 'We\'ll follow the task order and apply governance (e.g. thin components, composables for logic) unless you set different priorities.',
        question: `Any specific UX or technical constraints for ${sessionName}?`,
        context: 'Helps implementation match your expectations.',
        options: ['Follow governance strictly', 'Relax for speed', 'Custom (describe in chat)'],
      });
      return questions;
    },

    async runExtras(): Promise<string> {
      const guideContent = ctx.readResult?.guide ?? (await readGuide(sessionId));
      const firstTaskId = `${sessionId}.1`;
      const firstTaskPattern = new RegExp(
        `#### Task ${firstTaskId.replace('.', '\\.')}:.*?(?=#### Task|##|$)`,
        's'
      );
      const firstTaskMatch = guideContent.match(firstTaskPattern);
      const parts: string[] = [
        '## Task Planning',
        `**First task:** ${firstTaskId}`,
        `**Plan tasks with:** \`/plan-task [X.Y.Z]\``,
      ];
      if (firstTaskMatch) {
        parts.push('', '**First Task Details:**', firstTaskMatch[0]);
      }
      parts.push(
        '',
        '## Compact Prompt',
        '```',
        `@${context.paths.getFeatureHandoffPath()} Continue ${context.feature.name} - start Session ${sessionId} (${resolvedDescription})`,
        '```'
      );
      try {
        const clientRoot = join(process.cwd(), 'client');
        const guidePath = resolve(process.cwd(), context.paths.getSessionGuidePath(sessionId));
        const reuse = execSync(`node .scripts/inventory-reuse-check.mjs "${guidePath}"`, {
          encoding: 'utf8',
          cwd: clientRoot,
        }).trim();
        if (reuse) parts.push('', reuse);
      } catch {
        // non-blocking: reuse check is optional
      }
      return parts.join('\n');
    },

    async getFirstChildId(): Promise<string | null> {
      return `${sessionId}.1`;
    },

    getCompactPrompt() {
      return `Session ${sessionId} planning complete. Cascade: /task-start ${sessionId}.1`;
    },

    runStartAudit: true,
  };

  const result = await runTierStartWorkflow(ctx, hooks);
  if (result.outcome.cascade) {
    result.outcome.nextAction = `Session ${sessionId} planning complete. Cascade: ${result.outcome.cascade.command}`;
  }
  return result;
}
