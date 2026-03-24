/**
 * Reusable step modules for the tier start workflow.
 * Each step uses shared primitives (formatBranchHierarchy, runTierPlan, buildCascadeDown)
 * and tier-supplied hooks. The orchestrator runs these in order; steps that can exit early return a result.
 */

import type {
  TierStartWorkflowContext,
  TierStartWorkflowHooks,
  TierStartReadResult,
  ContextQuestion,
  TierDownPlanItem,
  ParsedPlanningSections,
} from './tier-start-workflow-types';
import type { TierStartResult, CascadeInfo } from '../../utils/tier-outcome';
import type { CannotStartTier } from '../../utils/tier-start-utils';
import { formatBranchHierarchy, formatCannotStart } from '../../utils/tier-start-utils';
import { isAutoCommittable } from '../../git/shared/git-manager';
import { resolveCommandExecutionMode, isPlanMode } from '../../utils/command-execution-mode';
import { runTierPlan } from './tier-plan';
import { buildCascadeDown } from '../../utils/tier-cascade';
import { spawn } from 'child_process';
import { join } from 'path';
import type { AuditTier } from '../../audit/types';
import { buildTierStampFromId } from '../../audit/baseline-log';
import { buildGovernanceContext } from '../../audit/governance-context';
import { buildContinuitySummary, buildReferencePaths, type ReferencePaths, TIER_CONTEXT_SOURCES } from './context-policy';
import { fillDirectTierDownInGuide } from './fill-direct-tier-down';
import {
  runEnsureTierDownDocsForTier,
  hasPhaseSection,
  hasSessionSection,
  hasTaskSection,
  buildPhaseSection,
  buildSessionSection,
  buildTaskSection,
  deriveTierDownPlanItemsFromGuide,
} from './ensure-tier-down-docs';
import { ensureGuideHasRequiredSections } from './guide-required-sections';
import { readProjectFile, PROJECT_ROOT } from '../../utils/utils';
import { buildTierAdvisoryContext } from '../../harness/tier-advisory-context';
import { classifyWorkProfile } from '../../harness/work-profile-classifier';
import { resolvePlanningDocRelativePath } from '../../utils/planning-doc-paths';
import type { PlanningTier } from '../../utils/planning-doc-paths';
import type { WorkflowCommandContext } from '../../utils/command-context';
import type { TierName } from './types';
import { tierDown } from '../../utils/tier-navigation';
import { WorkflowId } from '../../utils/id-utils';
import {
  formatOpenQuestionsWarning,
  formatInheritedQuestionsPlanningDocSection,
} from '../../utils/open-questions';

/** Early-exit result from a step; null means continue. */
export type StepExitResult = TierStartResult | null;

/** Append header and branch hierarchy (always run first). */
export function stepAppendHeaderAndBranchHierarchy(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): void {
  ctx.output.push(hooks.buildHeader(ctx).join('\n'));
}

export async function stepAppendBranchHierarchy(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  const section = await formatBranchHierarchy(hooks.getBranchHierarchyOptions(ctx));
  ctx.output.push(section);
}

/** Validate start; return result to exit early if cannot start. */
export async function stepValidateStart(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<StepExitResult> {
  const validation = await hooks.validate(ctx);
  if (!validation.canStart) {
    ctx.output.push(validation.validationMessage);
    ctx.output.push(formatCannotStart(ctx.config.name as CannotStartTier, ctx.identifier));
    return {
      success: false,
      output: ctx.output.join('\n\n'),
      outcome: {
        status: 'blocked',
        reasonCode: 'validation_failed',
        nextAction: validation.validationMessage,
      },
    };
  }
  return null;
}

/**
 * Read guide/handoff in plan mode without appending to ctx.output.
 * Populates ctx.readResult so getContextQuestions(ctx) has content. Only runs in plan mode.
 */
export async function stepReadContextLight(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (!isPlanMode(executionMode)) return;
  if (!hooks.readContext) return;
  if (ctx.readResult) return;

  try {
    ctx.readResult = await hooks.readContext(ctx);
  } catch {
    // Non-blocking: guide/handoff may not exist yet.
  }
}

/** Ensure branch (optional); push messages and optionally exit on failure. */
export async function stepEnsureStartBranch(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<StepExitResult> {
  if (!hooks.ensureBranch) return null;
  const branchResult = await hooks.ensureBranch(ctx);
  ctx.branchEnsureResult = branchResult;
  for (const msg of branchResult.messages) {
    ctx.output.push(msg);
  }
  if (!branchResult.success) {
    if (branchResult.blockedByUncommitted) {
      // Playbook: block only on files we do not treat as non-blocking (.cursor, .project-manager, audit reports are stashed then popped on target).
      const allFiles = branchResult.uncommittedFiles ?? [];
      const blockingFiles = allFiles.filter(f => !isAutoCommittable(f.trim()));
      if (blockingFiles.length > 0) {
        const fileList = blockingFiles.map(f => `- \`${f}\``).join('\n');
        return {
          success: true,
          output: ctx.output.join('\n\n'),
          outcome: {
            status: 'blocked',
            reasonCode: 'uncommitted_changes_blocking',
            nextAction: 'Uncommitted changes must be resolved before switching branches.',
            deliverables: `**Uncommitted files blocking checkout:**\n${fileList}\n\nCommit these changes, or skip (stash) to proceed without committing.`,
          },
        };
      }
      // Only workflow artifacts (.cursor, .project-manager, audit reports) changed; stashed (non-blocking). Continue.
      if (hooks.afterBranch) {
        await hooks.afterBranch(ctx);
      }
      return null;
    }
    return {
      success: false,
      output: ctx.output.join('\n\n'),
      outcome: {
        status: 'blocked',
        reasonCode: 'branch_failed',
        nextAction: branchResult.messages.join(' '),
      },
    };
  }
  if (hooks.afterBranch) {
    await hooks.afterBranch(ctx);
  }
  return null;
}

/** Leaf decomposition: no child headings; harness auto-scaffolds `.1` tierDown rows. */
export const LEAF_TIER_MARKER = /\*\*Leaf tier\*\*/i;

/**
 * Extract ## Decomposition body, or legacy "## How we build the tierDown…" (migration fallback).
 */
export function extractDecompositionSection(content: string): string {
  const newMatch = content.match(/\n##\s+Decomposition\s*[\r\n]+([\s\S]*?)(?=\n##\s+|$)/i);
  if (newMatch) return newMatch[1].trim();
  const oldMatch = content.match(/\n##\s+How we build the tierDown[^\n]*[\r\n]+([\s\S]*?)(?=\n##\s+|$)/i);
  return oldMatch ? oldMatch[1].trim() : '';
}

/** @deprecated Use extractDecompositionSection */
function extractTierDownBuildPlanSection(content: string): string {
  return extractDecompositionSection(content);
}

function buildLeafAutoChildren(
  tier: 'feature' | 'phase' | 'session',
  id: string,
  title: string
): TierDownPlanItem[] {
  if (tier === 'feature') {
    return [{ id: `${id}.1`, description: title, autoScaffolded: true }];
  }
  if (tier === 'phase') {
    return [{ id: `${id}.1`, description: title, autoScaffolded: true }];
  }
  return [{ id: `${id}.1`, description: title, autoScaffolded: true }];
}

/**
 * Parse per-tierDown items from the decomposition section. Supports ### headings, bullets, or **Leaf tier**.
 */
function parseTierDownBuildPlanPerItem(
  buildPlanContent: string,
  tierDownKind: 'phase' | 'session' | 'task'
): TierDownPlanItem[] {
  if (!buildPlanContent.trim()) return [];
  if (LEAF_TIER_MARKER.test(buildPlanContent)) return [];

  const items: TierDownPlanItem[] = [];

  const headingRe =
    tierDownKind === 'phase'
      ? /###\s+Phase\s+(\d+\.\d+)\s*:\s*(.+)/gi
      : tierDownKind === 'session'
        ? /###\s+Session\s+(\d+\.\d+\.\d+)\s*:\s*(.+)/gi
        : /###\s+Task\s+(\d+\.\d+\.\d+\.\d+)\s*:\s*(.+)/gi;

  for (const m of buildPlanContent.matchAll(headingRe)) {
    const id = m[1].trim();
    const description = (m[2] ?? '').trim().slice(0, 500) || id;
    if (id && !items.some(i => i.id === id)) items.push({ id, description });
  }

  if (items.length > 0) return items;

  const lines = buildPlanContent.split('\n').map(l => l.trim()).filter(Boolean);
  const phaseRe = /(?:^|\s)(?:\*\*)?Phase\s+(\d+\.\d+)(?:\*\*)?\s*:?\s*(.*)$/i;
  const sessionRe = /(?:^|\s)(?:\*\*)?Session\s+(\d+\.\d+\.\d+)(?:\*\*)?\s*:?\s*(.*)$/i;
  const taskRe = /(?:^|\s)(?:\*\*)?Task\s+(\d+\.\d+\.\d+\.\d+)(?:\*\*)?\s*:?\s*(.*)$/i;
  const re = tierDownKind === 'phase' ? phaseRe : tierDownKind === 'session' ? sessionRe : taskRe;
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      const id = m[1].trim();
      const description = (m[2] ?? '').trim().slice(0, 500) || id;
      if (id && !items.some(i => i.id === id)) items.push({ id, description });
    }
  }
  return items;
}

/**
 * Build minimal guide content from planning-doc tierDown items when the guide is missing.
 * Used by syncPlannedTierDownToGuide so the guide is created from the plan instead of a one-default fallback.
 */
function buildGuideFromPlanItems(
  tier: 'feature' | 'phase' | 'session',
  identifier: string,
  description: string,
  items: TierDownPlanItem[]
): string {
  if (tier === 'feature') {
    return [
      `# Feature ${identifier}: ${description}`,
      '',
      '**Purpose:** Feature-level guide.',
      '**Tier:** Feature',
      '',
      '---',
      '',
      '## Phases Breakdown',
      '',
      ...items.map((i) => buildPhaseSection(i.id, i.description)),
    ].join('\n');
  }
  if (tier === 'phase') {
    return [
      `# Phase ${identifier} Guide: ${description}`,
      '',
      '**Purpose:** Phase-level guide for planning and tracking.',
      '**Tier:** Phase',
      '',
      '---',
      '',
      '## Phase Overview',
      '',
      `**Phase Number:** ${identifier}`,
      `**Phase Name:** ${description}`,
      '**Description:** [Fill in]',
      '**Duration:** 1+ sessions',
      '**Status:** Not Started',
      '',
      '---',
      '',
      '## Sessions Breakdown',
      '',
      ...items.map((i) => buildSessionSection(i.id, i.description)),
    ].join('\n');
  }
  return [
    `# Session ${identifier} Guide: ${description}`,
    '',
    '**Purpose:** Session-level guide with task breakdown.',
    '**Tier:** Session',
    '',
    '---',
    '',
    '## Quick Start',
    '',
    '### Tasks',
    '',
    ...items.map((i) => buildTaskSection(i.id, i.description)),
    '',
    '---',
    '',
    '## Session Workflow',
    '',
    '### Before Starting a Session',
    '',
    'Use `/session-start [SESSION_ID] [description]` to load context and plan tasks.',
    '',
    '### During Session',
    '',
    '1. Work on one task at a time.',
    '2. Document decisions inline in code.',
    '3. Pause after each task for checkpoint before continuing.',
    '',
  ].join('\n');
}

/**
 * Merge task items for a session: phase guide's **Tasks:** list plus planning-doc items.
 * Ensures we never create a session guide with only one task when the phase lists more.
 */
function mergeSessionTaskItemsFromPhaseAndPlan(
  phaseGuideContent: string,
  sessionId: string,
  parsedItems: TierDownPlanItem[]
): TierDownPlanItem[] {
  const escaped = sessionId.replace(/\./g, '\\.');
  const sessionBlockRegex = new RegExp(
    `###\\s+Session\\s+${escaped}[\\s:\\S]*?(?=\\n###\\s+Session|\\n##\\s+|$)`,
    'i'
  );
  const sessionBlock = phaseGuideContent.match(sessionBlockRegex)?.[0] ?? '';
  const taskListMatch = sessionBlock.match(/\*\*Tasks:\*\*\s*([\s\S]*?)(?=\n\*\*|\n\n|$)/i);
  const taskList = taskListMatch?.[1]?.trim() ?? '';
  const phaseTaskIds: string[] = [];
  if (taskList) {
    const bulletOrNum = /(?:^|\n)\s*[-*]?\s*(\d+\.\d+\.\d+\.\d+)/g;
    let tm: RegExpExecArray | null;
    while ((tm = bulletOrNum.exec(taskList)) !== null) {
      const tid = tm[1];
      if (tid && !phaseTaskIds.includes(tid)) phaseTaskIds.push(tid);
    }
  }
  const byId = new Map<string, string>();
  for (const id of phaseTaskIds) {
    byId.set(id, parsedItems.find((p) => p.id === id)?.description ?? `Task ${id}`);
  }
  for (const item of parsedItems) {
    if (!byId.has(item.id)) byId.set(item.id, item.description);
  }
  const merged = Array.from(byId.entries(), ([id, description]) => ({ id, description }));
  merged.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return merged;
}

/**
 * Sync planned tierDown IDs and descriptions from the planning doc into the current-tier guide:
 * parse "How we build the tierDown", store on ctx.tierDownPlanItems, append missing headings.
 * Execute mode only. Feature/phase require a planning doc on disk. Session may run without one and scaffolds from the phase guide + minimal tasks.
 */
async function syncPlannedTierDownToGuide(ctx: TierStartWorkflowContext): Promise<void> {
  const tier = ctx.config.name;
  if (tier === 'task') return;
  const docTier = tier as 'feature' | 'phase' | 'session';
  const planningTier = tier as PlanningTier;
  const dm = ctx.context.documents;

  let parsedItems: TierDownPlanItem[] = [];
  ctx.leafTier = false;
  if (await dm.planningDocExists(planningTier, ctx.identifier)) {
    const planningContent = await dm.readPlanningDoc(planningTier, ctx.identifier);
    const sectionContent = extractDecompositionSection(planningContent);
    const childTier = tierDown(tier);
    if (childTier !== 'phase' && childTier !== 'session' && childTier !== 'task') {
      throw new Error(`syncPlannedTierDownToGuide: cannot resolve child tier for ${tier}`);
    }
    if (LEAF_TIER_MARKER.test(sectionContent)) {
      parsedItems = buildLeafAutoChildren(docTier, ctx.identifier, ctx.resolvedDescription ?? ctx.identifier);
      ctx.leafTier = true;
    } else {
      parsedItems = parseTierDownBuildPlanPerItem(sectionContent, childTier);
    }
  } else if (tier !== 'session') {
    const rel = dm.getPlanningDocRelativePath(planningTier, ctx.identifier);
    throw new Error(
      `Planning doc missing at ${rel}. Create it before ${tier} tier-start in execute mode.`
    );
  }
  ctx.tierDownPlanItems = parsedItems.length > 0 ? parsedItems : undefined;

  let guidePath: string;
  if (tier === 'feature') guidePath = ctx.context.paths.getFeatureGuidePath();
  else if (tier === 'phase') guidePath = ctx.context.paths.getPhaseGuidePath(ctx.identifier);
  else guidePath = ctx.context.paths.getSessionGuidePath(ctx.identifier);

  let guideContent: string;
  try {
    guideContent = await dm.readGuide(docTier, ctx.identifier);
  } catch {
    if (tier === 'session') {
      if (await dm.guideExists('session', ctx.identifier)) {
        throw new Error(
          `Session guide exists at ${guidePath} but could not be read. Fix the file on disk.`
        );
      }
      let phaseGuideContent = '';
      try {
        const phaseId = ctx.identifier.split('.').slice(0, 2).join('.');
        phaseGuideContent = await dm.readGuide('phase', phaseId);
      } catch {
        /* session may scaffold minimal task without phase guide */
      }
      const mergedItems =
        phaseGuideContent.trim() !== ''
          ? mergeSessionTaskItemsFromPhaseAndPlan(phaseGuideContent, ctx.identifier, parsedItems)
          : parsedItems.length > 0
            ? parsedItems
            : [{ id: `${ctx.identifier}.1`, description: `Task ${ctx.identifier}.1` }];
      const description = ctx.resolvedDescription ?? ctx.identifier;
      guideContent = buildGuideFromPlanItems(tier, ctx.identifier, description, mergedItems);
      ctx.tierDownPlanItems = mergedItems;
      guideContent = ensureGuideHasRequiredSections(guideContent, tier, ctx.identifier, description);
      await ctx.context.documents.writeGuide('session', ctx.identifier, guideContent);
    } else {
      if (await dm.guideExists(docTier, ctx.identifier)) {
        throw new Error(`Guide exists at ${guidePath} but could not be read. Fix the file on disk.`);
      }
      if (parsedItems.length === 0) {
        throw new Error(
          `Guide missing at ${guidePath} and planning doc has no parseable tierDown items. Fill "## Decomposition" (or legacy How we build the tierDown) in the planning doc, or use **Leaf tier**.`
        );
      }
      const description = ctx.resolvedDescription ?? ctx.identifier;
      guideContent = buildGuideFromPlanItems(tier, ctx.identifier, description, parsedItems);
      guideContent = ensureGuideHasRequiredSections(guideContent, tier, ctx.identifier, description);
      await ctx.context.documents.writeGuide(tier, ctx.identifier, guideContent);
    }
  }

  let itemsToAppend = parsedItems;
  if (parsedItems.length === 0 && guideContent) {
    const fromGuide = deriveTierDownPlanItemsFromGuide(guideContent, tier);
    if (fromGuide.length > 0) {
      ctx.tierDownPlanItems = fromGuide;
      itemsToAppend = fromGuide;
    }
  }

  if (tier === 'feature' && contentIsGuideFilled(guideContent)) {
    return;
  }

  let updated = guideContent;
  for (const item of itemsToAppend) {
    if (tier === 'feature' && !hasPhaseSection(updated, item.id)) {
      updated = updated.trimEnd() + '\n' + buildPhaseSection(item.id, item.description);
    } else if (tier === 'phase' && !hasSessionSection(updated, item.id)) {
      updated = updated.trimEnd() + '\n' + buildSessionSection(item.id, item.description);
    } else if (tier === 'session' && !hasTaskSection(updated, item.id)) {
      updated = updated.trimEnd() + '\n' + buildTaskSection(item.id, item.description);
    }
  }
  if (updated !== guideContent) {
    updated = ensureGuideHasRequiredSections(
      updated,
      tier,
      ctx.identifier,
      ctx.resolvedDescription ?? ctx.identifier
    );
    await ctx.context.documents.writeGuide(tier, ctx.identifier, updated);
  }
}

/** Sync planned tierDown from planning doc into guide (headings + ctx.tierDownPlanItems). Execute mode only; run before stepEnsureTierDownDocs. */
export async function stepSyncPlannedTierDownToGuide(
  ctx: TierStartWorkflowContext,
  _hooks: TierStartWorkflowHooks
): Promise<void> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (isPlanMode(executionMode)) {
    throw new Error(
      'stepSyncPlannedTierDownToGuide requires execute mode (plan mode fails at stepEnsureGuideFromPlan).'
    );
  }
  if (ctx.config.name === 'task') return;
  await syncPlannedTierDownToGuide(ctx);
}

/** Ensure tierDown docs exist (enumerate from guide, append sections, create tierDown guide/log). Execute mode only. */
export async function stepEnsureTierDownDocs(
  ctx: TierStartWorkflowContext,
  _hooks: TierStartWorkflowHooks
): Promise<void> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (isPlanMode(executionMode)) {
    throw new Error('stepEnsureTierDownDocs requires execute mode.');
  }
  await runEnsureTierDownDocsForTier(ctx);
}

function buildGuideMaterializationPlanModeFailure(ctx: TierStartWorkflowContext): TierStartResult {
  const tier = ctx.config.name;
  const guidePath =
    tier === 'phase'
      ? ctx.context.paths.getPhaseGuidePath(ctx.identifier)
      : tier === 'session'
        ? ctx.context.paths.getSessionGuidePath(ctx.identifier)
        : ctx.context.paths.getFeatureGuidePath();
  const planningPath = ctx.context.documents.getPlanningDocRelativePath(
    ctx.config.name as PlanningTier,
    ctx.identifier
  );
  const output = [
    '# Guide materialization requires execute mode',
    '',
    'Guides are not written to disk in **plan** mode.',
    '',
    `- **Guide:** \`${guidePath}\``,
    `- **Planning:** \`${planningPath}\``,
    '',
    'Run **/accepted-plan** (then **/accepted-build** if prompted) or re-invoke this tier-start in **execute** mode.',
  ].join('\n');
  return {
    success: false,
    output,
    outcome: {
      status: 'failed',
      reasonCode: 'guide_materialization_requires_execute',
      nextAction:
        'Run /accepted-plan or tier-start in execute mode so guides and planning artifacts can be materialized.',
      guidePath,
    },
  };
}

async function ensureSessionGuideMaterializedForTaskStart(
  ctx: TierStartWorkflowContext
): Promise<void> {
  const parsed = WorkflowId.parseTaskId(ctx.identifier);
  if (!parsed) {
    throw new Error(`ensureSessionGuideMaterializedForTaskStart: invalid task id "${ctx.identifier}"`);
  }
  const sessionId = parsed.sessionId;
  if (await ctx.context.documents.guideExists('session', sessionId)) {
    return;
  }
  const desc = ctx.resolvedDescription ?? sessionId;
  await ctx.context.documents.ensureGuide('session', sessionId, desc);
}

/**
 * Single "ensure guide from plan" step: sync plan → current-tier guide (create or append only, never overwrite),
 * then ensure child tierDown docs exist. Plan mode returns a hard failure (no disk writes).
 */
export async function stepEnsureGuideFromPlan(
  ctx: TierStartWorkflowContext,
  _hooks: TierStartWorkflowHooks
): Promise<TierStartResult | null> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (isPlanMode(executionMode)) {
    if (ctx.config.name === 'task') {
      const parsed = WorkflowId.parseTaskId(ctx.identifier);
      if (!parsed) return null;
      const sessionId = parsed.sessionId;
      if (!(await ctx.context.documents.guideExists('session', sessionId))) {
        const gp = ctx.context.paths.getSessionGuidePath(sessionId);
        return {
          success: false,
          output: [
            '# Session guide missing (plan mode)',
            '',
            `Expected: \`${gp}\``,
            '',
            'Run **/session-start** in **execute** mode (or /accepted-plan), then retry task-start.',
          ].join('\n'),
          outcome: {
            status: 'failed',
            reasonCode: 'guide_materialization_requires_execute',
            nextAction: `Materialize session guide at ${gp} via session-start in execute mode.`,
            guidePath: gp,
          },
        };
      }
      return null;
    }
    return buildGuideMaterializationPlanModeFailure(ctx);
  }
  if (ctx.config.name === 'task') {
    await ensureSessionGuideMaterializedForTaskStart(ctx);
    return null;
  }
  await syncPlannedTierDownToGuide(ctx);
  await runEnsureTierDownDocsForTier(ctx);
  return null;
}

/** Legacy: ensure child docs. Execute mode only. No hook on interface; step is no-op. Use stepEnsureTierDownDocs instead. */
export async function stepEnsureChildDocs(
  ctx: TierStartWorkflowContext,
  _hooks: TierStartWorkflowHooks
): Promise<void> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (isPlanMode(executionMode)) {
    throw new Error('stepEnsureChildDocs requires execute mode.');
  }
}

/** Read handoff/guide/label and append to output (optional step). */
export async function stepReadStartContext(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  if (!hooks.readContext) return;
  const readResult: TierStartReadResult = await hooks.readContext(ctx);
  ctx.readResult = readResult;
  if (readResult.label) ctx.output.push(readResult.label);
  if (readResult.handoff) ctx.output.push(readResult.handoff);
  if (readResult.guide) {
    const title = readResult.sectionTitle ?? 'Guide';
    ctx.output.push(`## ${title}\n\n${readResult.guide}`);
  }
}

/** Fill implementation-plan fields for all direct tierDown units in tierUp guide (execute mode only). */
export async function stepFillDirectTierDown(
  ctx: TierStartWorkflowContext,
  _hooks: TierStartWorkflowHooks
): Promise<void> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (isPlanMode(executionMode)) {
    throw new Error('stepFillDirectTierDown requires execute mode (no guide mutations in plan mode).');
  }
  if (ctx.config.name === 'task') return;
  // Gate 2 already produced a filled guide; updateGuide would hit the project-manager write guard.
  if (ctx.options?.guideFillComplete) return;
  // First /accepted-plan execute pass (no guideFillComplete): if the agent already removed tierDown
  // placeholders in the phase/session guide, skip auto-fill — updateGuide would be blocked as overwrite.
  if (ctx.config.name === 'phase' || ctx.config.name === 'session') {
    if (await isGuideFilled(ctx.config.name, ctx.identifier, ctx.context)) return;
  }
  await fillDirectTierDownInGuide(ctx);
}

/** Gather context string and append if non-empty (optional step). */
export async function stepGatherContext(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  if (!hooks.gatherContext) return;
  const gathered = await hooks.gatherContext(ctx);
  if (gathered) ctx.output.push(gathered);
}

/** Inject tier-appropriate governance context (findings, thresholds, inventory). Uses policy.governance when available. */
export async function stepGovernanceContext(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  const policy = hooks.getContextSourcePolicy?.(ctx);
  if (policy?.governance === false) return;

  const taskFiles = hooks.getTierDownFilePaths
    ? await hooks.getTierDownFilePaths(ctx)
    : undefined;

  const governance = await buildGovernanceContext({
    tier: ctx.config.name,
    taskFiles,
  });
  if (governance) ctx.output.push(governance);
}

/** Placeholder strings that indicate the planning doc has not been filled by the agent. */
export const PLACEHOLDER_REFINED = '[To be refined during discussion]';

/** Placeholder for the "How we build the tierDown" section; agent must list tierDown units (phases/sessions/tasks). */
export const PLACEHOLDER_TIERDOWN = '[List tierDown units here]';

/** Parser-friendly decomposition: bullet or ### heading with Phase/Session/Task id. */
const PARSER_FRIENDLY_TIERDOWN_LINE =
  /(?:-\s+\*\*(?:Session|Phase|Task)\s+\d[\d.]*\*\*:|###\s+(?:Session|Phase|Task)\s+\d[\d.]*\s*:)/;

/**
 * Returns true if tierDownBuildPlan contains at least one parser-friendly bullet line.
 * Used so we never seed prose into the planning doc tierDown section.
 */
export function hasParserFriendlyTierDownBullets(tierDownBuildPlan: string | undefined): boolean {
  if (!tierDownBuildPlan?.trim()) return false;
  return PARSER_FRIENDLY_TIERDOWN_LINE.test(tierDownBuildPlan);
}

/**
 * Tier-aware single bullet placeholder when hook output is not parseable.
 * Ensures the section is always machine-parseable and shows the agent the required format.
 */
function getTierDownBulletPlaceholder(
  tier: 'feature' | 'phase' | 'session' | 'task',
  identifier: string
): string {
  if (tier === 'feature') {
    return `- **Phase ${identifier}:** [one line per phase in this feature]`;
  }
  if (tier === 'phase') {
    const firstSession = `${identifier}.1`;
    return `- **Session ${firstSession}:** [one line per session in this phase]`;
  }
  if (tier === 'session') {
    const firstTask = `${identifier}.1`;
    return `- **Task ${firstTask}:** [one line per task in this session]`;
  }
  return PLACEHOLDER_TIERDOWN;
}

/** Placeholder patterns in guide tierDown blocks that indicate the agent has not yet filled them (Option A Gate 2). */
const GUIDE_TIERDOWN_PLACEHOLDERS = [
  '[Fill in]',
  '[To be planned]',
  '[To be defined]',
] as const;

/** Returns true if content has no guide-fill placeholders (used to avoid appending placeholder sections to a filled guide). */
function contentIsGuideFilled(content: string): boolean {
  for (const p of GUIDE_TIERDOWN_PLACEHOLDERS) {
    if (content.includes(p)) return false;
  }
  return true;
}

/**
 * Returns true if the guide has been filled (no placeholder text in tierDown blocks).
 * Used by /accepted-build for Gate 2 when state is guide_fill_pending.
 */
export async function isGuideFilled(
  tier: 'feature' | 'phase' | 'session',
  identifier: string,
  context: WorkflowCommandContext
): Promise<boolean> {
  let content: string;
  try {
    content =
      tier === 'feature'
        ? await context.documents.readGuide('feature')
        : await context.documents.readGuide(tier, identifier);
  } catch {
    return false;
  }
  for (const p of GUIDE_TIERDOWN_PLACEHOLDERS) {
    if (content.includes(p)) return false;
  }
  return true;
}

/** Task-tier placeholders (same enforcement for all tiers). */
const TASK_PLACEHOLDERS = [
  '[Define explicit coding goal before beginning implementation]',
  '[List files to touch]',
  '[Outline steps before coding]',
  '[Key code shapes or signatures]',
  '[What to verify when done]',
] as const;

const PLANNING_STORY_PLACEHOLDERS = [
  '[Analyze the problem space before planning]',
  '[Describe what changes and why]',
  '[Define acceptance criteria]',
  '[As a ... I want ... so that ...]',
  '[List concrete deliverables]',
] as const;

/**
 * Returns false if the planning doc content still contains placeholders (doc not filled).
 * Used by accepted-plan and accepted-code to block proceeding until the agent fills the doc.
 * All tiers (feature, phase, session, task) use the same check.
 */
/** Fix 2: Bullet-format placeholders that indicate tierDown section not yet filled by agent. */
const TIERDOWN_BULLET_PLACEHOLDERS = [
  '[one line per session in this phase]',
  '[one line per task in this session]',
  '[one line per phase in this feature]',
] as const;

export function isPlanningDocFilled(content: string): boolean {
  if (content.includes(PLACEHOLDER_REFINED)) {
    return false;
  }
  if (content.includes(PLACEHOLDER_TIERDOWN)) {
    return false;
  }
  for (const p of TIERDOWN_BULLET_PLACEHOLDERS) {
    if (content.includes(p)) return false;
  }
  for (const p of TASK_PLACEHOLDERS) {
    if (content.includes(p)) return false;
  }
  for (const p of PLANNING_STORY_PLACEHOLDERS) {
    if (content.includes(p)) return false;
  }
  return true;
}

/**
 * Advisory: Analysis section should be multi-line reasoning (feature/phase/session).
 * Not a hard gate — surfaced in context_gathering for agent judgment.
 */
export function isPlanningDocSubstantive(content: string, tier: TierName): boolean {
  if (tier === 'task') return true;
  const analysisMatch = content.match(/## Analysis\s*\n([\s\S]*?)(?=\n## |$)/);
  if (!analysisMatch) return false;
  const analysisContent = analysisMatch[1].trim();
  const lines = analysisContent
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !/^-\s*What\b/i.test(l));
  return lines.length >= 3;
}

/**
 * Build project-relative planning doc path from tier, identifier, and base path.
 *
 * @deprecated Prefer `WorkflowCommandContext.documents.getPlanningDocRelativePath(tier, id)` so path
 * resolution stays centralized on `DocumentManager`. Kept for rare call sites that only have
 * `(tier, identifier, basePath)` without a `WorkflowCommandContext`.
 */
export function getPlanningDocPathForTier(
  tier: 'feature' | 'phase' | 'session' | 'task',
  identifier: string,
  basePath: string
): string {
  return resolvePlanningDocRelativePath(basePath, tier, identifier);
}

/** Build planning doc path for task or session (sessions dir). */
function getPlanningDocPath(ctx: TierStartWorkflowContext): string {
  return resolvePlanningDocRelativePath(
    ctx.context.paths.getBasePath(),
    ctx.config.name as PlanningTier,
    ctx.identifier
  );
}

/** Extract ## Goal, ## Files, ## Approach, ## Checkpoint from planning doc content. Used to sync guide and todos from planning doc at tier-start. */
export function parsePlanningDocSections(content: string): ParsedPlanningSections | null {
  const sections: Record<string, string> = {};
  const regex = /^##\s+(Goal|Files|Approach|Checkpoint)\s*$/gim;
  let lastKey: string | null = null;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const full = content;
  while ((match = regex.exec(full)) !== null) {
    if (lastKey) {
      sections[lastKey] = full.slice(lastIndex, match.index).trim();
    }
    lastKey = match[1].toLowerCase();
    lastIndex = match.index + match[0].length;
  }
  if (lastKey) {
    const nextH2 = full.slice(lastIndex).match(/\n##\s+/);
    const end = nextH2 ? lastIndex + nextH2.index! : full.length;
    sections[lastKey] = full.slice(lastIndex, end).trim();
  }
  const goal = sections.goal?.trim();
  const files = sections.files?.trim();
  const approach = sections.approach?.trim();
  const checkpoint = sections.checkpoint?.trim();
  if (!goal && !files && !approach && !checkpoint) return null;
  return {
    goal: goal ?? '',
    files: files ?? '',
    approach: approach ?? '',
    checkpoint: checkpoint ?? '',
  };
}

/**
 * Resolve the parent (tier-up) identifier for planning doc path.
 * Derived from TIER_CONTEXT_SOURCES: feature→feature name, phase→phase id, session→session id.
 */
function resolveParentIdentifier(
  ctx: TierStartWorkflowContext,
  parentTier: 'feature' | 'phase' | 'session'
): string {
  switch (parentTier) {
    case 'feature':
      return ctx.context.feature.name;
    case 'phase':
      return ctx.identifier.split('.').slice(0, 2).join('.');
    case 'session':
      return ctx.identifier.split('.').slice(0, 3).join('.');
    default:
      return '';
  }
}

/**
 * Read tier-up planning doc and return parsed Goal/Files/Approach/Checkpoint.
 * Tier-up source comes from TIER_CONTEXT_SOURCES[tier].guide (project, feature, phase, or session).
 * Used by getPlanningDocSlotDraft hooks so all four tiers can seed from their parent.
 */
export async function getTierUpPlanningDocSections(
  ctx: TierStartWorkflowContext
): Promise<ParsedPlanningSections | null> {
  const tier = ctx.config.name;
  const tierUpSource = TIER_CONTEXT_SOURCES[tier].guide;

  try {
    if (tierUpSource === 'project') {
      const content = await readProjectFile('.project-manager/PROJECT_PLAN.md');
      return parsePlanningDocSections(content);
    }
    const parentId = resolveParentIdentifier(ctx, tierUpSource as 'feature' | 'phase' | 'session');
    const content = await ctx.context.documents.readPlanningDoc(
      tierUpSource as PlanningTier,
      parentId
    );
    return parsePlanningDocSections(content);
  } catch {
    return null;
  }
}

/** Format a single context item as Insight + Proposal + Decision block (for chat output only). */
function formatContextItemBlock(q: ContextQuestion, index: number): string {
  const parts: string[] = [];
  parts.push(`### ${index + 1}. ${q.insight ? 'Insight / Proposal / Decision' : 'Question'}`);
  if (q.insight) {
    parts.push('**What the docs indicate:** ' + q.insight);
  }
  if (q.proposal) {
    parts.push('**Proposed path:** ' + q.proposal);
  }
  parts.push('**Decision needed:** ' + q.question);
  if (q.context) {
    parts.push('*' + q.context + '*');
  }
  if (q.options && q.options.length > 0) {
    parts.push('**Options:** ' + q.options.join(' | '));
  }
  return parts.join('\n\n');
}

const PARENT_ANALYSIS_EXCERPT_MAX = 400;

/** Extract ## Analysis body from a planning doc (parent session → task seeding). */
export function extractAnalysisSectionFromPlanningContent(content: string): string {
  const m = content.match(/## Analysis\s*\n([\s\S]*?)(?=\n##\s+|$)/i);
  if (!m) return '';
  return m[1].trim();
}

async function getParentPlanningDocAnalysisExcerpt(ctx: TierStartWorkflowContext): Promise<string | null> {
  if (ctx.config.name !== 'task') return null;
  const parentId = resolveParentIdentifier(ctx, 'session');
  try {
    const content = await ctx.context.documents.readPlanningDoc('session', parentId);
    const analysis = extractAnalysisSectionFromPlanningContent(content);
    if (!analysis) return null;
    const promptEcho = /^Address:\s*\n(?:-\s*[^\n]+\n?)+/i;
    const stripped = analysis.replace(promptEcho, '').trim();
    const body = stripped.length >= 20 ? stripped : analysis;
    if (body.length <= PARENT_ANALYSIS_EXCERPT_MAX) return body;
    return `${body.slice(0, PARENT_ANALYSIS_EXCERPT_MAX - 18)}… _(truncated)_`;
  } catch {
    return null;
  }
}

/** Context work brief shape passed into buildPlanningDocContent for pre-filling slots. */
interface PlanningDocContextWorkBrief {
  planningSummary: string;
  executionProposal: string;
  taskDesign?: {
    codingGoal: string;
    files: string[];
    pseudocodeSteps: string[];
    snippets: string;
    acceptanceChecks: string[];
  };
}

function buildDefinitionOfDone(tier: TierName): string {
  const universal = [
    '- [ ] App starts (`npm run start:dev`)',
    '- [ ] Lint passes (`cd client && npm run lint`, `cd server && npm run lint`)',
    '- [ ] Governance score maintained or improved',
  ];
  const tierSpecific: Record<TierName, string[]> = {
    feature: ['- [ ] All child phases complete', '- [ ] Feature guide and handoff updated'],
    phase: ['- [ ] All child sessions complete', '- [ ] Phase guide and handoff updated'],
    session: ['- [ ] All child tasks complete', '- [ ] Session log and handoff updated'],
    task: ['- [ ] Session guide task status updated'],
  };
  return ['## Definition of Done', '', ...universal, ...tierSpecific[tier], ''].join('\n');
}

function buildPlanningReferenceLines(referencePaths: ReferencePaths): string[] {
  const refLines: string[] = [
    `- TierUp guide (scope and intent): \`${referencePaths.tierUpGuide}\``,
  ];
  if (referencePaths.handoff) {
    refLines.push(`- Handoff (full transition context): \`${referencePaths.handoff}\``);
  }
  refLines.push(
    `- Architecture: \`.project-manager/ARCHITECTURE.md\` — domain map, data flow, type boundaries, naming`
  );
  refLines.push(
    `- Workflow friction log (non-git harness issues): \`.project-manager/WORKFLOW_FRICTION_LOG.md\``
  );
  refLines.push(
    `- Agent model preferences (harness advisory only; Cursor does not auto-switch models): \`.project-manager/agent-model-config.json\``
  );
  refLines.push(
    `- Governance reports: \`${referencePaths.auditReportsDir}\` — function-complexity, component-health, composable-health, type-escape, type-constant-inventory`
  );
  refLines.push(`- Playbooks: ${referencePaths.playbooks.map(p => `\`${p}\``).join(', ')}`);
  return refLines;
}

const ANALYSIS_PROMPT = `Address:
- What problem does this solve and why now?
- What domain boundaries does this cross? (see ARCHITECTURE.md)
- What existing patterns or code should child tiers follow?
- Risks, dependencies, or open questions?
- Alternatives considered (for decomposition tiers)`;

/** Tier-aware planning template: story/epic + analysis + slots + deliverables + decomposition + DoD + reference. */
function buildPlanningDocContent(
  ctx: TierStartWorkflowContext,
  continuity: string,
  governanceContractBlock: string,
  workProfileSection: string,
  referencePaths: ReferencePaths,
  tierDownBuildPlan?: string,
  slotDraft?: ParsedPlanningSections | null,
  tierGoals?: string,
  contextWorkBrief?: PlanningDocContextWorkBrief,
  inheritedOpenQuestionsSection?: string,
  architectureExcerpt?: string | null,
  parentAnalysisExcerpt?: string | null
): string {
  const tier = ctx.config.name;
  const title = ctx.resolvedDescription ?? ctx.resolvedId;
  const scopeLine = `- **Tier:** ${tier} | **ID:** ${ctx.resolvedId}`;
  const scopeDesc = (ctx.resolvedDescription ?? ctx.resolvedId).toString();
  const refLines = buildPlanningReferenceLines(referencePaths);
  refLines.push(
    '- **Workflow friction:** `.project-manager/WORKFLOW_FRICTION_LOG.md` — classified harness failures are auto-appended (see `HARNESS_WORKFLOW_FRICTION` in the tier playbook). Scan recent entries before changing tier routing: `npx tsx .cursor/commands/utils/read-workflow-friction.ts --last 20`'
  );

  let goalSection = PLACEHOLDER_REFINED;
  if (slotDraft?.goal?.trim()) {
    goalSection = slotDraft.goal.trim();
  } else if (contextWorkBrief?.planningSummary?.trim()) {
    goalSection = contextWorkBrief.planningSummary.trim();
    if (contextWorkBrief.executionProposal?.trim()) {
      goalSection += '\n\n' + contextWorkBrief.executionProposal.trim();
    }
  } else if (tierGoals?.trim()) {
    goalSection = tierGoals.trim();
  } else if (tier === 'task' && contextWorkBrief?.taskDesign?.codingGoal?.trim()) {
    goalSection = contextWorkBrief.taskDesign.codingGoal.trim();
  }

  let filesSection = PLACEHOLDER_REFINED;
  if (slotDraft?.files?.trim()) {
    filesSection = slotDraft.files.trim();
  } else if (tier === 'task' && contextWorkBrief?.taskDesign?.files?.length) {
    filesSection = contextWorkBrief.taskDesign.files.map(f => `- ${f}`).join('\n');
  }

  let approachSection = PLACEHOLDER_REFINED;
  if (slotDraft?.approach?.trim()) {
    approachSection = slotDraft.approach.trim();
  } else if (contextWorkBrief?.executionProposal?.trim()) {
    approachSection = contextWorkBrief.executionProposal.trim();
  } else if (tier === 'task' && contextWorkBrief?.taskDesign?.pseudocodeSteps?.length) {
    approachSection = contextWorkBrief.taskDesign.pseudocodeSteps
      .map((s, i) => `${i + 1}. ${s}`)
      .join('\n');
  }

  let checkpointSection = PLACEHOLDER_REFINED;
  if (slotDraft?.checkpoint?.trim()) {
    checkpointSection = slotDraft.checkpoint.trim();
  } else if (tier === 'task' && contextWorkBrief?.taskDesign?.acceptanceChecks?.length) {
    checkpointSection = contextWorkBrief.taskDesign.acceptanceChecks.map(c => `- ${c}`).join('\n');
  }

  const tierDownBody =
    tier === 'task'
      ? ''
      : hasParserFriendlyTierDownBullets(tierDownBuildPlan)
        ? (tierDownBuildPlan?.trim() ?? '')
        : getTierDownBulletPlaceholder(tier, ctx.identifier);
  const decompositionSection =
    tier === 'task' ? '' : `\n## Decomposition\n${tierDownBody}\n`;

  const inheritedBlock =
    inheritedOpenQuestionsSection != null && inheritedOpenQuestionsSection.trim().length > 0
      ? `${inheritedOpenQuestionsSection.trim()}\n\n`
      : '';

  const dod = buildDefinitionOfDone(tier);
  const refBlock = `---\n## Reference (read before filling — governance and inventory compliance is required)\n${refLines.join('\n')}`;
  const architectureExcerptBlock =
    architectureExcerpt != null && architectureExcerpt.trim() !== ''
      ? `---\n## Architecture context (harness-injected)\n\n${architectureExcerpt.trim()}\n\n`
      : '';
  const parentContextBlock =
    tier === 'task' && parentAnalysisExcerpt != null && parentAnalysisExcerpt.trim() !== ''
      ? `## Parent context (session planning — Analysis excerpt)\n\n${parentAnalysisExcerpt.trim()}\n\n`
      : '';

  if (tier === 'task') {
    return `# Plan: ${tier} ${ctx.resolvedId} — ${title}

## Contract
${scopeLine}
- **Scope:** ${scopeDesc}
${governanceContractBlock}
${workProfileSection}
## Where we left off
${continuity}

${parentContextBlock}${inheritedBlock}## Story
**This task changes** [what] **because** [why].

${architectureExcerptBlock}## Analysis
${ANALYSIS_PROMPT}

## Design
[Describe what changes and why]

## Goal
${goalSection}

## Files
${filesSection}

## Approach
${approachSection}

## Checkpoint
${checkpointSection}

## Deliverables
[List concrete deliverables]

## Acceptance Criteria
[Define acceptance criteria]

${dod}
${refBlock}
`;
  }

  if (tier === 'session') {
    return `# Plan: ${tier} ${ctx.resolvedId} — ${title}

## Contract
${scopeLine}
- **Scope:** ${scopeDesc}
${governanceContractBlock}
${workProfileSection}
## Where we left off
${continuity}

${inheritedBlock}## Story
**This session delivers** [what] **so that** [why / what it unblocks].
**Estimated size:** S / M

${architectureExcerptBlock}## Analysis
${ANALYSIS_PROMPT}

## Goal
${goalSection}

## Files
${filesSection}

## Approach
${approachSection}

## Checkpoint
${checkpointSection}

## Deliverables
[List concrete deliverables]
${decompositionSection}
${dod}
${refBlock}
`;
  }

  if (tier === 'phase') {
    return `# Plan: ${tier} ${ctx.resolvedId} — ${title}

## Contract
${scopeLine}
- **Scope:** ${scopeDesc}
${governanceContractBlock}
${workProfileSection}
## Where we left off
${continuity}

${inheritedBlock}## Story
**As a** [persona or system], **I want** [what this phase delivers], **so that** [what it enables].
**Estimated size:** S / M / L

${architectureExcerptBlock}## Analysis
${ANALYSIS_PROMPT}

## Goal
${goalSection}

## Files
${filesSection}

## Approach
${approachSection}

## Checkpoint
${checkpointSection}

## Deliverables
[List concrete deliverables]

## Acceptance Criteria
- [ ] [Per-phase criterion]
${decompositionSection}
${dod}
${refBlock}
`;
  }

  // feature
  return `# Plan: ${tier} ${ctx.resolvedId} — ${title}

## Contract
${scopeLine}
- **Scope:** ${scopeDesc}
${governanceContractBlock}
${workProfileSection}
## Where we left off
${continuity}

${inheritedBlock}## Epic
**As a** [persona], **I want** [capability], **so that** [benefit].
**Estimated size:** S / M / L / XL

${architectureExcerptBlock}## Analysis
${ANALYSIS_PROMPT}

## Goal
${goalSection}

## Files
${filesSection}

## Approach
${approachSection}

## Checkpoint
${checkpointSection}

## Deliverables
[List concrete deliverables]

## Acceptance Criteria
- [ ] [High-level criterion]
${decompositionSection}
${dod}
${refBlock}
`;
}

/**
 * Context gathering: plan-mode only. Writes short planning doc (contract + continuity + 4 slots + reference links),
 * sets ctx.planningDocPath, and returns early exit with reasonCode context_gathering.
 * When mode is execute (e.g. from /accepted-plan for feature/phase/session or /accepted-code for task), this step is skipped.
 */
export async function stepContextGathering(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<StepExitResult> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (!isPlanMode(executionMode)) return null;
  if (!hooks.getContextQuestions) return null;

  const tier = ctx.config.name;
  const gateProfile = ctx.options?.workProfile?.gateProfile;
  const questions = await hooks.getContextQuestions(ctx);

  if (tier === 'task' && gateProfile === 'express') {
    const planningDocPathEarly = getPlanningDocPath(ctx);
    ctx.planningDocPath = planningDocPathEarly;
    const qblocks =
      questions.length > 0
        ? questions.map((q, i) => formatContextItemBlock(q, i))
        : ['*(No context questions — use session guide and handoff for scope.)*'];
    const deliverables = [
      `**Express profile:** Planning doc gate skipped for task \`${ctx.identifier}\`.`,
      '',
      'When ready, **the user** runs **/accepted-code** to continue in execute mode (no planning doc required).',
      '',
      ...qblocks,
    ].join('\n\n');
    return {
      success: true,
      output: ctx.output.join('\n\n'),
      outcome: {
        status: 'plan',
        reasonCode: 'context_gathering',
        nextAction:
          'Express profile: discuss scope in chat if needed; **the user** runs **/accepted-code** without filling a planning doc.',
        deliverables,
      },
    };
  }

  if (!questions.length) return null;
  const readResult = ctx.readResult;
  const handoffRaw = readResult?.handoff ?? '';
  const guideFallbackExcerpt =
    readResult?.guide?.trim() && readResult.guide.length > 0
      ? readResult.guide.trim().slice(0, 3000)
      : undefined;
  const continuity = buildContinuitySummary(handoffRaw, undefined, tier, guideFallbackExcerpt);

  const taskFiles = hooks.getTierDownFilePaths
    ? await hooks.getTierDownFilePaths(ctx)
    : undefined;
  const workProfileForAdvisory =
    ctx.options?.workProfile ?? classifyWorkProfile({ tier: ctx.config.name, action: 'start' });
  const advisory = await buildTierAdvisoryContext({
    tier: ctx.config.name,
    workProfile: workProfileForAdvisory,
    taskFiles,
    projectRoot: PROJECT_ROOT,
  });
  const governanceContractBlock = advisory.governanceContractBlock;
  const referencePaths = buildReferencePaths(tier, ctx.identifier, ctx.context);
  const parentAnalysisExcerpt = await getParentPlanningDocAnalysisExcerpt(ctx);

  const tierDownBuildPlan = hooks.getTierDownBuildPlan ? await hooks.getTierDownBuildPlan(ctx) : undefined;
  const contextWorkBrief = hooks.getContextWorkBrief
    ? await hooks.getContextWorkBrief(ctx)
    : undefined;
  const tierGoals = hooks.getTierGoals ? await hooks.getTierGoals(ctx) : undefined;
  const slotDraft = hooks.getPlanningDocSlotDraft ? await hooks.getPlanningDocSlotDraft(ctx) : undefined;

  const inheritedOpenQuestions = readResult?.inheritedOpenQuestions ?? [];
  const sourceTierName =
    TIER_CONTEXT_SOURCES[tier].guide === 'project' ? 'project' : TIER_CONTEXT_SOURCES[tier].guide;
  const inheritedPlanningSection =
    inheritedOpenQuestions.length > 0
      ? formatInheritedQuestionsPlanningDocSection(inheritedOpenQuestions, sourceTierName, ctx.identifier)
      : '';

  if (inheritedOpenQuestions.length > 0) {
    ctx.output.push(formatOpenQuestionsWarning(inheritedOpenQuestions, sourceTierName, ctx.identifier));
  }

  const planningDocPath = getPlanningDocPath(ctx);
  const planningTier = tier as PlanningTier;
  let existingContent: string | null = null;
  if (await ctx.context.documents.planningDocExists(planningTier, ctx.identifier)) {
    try {
      existingContent = await ctx.context.documents.readPlanningDoc(planningTier, ctx.identifier);
    } catch {
      /* exists but unreadable — treat as missing for rewrite path */
      existingContent = null;
    }
  }
  let contentForSubstantiveCheck = existingContent;
  if (existingContent !== null && isPlanningDocFilled(existingContent)) {
    ctx.planningDocPath = planningDocPath;
    /* Skip write so re-running tier-start in plan mode does not overwrite the agent's filled doc. */
  } else {
    const content = buildPlanningDocContent(
      ctx,
      continuity,
      governanceContractBlock,
      advisory.workProfileSection,
      referencePaths,
      tierDownBuildPlan,
      slotDraft ?? null,
      tierGoals,
      contextWorkBrief,
      inheritedPlanningSection,
      advisory.architectureExcerpt,
      parentAnalysisExcerpt
    );
    await ctx.context.documents.writePlanningDoc(planningTier, ctx.identifier, content);
    ctx.planningDocPath = planningDocPath;
    contentForSubstantiveCheck = content;
  }

  const substantiveOk =
    contentForSubstantiveCheck != null && isPlanningDocSubstantive(contentForSubstantiveCheck, tier);
  const substantiveWarning =
    !substantiveOk && tier !== 'task'
      ? '\n\n**Warning (advisory):** Analysis section appears thin — expand risks, domain boundaries (ARCHITECTURE.md), and existing patterns before proceeding.\n'
      : '';

  const isTask = tier === 'task';
  const agentDirective = isTask
    ? [
        '## AGENT DIRECTIVE (execute now — do not delegate to the user as “homework”)',
        '',
        '1. **Open** the planning file and read every path under **Reference** (ARCHITECTURE.md, playbooks, governance reports, tier-up guide).',
        '2. **Write** into that same file: **Story**, **Analysis**, **Design**, **Deliverables**, **Acceptance Criteria**; refine **Goal** / **Files** / **Approach** / **Checkpoint** if needed.',
        '3. **Save** the planning doc.',
        '4. **Summarize** the locked plan in chat for the user.',
        '5. **Do not** paste only these instructions — you perform steps 1–4, then tell the user when to run **/accepted-code**.',
      ].join('\n')
    : [
        '## AGENT DIRECTIVE (execute now — do not delegate to the user as “homework”)',
        '',
        '1. **Open** the planning file and read every path under **Reference**.',
        '2. **Write** Analysis, story/epic, Goal, Files, Approach, Checkpoint, Deliverables, Acceptance Criteria, and **## Decomposition** (or `**Leaf tier**`).',
        '3. **Save** the planning doc.',
        '4. **Perform** the coverage check in chat, then tell the user when to run **/accepted-plan**.',
        '5. **Do not** paste only these instructions — you perform the work, then present the result.',
      ].join('\n');

  const messageLines: string[] = [];

  if (inheritedOpenQuestions.length > 0) {
    messageLines.push(
      '**Inherited open questions** from the parent guide are copied into the planning doc. Synthesize each into Goal / Approach / Checkpoint / tierDown (or mark deferral); this is **not** blocked on `/resolve-question`.',
      ''
    );
  }

  messageLines.push('**Context for filling slots:**');
  if (tierGoals?.trim()) {
    messageLines.push(tierGoals.trim(), '');
  }
  if (tierDownBuildPlan?.trim()) {
    messageLines.push(tierDownBuildPlan.trim(), '');
  }
  if (contextWorkBrief?.planningSummary?.trim()) {
    messageLines.push(contextWorkBrief.planningSummary.trim(), '');
  }
  if (contextWorkBrief?.executionProposal?.trim()) {
    messageLines.push(contextWorkBrief.executionProposal.trim(), '');
  }
  messageLines.push('**From the docs (discuss before locking):**', '');
  messageLines.push(
    ...questions.map((q, i) => formatContextItemBlock(q, i)),
    '',
  );

  if (!isTask) {
    messageLines.push(
      '**Coverage check (required before telling the user to proceed):**',
      'After filling all sections, re-read **Goal** / **Approach** and **## Decomposition**. Answer in chat: *If this is the goal, have we outlined enough steps to enact it?* If gaps exist, update Decomposition first; if covered, state that explicitly.',
      '',
      'When ready, **the user** runs **/accepted-plan**.',
      ''
    );
  } else {
    messageLines.push('When ready, **the user** runs **/accepted-code**.', '');
  }

  const contextSection = [
    `Planning document: \`${planningDocPath}\``,
    '',
    ...messageLines,
  ].join('\n');

  const deliverables =
    substantiveWarning + agentDirective + '\n\n---\n\n## CONTEXT (reference for filling)\n\n' + contextSection;

  const nextAction = isTask
    ? 'Context gathering: **you** read references and **fill the planning doc now**; save it; summarize in chat; then **the user** runs **/accepted-code**. Do not invoke that slash command yourself.'
    : 'Context gathering: **you** read references and **fill the planning doc now**; coverage check in chat; then **the user** runs **/accepted-plan**. Do not invoke that slash command yourself.';

  const decompositionBody =
    contentForSubstantiveCheck != null ? extractDecompositionSection(contentForSubstantiveCheck) : '';
  const leafTier = LEAF_TIER_MARKER.test(decompositionBody);

  return {
    success: true,
    output: ctx.output.join('\n\n'),
    outcome: {
      status: 'plan',
      reasonCode: 'context_gathering',
      nextAction,
      deliverables,
      ...(leafTier ? { leafTier: true } : {}),
    },
  };
}

/** Tier-specific extras (e.g. feature load, server refresh) — optional. */
export async function stepRunExtras(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  if (!hooks.runExtras) return;
  const extra = await hooks.runExtras(ctx);
  if (extra) ctx.output.push(extra);
}

/**
 * Spawn start audit in the background (fire-and-forget).
 * The background runner executes npm audit scripts, computes governance scores,
 * and appends a "start" entry to the baseline log (.audit-baseline-log.jsonl).
 * Nothing in the tier-start pipeline blocks on or reads the audit results.
 * Tier-end queries the baseline log for the matching tier-stamp to compute deltas.
 */
export async function stepStartAudit(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<StepExitResult> {
  if (hooks.runStartAudit === false) return null;

  try {
    const tier = (ctx.context.tier ?? ctx.config.name) as AuditTier;
    const id = ctx.context.identifier ?? '';
    const tierStamp = buildTierStampFromId(ctx.context.feature.name, tier, id);

    const runnerPath = join(
      process.cwd(),
      '.cursor',
      'commands',
      'audit',
      'background-audit-runner.ts'
    );

    const args: Record<string, string> = {
      tier: ctx.config.name,
      identifier: ctx.identifier,
      featureName: ctx.context.feature.name,
      tierStamp,
    };

    const child = spawn('npx', ['tsx', runnerPath, JSON.stringify(args)], {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    ctx.output.push(
      `**Start audit:** spawned in background (tier-stamp: ${tierStamp}). Baseline will be recorded for tier-end comparison.`
    );
  } catch (err) {
    ctx.output.push(
      `**Start audit skipped** (non-blocking): ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return null;
}

/** Run tier plan and append output. */
export async function stepRunTierPlan(
  ctx: TierStartWorkflowContext,
  _hooks: TierStartWorkflowHooks
): Promise<void> {
  const featureName = ctx.context.feature.name;
  // Do not pass readResult.guide as planContent: that is tierUp context from readContext, not user-authored
  // plan markdown. planPhaseImpl/planSessionImpl treat truthy planContent as "overwrite guide with this body"
  // and would clobber filled guides or trigger the project-manager write guard.
  const planOutput = await runTierPlan(
    ctx.config,
    ctx.resolvedId,
    ctx.resolvedDescription,
    featureName,
    undefined
  );
  ctx.output.push(planOutput);
}

/** Build cascade and nextAction from hooks. */
export async function stepBuildStartCascade(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<{ cascade?: CascadeInfo; nextAction: string }> {
  let cascade: CascadeInfo | undefined;
  if (hooks.getFirstTierDownId) {
    const firstTierDownId = await hooks.getFirstTierDownId(ctx);
    if (firstTierDownId) {
      cascade = buildCascadeDown(ctx.config.name, firstTierDownId) ?? undefined;
    }
  }
  const nextAction =
    hooks.getCompactPrompt?.(ctx) ??
    `Proceed with ${ctx.config.name} "${ctx.resolvedId}" using the plan above.`;
  return { cascade, nextAction };
}

