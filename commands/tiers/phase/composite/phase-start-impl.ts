/**
 * Phase-start implementation. Thin adapter: builds hooks and runs shared start workflow.
 */

import { readProjectFile } from '../../../utils/utils';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { readTierUpContext, getTierContextSourcePolicy } from '../../shared/context-policy';
import { extractFilesFromPhaseGuide, gatherFileStatuses } from '../../../utils/context-gatherer';
import { formatFileStatusList } from '../../../utils/context-templates';
import { ensureTierBranch } from '../../../git/shared/git-manager';
import { validatePhase, formatPhaseValidation } from './phase';
import { PHASE_CONFIG } from '../../configs/phase';
import { derivePhaseDescription } from '../../../planning/utils/resolve-planning-description';
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
import { getTierUpPlanningDocSections } from '../../shared/tier-start-steps';
import { buildReuseOpportunitiesSection, type InventoryPayload } from '../helpers/inventory-reuse-check';
import type { RunRecorder, RunTraceHandle } from '../../../harness/contracts';

export type ShadowContext = { recorder: RunRecorder; handle: RunTraceHandle };

/** When provided (e.g. from harness), use this context instead of re-resolving from git. */
export async function phaseStartImpl(
  phaseId: string,
  options?: import('../../../utils/command-execution-mode').CommandExecutionOptions,
  shadow?: ShadowContext,
  resolvedContext?: WorkflowCommandContext
): Promise<TierStartResult | TierStartWorkflowResult> {
  let context: WorkflowCommandContext;
  if (resolvedContext) {
    context = resolvedContext;
  } else {
    console.warn(`[phase-start-impl] resolvedContext not provided; falling back to contextFromParams('phase', '${phaseId}')`);
    context = await WorkflowCommandContext.contextFromParams('phase', { phaseId });
  }
  const phase = phaseId;
  const output: string[] = [];

  const ctx: TierStartWorkflowContext = {
    config: PHASE_CONFIG,
    identifier: phaseId,
    resolvedId: phase,
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
        `# Phase ${phase} Start\n`,
        `**Date:** ${new Date().toISOString().split('T')[0]}\n`,
        `**Command:** \`/phase-start ${phase}\`\n`,
      ];
    },

    getBranchHierarchyOptions() {
      return { featureName: context.feature.name, phase };
    },

    async validate(): Promise<TierStartValidationResult> {
      const validation = await validatePhase(phase);
      const validationMessage = formatPhaseValidation(validation, phase);
      return {
        canStart: validation.canStart,
        validationMessage: '## Phase Validation\n' + validationMessage,
      };
    },

    getPlanModeSteps() {
      const phaseBranchName = PHASE_CONFIG.getBranchName(context, phase);
      return [
        'Git: ensure feature branch exists and is based on main/master',
        `Git: create/switch phase branch \`${phaseBranchName ?? ''}\``,
        `Docs: read feature guide Phases Breakdown, phase guide \`${context.paths.getPhaseGuidePath(phase)}\``,
        'Audit: run phase-start audit (non-blocking)',
      ];
    },

    async getPlanContentSummary(): Promise<string | undefined> {
      try {
        const phaseDesc = await derivePhaseDescription(phase, context);
        const content = ctx.readResult?.guide ?? (await readProjectFile(context.paths.getPhaseGuidePath(phase)));
        const sessionMatches = content.matchAll(/Session\s+(\d+\.\d+\.\d+):?\s*([^\n]*)/gi);
        const sessionLines: string[] = [];
        for (const m of sessionMatches) {
          const sid = m[1];
          const name = m[2].trim().slice(0, 60) || sid;
          sessionLines.push(`- Session ${sid}: ${name}`);
        }
        const header = `## Phase plan (what we're building)\n\n**Phase:** ${phaseDesc}\n\n**Sessions:**`;
        if (sessionLines.length === 0) return `${header}\n(generated from feature guide; add session list in phase guide during execute)`;
        return `${header}\n${sessionLines.join('\n')}`;
      } catch {
        return undefined;
      }
    },

    async getTierDeliverables(): Promise<string> {
      const phaseDesc = await derivePhaseDescription(phase, context);
      const lines: string[] = [
        '**Phase plan**',
        `**Phase ${phase}:** ${phaseDesc}`,
        '**Sessions in this phase:**',
      ];
      const content = ctx.readResult?.guide ?? '';
      if (content) {
        const sessionMatches = content.matchAll(/Session\s+(\d+\.\d+\.\d+):?\s*([^\n]*)/gi);
        for (const m of sessionMatches) {
          const sid = m[1];
          const name = m[2].trim().slice(0, 60) || sid;
          lines.push(`- Session ${sid}: ${name}`);
        }
      }
      if (lines.length === 3) lines.push('(No sessions in feature-derived context; add in phase guide during execute)');
      lines.push('');
      lines.push("After approval we'll set up the branch and context, then cascade to the first session.");
      return lines.join('\n');
    },

    async ensureBranch() {
      await derivePhaseDescription(phase, context);
      const result = await ensureTierBranch(PHASE_CONFIG, phase, context);
      return result;
    },

    async afterBranch() {
      await derivePhaseDescription(phase, context);
      // Scope derived from context (tier + identifier) per command.
    },

    /** TierUp only: feature guide (phase descriptor). Phase guide and phase handoff files are excluded from planning input. */
    async readContext(): Promise<TierStartReadResult> {
      const phaseDesc = await derivePhaseDescription(phase, context);
      return readTierUpContext({
        tier: 'phase',
        identifier: phase,
        resolvedDescription: phaseDesc,
        context,
      });
    },

    getContextSourcePolicy() {
      return getTierContextSourcePolicy('phase');
    },

    async getTierGoals(): Promise<string> {
      const phaseDesc = await derivePhaseDescription(phase, context);
      const guide = ctx.readResult?.guide ?? '';
      const firstParagraph = guide.split(/\n\n+/)[0]?.trim().slice(0, 400) || phaseDesc || `Phase ${phase}`;
      return `Achieve phase outcomes: ${firstParagraph}. Success criteria and session breakdown define "done" for this tier.`;
    },

    async getTierDownBuildPlan(): Promise<string> {
      // Fix 1: Prefer current-tier (phase) guide when it exists so planning doc is seeded from the real list.
      const phaseGuidePath = context.paths.getPhaseGuidePath(phase);
      let content = '';
      try {
        content = await readProjectFile(phaseGuidePath);
      } catch {
        // Phase guide not on disk; use tierUp context (feature guide excerpt).
      }
      if (!content) content = ctx.readResult?.guide ?? '';
      // Match ### Session X.Y.Z: Name (same style as ensure-tier-down-docs).
      const sessionMatches = content.matchAll(/(?:^|\n)(?:-\s*\[\s*x?\s*\]\s*)?###\s+Session\s+(\d+\.\d+\.\d+)[\s:]\s*([^\n]*)/gi);
      const sessionLines: string[] = [];
      for (const m of sessionMatches) {
        const sid = m[1];
        const name = m[2].trim().slice(0, 80) || sid;
        sessionLines.push(`- **Session ${sid}:** ${name}`);
      }
      if (sessionLines.length === 0) {
        // Fallback: try tierUp guide (e.g. feature guide) for Session X.Y.Z lines.
        const tierUpContent = ctx.readResult?.guide ?? '';
        const tierUpMatches = tierUpContent.matchAll(/Session\s+(\d+\.\d+\.\d+):?\s*([^\n]*)/gi);
        for (const m of tierUpMatches) {
          const sid = m[1];
          const name = m[2].trim().slice(0, 80) || sid;
          sessionLines.push(`- **Session ${sid}:** ${name}`);
        }
      }
      if (sessionLines.length === 0) {
        return `Add sessions for Phase ${phase} in the phase guide (e.g. ${phase}.1, ${phase}.2), then run session-start for each in order. Cascade session-end → next session or phase-end.`;
      }
      return `Build the following sessions to achieve the phase goals:\n\n${sessionLines.join('\n')}\n\nRun session-start for each in order; after each session run session-end and cascade to next session or phase-end.`;
    },

    async getPlanningDocSlotDraft() {
      return getTierUpPlanningDocSections(ctx);
    },

    async gatherContext(): Promise<string> {
      try {
        const filePaths = await extractFilesFromPhaseGuide(phase, context.feature.name);
        if (filePaths.length === 0) return '';
        const fileStatuses = await gatherFileStatuses(filePaths);
        const reactFiles = fileStatuses.filter((f) => f.isReact);
        const vueFiles = fileStatuses.filter((f) => f.isVue);
        if (reactFiles.length === 0 && vueFiles.length === 0) return '';
        const parts: string[] = ['## Auto-Gathered Context\n', '**Files mentioned in phase guide:**\n'];
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

    async getContextQuestions(): Promise<ContextQuestion[]> {
      const phaseDesc = await derivePhaseDescription(phase, context);
      const displayName = phaseDesc || `Phase ${phase}`;
      let sessionSummary = '';
      let firstSessionName = '';
      const content = ctx.readResult?.guide ?? '';
      if (content) {
        const sessionMatches = content.matchAll(/Session\s+(\d+\.\d+\.\d+):?\s*([^\n]*)/gi);
        const sessionLines: string[] = [];
        let first: RegExpExecArray | null = null;
        for (const m of sessionMatches) {
          if (!first) first = m as unknown as RegExpExecArray;
          sessionLines.push(`Session ${m[1]}: ${m[2].trim().slice(0, 50)}`);
        }
        if (sessionLines.length > 0) {
          sessionSummary = sessionLines.join('; ');
          if (first) firstSessionName = first[2].trim().slice(0, 80);
        }
      }

      const questions: ContextQuestion[] = [];
      questions.push({
        category: 'scope',
        insight: sessionSummary
          ? `Phase intent: "${displayName}" through sessions: ${sessionSummary}.`
          : `Phase: "${displayName}".`,
        proposal: "We'll plan all necessary sessions and follow governance. This is the place to lock in or adjust what we're building.",
        question: "After reading the planning doc and context, what do you want to lock in or adjust before we proceed?",
        context: 'Where you and the agent talk about the plan.',
        options: ["Let's discuss in chat", "I'm ready to lock the plan as-is"],
      });
      if (firstSessionName) {
        questions.push({
          category: 'scope',
          insight: `First session in the guide: ${firstSessionName}.`,
          proposal: "We'll treat this as the initial deliverable focus unless you want to shift scope.",
          question: `For the first session (${firstSessionName}), what's the main deliverable or focus?`,
          context: 'Concrete deliverable for session one.',
          options: ['As in the guide', "I'll clarify in chat"],
        });
      }
      questions.push({
        category: 'approach',
        insight: "We'll follow governance (session order, session/task audits). No option to relax for speed.",
        proposal: "We'll follow the session order and apply governance.",
        question: `Any specific constraints or priorities for ${displayName}?`,
        context: 'Domain constraints only.',
        options: ["I'll describe in chat", 'None in mind'],
      });
      return questions;
    },

    async runExtras(ctx): Promise<string> {
      try {
        const inventoryJson = await readProjectFile('client/.audit-reports/inventory-audit.json');
        const inventory = JSON.parse(inventoryJson) as InventoryPayload;
        const guide = ctx.readResult?.guide ?? '';
        return buildReuseOpportunitiesSection(inventory, guide);
      } catch {
        return '';
      }
    },

    async getFirstTierDownId(): Promise<string | null> {
      try {
        const phaseGuideContent = await context.readPhaseGuide(phase);
        const firstSessionMatch = phaseGuideContent.match(/Session\s+(\d+\.\d+(?:\.\d+)?):/);
        return firstSessionMatch ? firstSessionMatch[1] : null;
      } catch {
        return null;
      }
    },

    getCompactPrompt() {
      return `Phase ${phaseId} planning complete. Cascade to first session.`;
    },

    runStartAudit: true,
  };

  const result = await runTierStartWorkflow(ctx, hooks);
  if (result.outcome.cascade) {
    result.outcome.nextAction = `Phase ${phaseId} planning complete. Cascade: ${result.outcome.cascade.command}`;
  }
  return result;
}
