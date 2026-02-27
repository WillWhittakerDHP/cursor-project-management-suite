/**
 * Feature-start implementation. Thin adapter: builds hooks and runs shared start workflow.
 */

import { featureLoad } from '../atomic/feature-load';
import { featureCheckpoint } from '../atomic/feature-checkpoint';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { extractFilePaths, gatherFileStatuses } from '../../../utils/context-gatherer';
import { formatFileStatusList } from '../../../utils/context-templates';
import { resolveFeatureId } from '../../../utils/feature-context';
import { FEATURE_CONFIG } from '../../configs/feature';
import { ensureTierBranch } from '../../../git/shared/tier-branch-manager';
import { updateTierScope } from '../../../utils/tier-scope';
import { deriveFeatureDescription } from '../../../planning/utils/resolve-planning-description';
import type { TierStartResult } from '../../../utils/tier-outcome';
import type {
  TierStartWorkflowContext,
  TierStartWorkflowHooks,
  TierStartValidationResult,
  TierStartReadResult,
} from '../../shared/tier-start-workflow';
import { runTierStartWorkflow } from '../../shared/tier-start-workflow';

const BLOCKED_STATUSES = ['complete', 'blocked'] as const;

export async function featureStartImpl(featureId: string, options?: import('../../../utils/command-execution-mode').CommandExecutionOptions): Promise<TierStartResult> {
  const featureName = await resolveFeatureId(featureId);
  const normalizedFeatureName = featureName.toLowerCase().replace(/\s+/g, '-');
  const context = new WorkflowCommandContext(normalizedFeatureName);
  const output: string[] = [];

  const ctx: TierStartWorkflowContext = {
    config: FEATURE_CONFIG,
    identifier: featureId,
    resolvedId: featureName,
    options,
    context,
    output,
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

    async ensureBranch() {
      return ensureTierBranch(FEATURE_CONFIG, normalizedFeatureName, context, {
        pullRoot: true,
        createIfMissing: true,
      });
    },

    async afterBranch() {
      const featureDisplayName = await deriveFeatureDescription(normalizedFeatureName, context);
      await updateTierScope('feature', { id: normalizedFeatureName, name: featureDisplayName });
    },

    async readContext(): Promise<TierStartReadResult> {
      const featureGuideContent = await context.readFeatureGuide();
      return { guide: featureGuideContent, sectionTitle: 'Feature Guide' };
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

    async getFirstChildId(): Promise<string | null> {
      return '1';
    },

    getCompactPrompt() {
      return `Feature planning complete. Cascade: /phase-start 1.`;
    },

    runStartAudit: true,
  };

  return runTierStartWorkflow(ctx, hooks);
}
