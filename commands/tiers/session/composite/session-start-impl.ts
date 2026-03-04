/**
 * Session-start implementation. Thin adapter: builds hooks and runs shared start workflow.
 */

import { join, resolve } from 'path';
import { execSync } from 'child_process';
import { readGuide } from '../../../utils/read-guide';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { sessionExecutionPolicy } from '../policies/execution-policy';
import { sessionGitPolicy } from '../policies/git-policy';
import {
  readTierUpContext,
  getTierContextSourcePolicy,
  gatherTierContext,
} from '../../shared/context-policy';
import { deriveSessionDescription } from './session-end-impl';
import { SESSION_CONFIG } from '../../configs/session';
import { getConfigForTier } from '../../configs/index';
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

export type ShadowContext = { recorder: RunRecorder; handle: RunTraceHandle };

function extractTaskDetails(
  guide: string,
  sessionId: string
): Array<{ taskId: string; title: string; goal?: string; files?: string[]; checkpoint?: string[] }> {
  const escaped = sessionId.replace(/\./g, '\\.');
  const taskBlockRegex = new RegExp(
    `(?:-\\s*\\[[ x]\\]\\s*)?(?:####|###)\\s*Task\\s+(${escaped}\\.\\d+):\\s*([^\\n]*)[\\s\\S]*?(?=(?:\\n(?:-\\s*\\[[ x]\\]\\s*)?(?:####|###)\\s*Task\\s+${escaped}\\.\\d+:)|\\n##\\s+|\\n#\\s+|$)`,
    'gi'
  );
  const tasks: Array<{ taskId: string; title: string; goal?: string; files?: string[]; checkpoint?: string[] }> = [];
  let match: RegExpExecArray | null;
  while ((match = taskBlockRegex.exec(guide)) !== null) {
    const block = match[0];
    const taskId = match[1].trim();
    const title = match[2].trim();
    const goal = block.match(/\*\*Goal:\*\*\s*([^\n]+)/i)?.[1]?.trim();
    const checkpointRaw = block.match(/\*\*Checkpoint:\*\*([\s\S]*?)(?=\n\*\*|\n(?:-?\s*\[[ x]\]\s*)?(?:####|###)\s*Task|\n##\s+|$)/i)?.[1] ?? '';
    const checkpoint = checkpointRaw
      .split('\n')
      .map(line => line.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 3);
    const filesRaw = block.match(/\*\*Files:\*\*([\s\S]*?)(?=\n\*\*|\n(?:-?\s*\[[ x]\]\s*)?(?:####|###)\s*Task|\n##\s+|$)/i)?.[1] ?? '';
    const files = filesRaw
      .split('\n')
      .map(line => line.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 4);
    tasks.push({ taskId, title, goal, files, checkpoint });
  }
  return tasks;
}

function extractOpenTodoSignals(text: string): string[] {
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- [ ]') || line.includes('[Fill in]') || line.includes('[To be'));
  return lines.slice(0, 4).map(l => l.replace(/^- \[ \]\s*/, '').trim());
}

/**
 * Extract component/modal names and intent phrasing from tierUp context so we can ask
 * subject-matter questions (e.g. "Which modal should we base the shell on?") instead of
 * generic process options. This is where the agent is "set free to think" with the user.
 */
function extractSessionIntentEntities(
  guide: string,
  handoff: string
): { componentNames: string[]; intentSummary: string } {
  const combined = `${guide}\n${handoff}`;
  const pascalCase = combined.match(/\b[A-Z][a-zA-Z0-9]*(?:Modal|Shell|Dialog|Card|Form|View|Step)[a-zA-Z0-9]*\b/g);
  const vueFiles = combined.match(/\b[\w-]+\.vue\b/g);
  const names = new Set<string>();
  if (pascalCase) pascalCase.forEach(n => names.add(n));
  if (vueFiles) vueFiles.forEach(n => names.add(n.replace(/\.vue$/, '')));
  const componentNames = Array.from(names).slice(0, 6);

  const sessionLine = guide.match(/(?:###\s*Session\s+[\d.]+\s*:\s*)([^\n]+)/i);
  const intentSummary = sessionLine?.[1]?.trim()?.slice(0, 200) ?? 'this session';
  return { componentNames, intentSummary };
}

function buildSessionExecutionProposal(
  sessionId: string,
  tasks: Array<{ taskId: string; title: string; goal?: string; files?: string[]; checkpoint?: string[] }>
): string {
  if (tasks.length === 0) {
    return [
      '- Confirm concrete task scope and acceptance criteria from the session docs.',
      '- Identify touched files (components/composables/utilities) before execute mode.',
      '- Implement in small steps with governance checks after each change.',
    ].join('\n');
  }
  const first = tasks[0];
  const filesHint =
    first.files && first.files.length > 0
      ? first.files.map(f => `  - ${f}`).join('\n')
      : '  - [To be finalized from session guidance]';
  const checkpointHint =
    first.checkpoint && first.checkpoint.length > 0
      ? first.checkpoint.map(c => `  - ${c}`).join('\n')
      : '  - [Define explicit done criteria before execute mode]';

  return [
    `- Start with ${first.taskId} (${first.title}) and keep scope aligned to the session guide.`,
    '- Confirm file boundaries before coding:',
    filesHint,
    '- Implement with thin components and composable-first logic where applicable.',
    '- Verify acceptance criteria after implementation:',
    checkpointHint,
  ].join('\n');
}

export async function sessionStartImpl(
  sessionId: string,
  description?: string,
  options?: import('../../../utils/command-execution-mode').CommandExecutionOptions,
  shadow?: ShadowContext
): Promise<TierStartResult | TierStartWorkflowResult> {
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
    ...(shadow && {
      runRecorder: shadow.recorder,
      runTraceHandle: shadow.handle,
      stepPath: [],
    }),
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
      return sessionExecutionPolicy.validate({ sessionId });
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
        const guideContent = ctx.readResult?.guide ?? (await context.readSessionGuide(sessionId));
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
        if (taskLines.length === 0) {
          return `## Session plan (what we're building)\n\n**Session:** ${resolvedDescription}\n\n**Tasks:** (generated from phase guide; add task blocks in session guide during execute).`;
        }
        const header = `## Session plan (what we're building)\n\n**Session:** ${resolvedDescription}\n\n**Tasks:**`;
        return `${header}\n${taskLines.join('\n')}`;
      } catch {
        return undefined;
      }
    },

    async getTierDeliverables(): Promise<string> {
      const lines: string[] = [
        '**Session plan**',
        `**Session ${sessionId}:** ${resolvedDescription}`,
        '**Tasks in this session:**',
      ];
      const guideContent = ctx.readResult?.guide ?? '';
      if (guideContent) {
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
      }
      if (lines.length === 3) lines.push('(No tasks in phase-derived context; add in session guide during execute)');
      lines.push('');
      lines.push("After approval we'll set up the branch and context, then cascade to the first task.");
      return lines.join('\n');
    },

    async ensureBranch() {
      return sessionGitPolicy.ensureBranch({ context, sessionId, resolvedDescription });
    },

    async afterBranch() {
      await sessionGitPolicy.afterBranch({ sessionId, resolvedDescription });
    },

    async readContext(): Promise<TierStartReadResult> {
      return readTierUpContext({
        tier: 'session',
        identifier: sessionId,
        resolvedDescription,
        context,
      });
    },

    getContextSourcePolicy() {
      return getTierContextSourcePolicy('session');
    },

    async gatherContext(): Promise<string> {
      return gatherTierContext({
        tier: 'session',
        identifier: sessionId,
        resolvedDescription,
        context,
      });
    },

    async getContextQuestions(): Promise<ContextQuestion[]> {
      const guide = ctx.readResult?.guide ?? '';
      const handoff = ctx.readResult?.handoff ?? '';
      const sessionName = resolvedDescription || `Session ${sessionId}`;
      const tasks = extractTaskDetails(guide, sessionId);
      const firstTask = tasks[0];
      const taskSummary = tasks.slice(0, 4).map(t => `${t.taskId}: ${t.title}`).join('; ');
      const { componentNames, intentSummary } = extractSessionIntentEntities(guide, handoff);
      const openTodos = extractOpenTodoSignals(guide + '\n' + handoff);

      const questions: ContextQuestion[] = [];

      // Discussion opener: invite thinking and talking about the plan, not canned process choices.
      questions.push({
        category: 'scope',
        insight: taskSummary
          ? `Session intent: "${intentSummary}". Tasks: ${taskSummary}.`
          : `Session intent: "${intentSummary}".`,
        proposal: "We'll plan all necessary items for this goal and follow governance (thin components, composables, reuse). This is the place to lock in or adjust what we're building.",
        question: "After reading the planning doc and context, what do you want to lock in or adjust before we proceed?",
        context: 'Where you and the agent talk about the plan.',
        options: ["Let's discuss in chat", "I'm ready to lock the plan as-is"],
      });

      // Subject-matter: which existing piece to base the shell on (when context has 2+ components).
      if (componentNames.length >= 2) {
        questions.push({
          category: 'approach',
          insight: `Context mentions: ${componentNames.join(', ')}.`,
          proposal: "We'll unify on one shell/API where the guide calls for it; choosing a base helps consistency.",
          question: 'Which existing component should we base the shared shell (or unified piece) on?',
          context: 'Concrete choice from the codebase.',
          options: [...componentNames, 'New from scratch', "Discuss in chat"],
        });
      }

      // First-task deliverable: concrete behavior and acceptance (no "match / narrow / expand" process buckets).
      if (firstTask) {
        const fileHint = firstTask.files?.length
          ? `Likely files: ${firstTask.files.join(', ')}.`
          : 'Files not fully specified in the guide yet.';
        const checkpointHint = firstTask.checkpoint?.length
          ? `Checkpoint: ${firstTask.checkpoint.join('; ')}.`
          : 'Checkpoint details still sparse.';
        questions.push({
          category: 'scope',
          insight: `First task: ${firstTask.title}. ${fileHint} ${checkpointHint}`,
          proposal: "We'll lock the first task deliverable (exact behavior, files, done criteria) before execute mode.",
          question: `For ${firstTask.taskId}, what exact behavior and acceptance criteria should we enforce?`,
          context: 'Concrete deliverable for task one.',
          options: ['As in the guide', "I'll clarify in chat"],
        });
      }

      // Placeholders: frame as planning all necessary items; no "resolve only critical" / "defer".
      if (openTodos.length > 0) {
        questions.push({
          category: 'dependencies',
          insight: `Open placeholders in session docs: ${openTodos.join(' | ')}.`,
          proposal: "We'll plan all necessary items for this goal so execute mode has clear scope.",
          question: 'Any of these (or other edge cases) to include in this session\'s plan?',
          context: 'What to lock in before we start.',
          options: ['Include all relevant; discuss if unsure', "I'll specify in chat"],
        });
      }

      // Governance: stated, not offered as a trade-off. Only domain constraints asked.
      questions.push({
        category: 'approach',
        insight: "We'll follow governance (thin components, composables, reuse). No option to relax for speed.",
        proposal: "We'll enforce governance on touched files and prefer reuse over new ad-hoc patterns.",
        question: `Any specific UX or integration boundaries for ${sessionName}?`,
        context: 'Domain constraints only.',
        options: ["I'll describe in chat", 'None in mind'],
      });

      return questions;
    },

    async getContextWorkBrief() {
      const guide = ctx.readResult?.guide ?? '';
      const tasks = extractTaskDetails(guide, sessionId);
      const planningSummary = tasks.length > 0
        ? `Session ${sessionId} is planning ${tasks.map(t => `${t.taskId} (${t.title})`).join(', ')}.`
        : `Session ${sessionId} is focused on ${resolvedDescription || `Session ${sessionId}`} per current docs.`;
      const executionProposal = buildSessionExecutionProposal(sessionId, tasks);
      return {
        planningSummary,
        executionProposal,
      };
    },

    async getTierGoals(): Promise<string> {
      const guide = ctx.readResult?.guide ?? '';
      const sessionEntry = guide.match(
        new RegExp(`(?:###\\s*Session\\s+${sessionId.replace(/\./g, '\\.')}[\\s:]*)([^\\n]+)`, 'i')
      )?.[1]?.trim();
      const intent = sessionEntry || resolvedDescription || `Session ${sessionId}`;
      return `Complete this session's scope: ${intent}. Lock acceptance criteria and file boundaries before execute; deliver via tasks (tierDown).`;
    },

    async getTierDownBuildPlan(): Promise<string> {
      const guide = ctx.readResult?.guide ?? '';
      const tasks = extractTaskDetails(guide, sessionId);
      if (tasks.length === 0) {
        return `Enumerate tasks for ${sessionId} (e.g. ${sessionId}.1, ${sessionId}.2) in the session/phase guide, then implement in order with governance checks. Add task blocks (Goal, Files, Approach, Checkpoint) before execute.`;
      }
      const lines = tasks.map(t => `- **${t.taskId}:** ${t.title}${t.goal ? ` — ${t.goal}` : ''}`);
      return `Build the following tasks to achieve the session goals:\n\n${lines.join('\n')}\n\nImplement in order; after each task run task-end and cascade to next or session-end.`;
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

    async getFirstTierDownId(): Promise<string | null> {
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
