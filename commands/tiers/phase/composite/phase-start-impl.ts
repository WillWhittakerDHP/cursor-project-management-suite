/**
 * Phase-start implementation. Thin adapter: builds hooks and runs shared start workflow.
 */

import { readProjectFile, PROJECT_ROOT } from '../../../utils/utils';
import { readHandoff } from '../../../utils/read-handoff';
import { join } from 'path';
import { access } from 'fs/promises';
import { MarkdownUtils } from '../../../utils/markdown-utils';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { extractFilesFromPhaseGuide, gatherFileStatuses } from '../../../utils/context-gatherer';
import { formatFileStatusList } from '../../../utils/context-templates';
import { ensureTierBranch } from '../../../git/shared/tier-branch-manager';
import { validatePhase, formatPhaseValidation } from './phase';
import { PHASE_CONFIG } from '../../configs/phase';
import { updateTierScope } from '../../../utils/tier-scope';
import { derivePhaseDescription } from '../../../planning/utils/resolve-planning-description';
import type { TierStartResult } from '../../../utils/tier-outcome';
import type {
  TierStartWorkflowContext,
  TierStartWorkflowHooks,
  TierStartValidationResult,
  TierStartReadResult,
  ContextQuestion,
} from '../../shared/tier-start-workflow';
import { runTierStartWorkflow } from '../../shared/tier-start-workflow';
import { buildReuseOpportunitiesSection, type InventoryPayload } from '../helpers/inventory-reuse-check';

export async function phaseStartImpl(
  phaseId: string,
  options?: import('../../../utils/command-execution-mode').CommandExecutionOptions
): Promise<TierStartResult> {
  const context = await WorkflowCommandContext.getCurrent();
  const phase = phaseId;
  const output: string[] = [];

  const ctx: TierStartWorkflowContext = {
    config: PHASE_CONFIG,
    identifier: phaseId,
    resolvedId: phase,
    options,
    context,
    output,
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
        const phaseGuideContent = await readProjectFile(context.paths.getPhaseGuidePath(phase));
        const phaseDesc = await derivePhaseDescription(phase, context);
        const sessionMatches = phaseGuideContent.matchAll(/Session\s+(\d+\.\d+\.\d+):?\s*([^\n]*)/gi);
        const sessionLines: string[] = [];
        for (const m of sessionMatches) {
          const sid = m[1];
          const name = m[2].trim().slice(0, 60) || sid;
          sessionLines.push(`- Session ${sid}: ${name}`);
        }
        if (sessionLines.length === 0) return undefined;
        const header = `## Phase plan (what we're building)\n\n**Phase:** ${phaseDesc}\n\n**Sessions:**`;
        return `${header}\n${sessionLines.join('\n')}`;
      } catch {
        return undefined;
      }
    },

    async getTierDeliverables(): Promise<string> {
      const phaseDesc = await derivePhaseDescription(phase, context);
      const lines: string[] = [`**Phase ${phase}:** ${phaseDesc}`];
      try {
        const phaseGuideContent = await readProjectFile(context.paths.getPhaseGuidePath(phase));
        const sessionMatches = phaseGuideContent.matchAll(/Session\s+(\d+\.\d+\.\d+):?\s*([^\n]*)/gi);
        for (const m of sessionMatches) {
          const sid = m[1];
          const name = m[2].trim().slice(0, 60) || sid;
          lines.push(`- Session ${sid}: ${name}`);
        }
      } catch { /* non-blocking */ }
      if (lines.length === 1) lines.push('(No sessions found in phase guide)');
      return lines.join('\n');
    },

    async ensureBranch() {
      return ensureTierBranch(PHASE_CONFIG, phase, context);
    },

    async afterBranch() {
      const phaseName = await derivePhaseDescription(phase, context);
      await updateTierScope('phase', { id: phase, name: phaseName });
    },

    async readContext(): Promise<TierStartReadResult> {
      const phaseGuidePath = context.paths.getPhaseGuidePath(phase);
      let guide = '';
      let handoff = '';
      try {
        await access(join(PROJECT_ROOT, phaseGuidePath));
        const phaseGuideContent = await readProjectFile(phaseGuidePath);
        const phaseSection = MarkdownUtils.extractSection(phaseGuideContent, `Phase ${phase}`);
        if (phaseSection) guide = phaseSection;
      } catch (_error) {
        const fullPath = join(PROJECT_ROOT, phaseGuidePath);
        guide =
          `**ERROR: Phase guide not found**\n` +
          `**Attempted:** ${phaseGuidePath}\n` +
          `**Full Path:** ${fullPath}\n` +
          `**Expected:** Phase guide file for phase ${phase}\n` +
          `**Suggestion:** Create the file at ${phaseGuidePath}\n` +
          `**Template:** Use \`.cursor/commands/tiers/phase/templates/phase-guide.md\` as a starting point\n`;
      }
      try {
        handoff = await readHandoff('phase', phase);
      } catch (_error) {
        handoff = `**ERROR: Phase handoff not found**\n${_error instanceof Error ? _error.message : String(_error)}\n`;
      }
      return {
        handoff: handoff ? '## Transition Context\n' + handoff : undefined,
        guide: guide || undefined,
        sectionTitle: 'Phase Guide',
      };
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
      const phaseName = await derivePhaseDescription(phase, context);
      const displayName = phaseName || `Phase ${phase}`;
      let firstSessionName = '';
      try {
        const phaseGuideContent = await readProjectFile(context.paths.getPhaseGuidePath(phase));
        const firstSessionMatch = phaseGuideContent.match(/Session\s+(\d+\.\d+\.\d+):?\s*([^\n]*)/i);
        if (firstSessionMatch) firstSessionName = firstSessionMatch[2].trim().slice(0, 80);
      } catch { /* non-blocking */ }
      const questions: ContextQuestion[] = [];
      questions.push({
        category: 'scope',
        question: `For this phase (${displayName}), what's the main outcome you want when we're done?`,
        context: 'Phase goal: what we\'re building.',
      });
      if (firstSessionName) {
        questions.push({
          category: 'scope',
          question: `For the first session (${firstSessionName}), what's the main deliverable or focus?`,
          context: 'Concrete deliverable for session one.',
        });
      }
      questions.push({
        category: 'approach',
        question: `Any specific constraints or priorities for ${displayName}?`,
        context: 'Helps sessions stay aligned with your expectations.',
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

    async getFirstChildId(): Promise<string | null> {
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
