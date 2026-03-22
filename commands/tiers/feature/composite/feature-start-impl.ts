/**
 * Feature-start implementation. Thin adapter: builds hooks and runs shared start workflow.
 */

import { featureLoad } from '../atomic/feature-load';
import { resolveFeatureDirectoryFromPlan } from '../../../utils';
import { featureCheckpoint } from '../atomic/feature-checkpoint';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { extractFilePaths, gatherFileStatuses } from '../../../utils/context-gatherer';
import { formatFileStatusList } from '../../../utils/context-templates';
import { FEATURE_CONFIG } from '../../configs/feature';
import { ensureTierBranch } from '../../../git/shared/git-manager';
import { deriveFeatureDescription } from '../../../planning/utils/resolve-planning-description';
import { readTierUpContext, getTierContextSourcePolicy } from '../../shared/context-policy';
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
import type { RunRecorder, RunTraceHandle } from '../../../harness/contracts';
import { writeTierScope } from '../../../utils/tier-scope-writer';
import { refreshAcrossLadderArtifacts } from '../../../utils/across-ladder';

const BLOCKED_STATUSES = ['complete', 'blocked'] as const;

export type ShadowContext = { recorder: RunRecorder; handle: RunTraceHandle };

/** When provided (e.g. from harness), use this context instead of re-resolving feature. */
export async function featureStartImpl(
  featureId: string,
  options?: import('../../../utils/command-execution-mode').CommandExecutionOptions,
  shadow?: ShadowContext,
  resolvedContext?: WorkflowCommandContext
): Promise<TierStartResult | TierStartWorkflowResult> {
  const context =
    resolvedContext ??
    new WorkflowCommandContext(await resolveFeatureDirectoryFromPlan(featureId));
  const featureName = context.feature.name;
  const normalizedFeatureName = featureName;
  const output: string[] = [];

  const ctx: TierStartWorkflowContext = {
    config: FEATURE_CONFIG,
    identifier: featureId,
    resolvedId: normalizedFeatureName,
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
      const lines = [
        `# Starting Feature: ${featureName}\n`,
        `**Feature ID:** ${featureId}\n`,
      ];
      if (normalizedFeatureName !== featureName) {
        lines.push(`**Normalized:** ${normalizedFeatureName}\n`);
      }
      lines.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n\n`);
      return lines;
    },

    getBranchHierarchyOptions() {
      return { featureName: normalizedFeatureName };
    },

    async validate(): Promise<TierStartValidationResult> {
      try {
        const currentStatus = await FEATURE_CONFIG.controlDoc.readStatus(context, featureId);
        if (currentStatus !== null) {
          if (BLOCKED_STATUSES.includes(currentStatus as (typeof BLOCKED_STATUSES)[number])) {
            const msg =
              currentStatus === 'complete'
                ? 'This feature is marked Complete in PROJECT_PLAN. All work is finished.'
                : 'This feature is Blocked. Resolve the blocker before starting.';
            return {
              canStart: false,
              validationMessage:
                `**PROJECT_PLAN Status:** ${currentStatus}\n\n` +
                `**ERROR:** Cannot start feature with status "${currentStatus}".\n` +
                `${msg}\n` +
                '**Action:** Update the feature status in PROJECT_PLAN.md if this is incorrect.\n',
            };
          }
        }
      } catch (err) {
        console.warn('Feature start: could not read PROJECT_PLAN for status validation', err);
      }
      return { canStart: true, validationMessage: '' };
    },

    getPlanModeSteps() {
      return [
        'Git: `git checkout develop`',
        'Git: `git pull origin develop`',
        `Git: create/switch branch \`feature/${normalizedFeatureName}\``,
        `Docs: read \`${context.paths.getFeatureGuidePath()}\``,
        'Docs: generate workflow docs from feature plan (if plan exists and docs missing)',
        'Workflow: load feature context',
        'Workflow: create initial checkpoint',
        'Audit: run feature-start audit (non-blocking)',
      ];
    },

    async getPlanContentSummary(): Promise<string | undefined> {
      try {
        const featureGuideContent = await context.readFeatureGuide();
        const featureDesc = await deriveFeatureDescription(normalizedFeatureName, context);
        const phaseMatches = featureGuideContent.matchAll(/Phase\s+(\d+\.\d+):?\s*([^\n]*)/gi);
        const phaseLines: string[] = [];
        for (const m of phaseMatches) {
          const pid = m[1];
          const name = m[2].trim().slice(0, 60) || `Phase ${pid}`;
          phaseLines.push(`- Phase ${pid}: ${name}`);
        }
        if (phaseLines.length === 0) return undefined;
        const header = `## Feature plan (what we're building)\n\n**Feature:** ${featureDesc}\n\n**Phases:**`;
        return `${header}\n${phaseLines.join('\n')}`;
      } catch {
        return undefined;
      }
    },

    async getTierDeliverables(): Promise<string> {
      const featureDesc = await deriveFeatureDescription(normalizedFeatureName, context);
      const lines: string[] = [
        '**Feature plan**',
        `**Feature:** ${featureDesc}`,
        '**Phases in this feature:**',
      ];
      try {
        const featureGuideContent = await context.readFeatureGuide();
        const phaseMatches = featureGuideContent.matchAll(/Phase\s+(\d+\.\d+):?\s*([^\n]*)/gi);
        for (const m of phaseMatches) {
          const pid = m[1];
          const name = m[2].trim().slice(0, 60) || `Phase ${pid}`;
          lines.push(`- Phase ${pid}: ${name}`);
        }
      } catch { /* non-blocking */ }
      if (lines.length === 3) lines.push('(No phases found in feature guide)');
      lines.push('');
      lines.push("After approval we'll set up the branch and context, then cascade to the first phase.");
      return lines.join('\n');
    },

    async ensureBranch() {
      return ensureTierBranch(FEATURE_CONFIG, normalizedFeatureName, context, {
        pullRoot: true,
        createIfMissing: true,
      });
    },

    async afterBranch() {
      await deriveFeatureDescription(normalizedFeatureName, context);
      // Scope derived from context (tier + identifier) per command.
    },

    /** TierUp only: feature guide. No phase/session/task docs as planning input. */
    async readContext(): Promise<TierStartReadResult> {
      const resolvedDescription = await deriveFeatureDescription(normalizedFeatureName, context);
      return readTierUpContext({
        tier: 'feature',
        identifier: normalizedFeatureName,
        resolvedDescription,
        context,
      });
    },

    getContextSourcePolicy() {
      return getTierContextSourcePolicy('feature');
    },

    async getTierGoals(): Promise<string> {
      const featureDesc = await deriveFeatureDescription(normalizedFeatureName, context);
      const featureGuideContent = await context.readFeatureGuide();
      const firstBlock = featureGuideContent.split(/\n##\s+|\n---/)[0]?.trim().slice(0, 400) || featureDesc || normalizedFeatureName;
      return `Deliver the feature: ${firstBlock}. PROJECT_PLAN and feature guide define scope and "done" for this tier.`;
    },

    async getTierDownBuildPlan(): Promise<string> {
      const featureGuideContent = await context.readFeatureGuide();
      const phaseMatches = featureGuideContent.matchAll(/Phase\s+(\d+\.\d+):?\s*([^\n]*)/gi);
      const phaseLines: string[] = [];
      for (const m of phaseMatches) {
        const pid = m[1];
        const name = m[2].trim().slice(0, 80) || `Phase ${pid}`;
        phaseLines.push(`- **Phase ${pid}:** ${name}`);
      }
      if (phaseLines.length === 0) {
        return `Add phases for this feature in the feature guide (e.g. Phase 1, Phase 2), then run phase-start for each in order. Cascade phase-end → next phase or feature complete.`;
      }
      return `Build the following phases to achieve the feature goals:\n\n${phaseLines.join('\n')}\n\nRun phase-start for each in order; after each phase run phase-end and cascade to next phase.`;
    },

    async getPlanningDocSlotDraft() {
      return getTierUpPlanningDocSections(ctx);
    },

    async gatherContext(): Promise<string> {
      try {
        const featureGuideContent = await context.readFeatureGuide();
        const filePaths = extractFilePaths(featureGuideContent);
        if (filePaths.length === 0) return '';
        const fileStatuses = await gatherFileStatuses(filePaths);
        const reactFiles = fileStatuses.filter((f) => f.isReact);
        const vueFiles = fileStatuses.filter((f) => f.isVue);
        if (reactFiles.length === 0 && vueFiles.length === 0) return '';
        const parts: string[] = ['### Auto-Gathered Context\n', '**Key files mentioned in feature guide:**\n'];
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
      const featureDesc = await deriveFeatureDescription(normalizedFeatureName, context);
      const displayName = featureDesc || normalizedFeatureName;
      let phaseSummary = '';
      let firstPhaseName = '';
      try {
        const featureGuideContent = await context.readFeatureGuide();
        const phaseMatches = featureGuideContent.matchAll(/Phase\s+(\d+\.\d+):?\s*([^\n]*)/gi);
        const phaseLines: string[] = [];
        let first: RegExpExecArray | null = null;
        for (const m of phaseMatches) {
          if (!first) first = m as unknown as RegExpExecArray;
          phaseLines.push(`Phase ${m[1]}: ${m[2].trim().slice(0, 50)}`);
        }
        if (phaseLines.length > 0) {
          phaseSummary = phaseLines.join('; ');
          if (first) firstPhaseName = first[2].trim().slice(0, 80);
        }
      } catch { /* non-blocking */ }

      const questions: ContextQuestion[] = [];
      questions.push({
        category: 'scope',
        insight: phaseSummary
          ? `Feature intent: "${displayName}" through phases: ${phaseSummary}.`
          : `Feature: "${displayName}".`,
        proposal: "We'll plan all necessary phases and follow governance. This is the place to lock in or adjust what we're building.",
        question: "After reading the planning doc and context, what do you want to lock in or adjust before we proceed?",
        context: 'Where you and the agent talk about the plan.',
        options: ["Let's discuss in chat", "I'm ready to lock the plan as-is"],
      });
      if (firstPhaseName) {
        questions.push({
          category: 'scope',
          insight: `First phase in the guide: ${firstPhaseName}.`,
          proposal: "We'll treat this as the initial deliverable focus unless you want to shift scope.",
          question: `For the first phase (${firstPhaseName}), what's the main deliverable or focus?`,
          context: 'Concrete deliverable for phase one.',
          options: ['As in the guide', "I'll clarify in chat"],
        });
      }
      questions.push({
        category: 'approach',
        insight: "We'll follow governance (phase order, audits at tier boundaries). No option to relax for speed.",
        proposal: "We'll follow the phase order and apply governance (function/composable/component).",
        question: `Any specific constraints or priorities for ${displayName}?`,
        context: 'Domain constraints only.',
        options: ["I'll describe in chat", 'None in mind'],
      });
      return questions;
    },

    async runExtras(): Promise<string> {
      const parts: string[] = [];
      parts.push('## Step 2: Loading Feature Context\n\n');
      try {
        parts.push(await featureLoad(normalizedFeatureName));
      } catch (e) {
        parts.push(`**ERROR:** Failed to load feature context\n**Error:** ${e instanceof Error ? e.message : String(e)}\n`);
      }
      parts.push('\n---\n\n## Step 3: Creating Initial Checkpoint\n\n');
      try {
        parts.push(await featureCheckpoint(normalizedFeatureName));
      } catch (e) {
        parts.push(`**WARNING:** Failed to create checkpoint\n**Error:** ${e instanceof Error ? e.message : String(e)}\n`);
      }
      return parts.join('');
    },

    async getFirstTierDownId(): Promise<string | null> {
      return '1';
    },

    getCompactPrompt() {
      return `Feature planning complete. Cascade: /phase-start 1.`;
    },

    runStartAudit: true,
  };

  const result = await runTierStartWorkflow(ctx, hooks);
  let resultOutput = result.output;
  if (result.success) {
    await writeTierScope({
      feature: { id: context.feature.name, name: `Feature: ${context.feature.name}` },
    });
    try {
      const { summary } = await refreshAcrossLadderArtifacts(context, { tier: 'feature' });
      resultOutput = `${resultOutput}\n\n${summary}`.trim();
    } catch (err) {
      console.warn('[feature-start] across-ladder refresh failed', err);
    }
  }
  return { ...result, output: resultOutput };
}
