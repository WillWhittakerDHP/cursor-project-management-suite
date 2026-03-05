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
} from './tier-start-workflow-types';
import type { TierStartResult, CascadeInfo } from '../../utils/tier-outcome';
import type { CannotStartTier } from '../../utils/tier-start-utils';
import { formatBranchHierarchy, formatCannotStart } from '../../utils/tier-start-utils';
import { isAutoCommittable } from '../../git/shared/tier-branch-manager';
import { resolveCommandExecutionMode, isPlanMode } from '../../utils/command-execution-mode';
import { runTierPlan } from './tier-plan';
import { buildCascadeDown } from '../../utils/tier-cascade';
import { spawn } from 'child_process';
import { join } from 'path';
import { readTierScope } from '../../utils/tier-scope';
import { buildTierStamp } from '../../audit/baseline-log';
import { buildGovernanceContext } from '../../audit/governance-context';
import { buildContinuitySummary, buildReferencePaths, type ReferencePaths } from './context-policy';
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
import { readProjectFile, writeProjectFile, PROJECT_ROOT } from '../../utils/utils';
import { existsSync } from 'fs';

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
  for (const msg of branchResult.messages) {
    ctx.output.push(msg);
  }
  if (!branchResult.success) {
    if (branchResult.blockedByUncommitted) {
      // Playbook: block only on files we do not auto-commit (.cursor and .project-manager are auto-committed).
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
      // Only workflow artifacts (.cursor, .project-manager) changed; auto-committed or excluded. Continue.
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

/** Extract content of "## How we build the tierDown to achieve them" section (up to next ## or end). */
function extractTierDownBuildPlanSection(content: string): string {
  const match = content.match(/\n##\s+How we build the tierDown to achieve them\s*[\r\n]+([\s\S]*?)(?=\n##\s+|$)/i);
  return match ? match[1].trim() : '';
}

/**
 * Parse per-tierDown items from the build plan section. Matches lines like
 * "- **Session 6.5.2:** Availability Bypass..." or "- **Task 6.5.1.2:** Wizard mode...".
 */
function parseTierDownBuildPlanPerItem(
  buildPlanContent: string,
  tierDownKind: 'phase' | 'session' | 'task'
): TierDownPlanItem[] {
  if (!buildPlanContent.trim()) return [];
  const items: TierDownPlanItem[] = [];
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
 * When the guide is missing and parsedItems is non-empty, create the guide from the plan (instead of bailing).
 * Session: never overwrite an existing guide file; when creating, merge task list from phase guide so we don't lose tasks.
 * No-op if planning doc missing or no tierDown section. Execute mode only; called before stepEnsureTierDownDocs.
 */
async function syncPlannedTierDownToGuide(ctx: TierStartWorkflowContext): Promise<void> {
  const tier = ctx.config.name;
  if (tier === 'task') return;
  const planningPath = getPlanningDocPath(ctx);
  let planningContent: string;
  try {
    planningContent = await readProjectFile(planningPath);
  } catch {
    return;
  }
  const sectionContent = extractTierDownBuildPlanSection(planningContent);
  const tierDownKind = tier === 'feature' ? 'phase' : tier === 'phase' ? 'session' : 'task';
  const parsedItems = parseTierDownBuildPlanPerItem(sectionContent, tierDownKind);
  ctx.tierDownPlanItems = parsedItems.length > 0 ? parsedItems : undefined;

  let guidePath: string;
  if (tier === 'feature') guidePath = ctx.context.paths.getFeatureGuidePath();
  else if (tier === 'phase') guidePath = ctx.context.paths.getPhaseGuidePath(ctx.identifier);
  else guidePath = ctx.context.paths.getSessionGuidePath(ctx.identifier);

  let guideContent: string;
  try {
    guideContent = await readProjectFile(guidePath);
  } catch {
    if (tier === 'session') {
      const fullPath = join(PROJECT_ROOT, guidePath);
      if (existsSync(fullPath)) {
        try {
          guideContent = await readProjectFile(guidePath);
        } catch (e) {
          console.warn(
            'syncPlannedTierDownToGuide: session guide exists but unreadable, skipping overwrite',
            guidePath,
            e
          );
          return;
        }
      } else {
        let phaseGuideContent = '';
        try {
          const phaseId = ctx.identifier.split('.').slice(0, 2).join('.');
          phaseGuideContent = await readProjectFile(ctx.context.paths.getPhaseGuidePath(phaseId));
        } catch {
          /* optional */
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
        try {
          await writeProjectFile(guidePath, guideContent);
        } catch {
          return;
        }
      }
    } else {
      if (parsedItems.length === 0) return;
      const description = ctx.resolvedDescription ?? ctx.identifier;
      guideContent = buildGuideFromPlanItems(tier, ctx.identifier, description, parsedItems);
      try {
        await writeProjectFile(guidePath, guideContent);
      } catch {
        return;
      }
    }
  }

  // Fix 4: When planning doc had no parseable bullets, derive tierDown list from existing guide.
  let itemsToAppend = parsedItems;
  if (parsedItems.length === 0 && guideContent) {
    const fromGuide = deriveTierDownPlanItemsFromGuide(guideContent, tier);
    if (fromGuide.length > 0) {
      ctx.tierDownPlanItems = fromGuide;
      itemsToAppend = fromGuide;
    }
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
    try {
      await writeProjectFile(guidePath, updated);
    } catch {
      // non-blocking
    }
  }
}

/** Sync planned tierDown from planning doc into guide (headings + ctx.tierDownPlanItems). Execute mode only; run before stepEnsureTierDownDocs. */
export async function stepSyncPlannedTierDownToGuide(
  ctx: TierStartWorkflowContext,
  _hooks: TierStartWorkflowHooks
): Promise<void> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (isPlanMode(executionMode)) return;
  if (ctx.config.name === 'task') return;
  await syncPlannedTierDownToGuide(ctx);
}

/** Ensure tierDown docs exist (enumerate from guide, append sections, create tierDown guide/log). Execute mode only. */
export async function stepEnsureTierDownDocs(
  ctx: TierStartWorkflowContext,
  _hooks: TierStartWorkflowHooks
): Promise<void> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (isPlanMode(executionMode)) return;
  await runEnsureTierDownDocsForTier(ctx);
}

/**
 * Single "ensure guide from plan" step: sync plan → current-tier guide (create or append only, never overwrite),
 * then ensure child tierDown docs exist. Replaces the previous sequence of stepSyncPlannedTierDownToGuide,
 * stepEnsureTierDownDocs, and stepSyncGuideFromPlanningDoc so the guide is generated once and only filled afterward.
 */
export async function stepEnsureGuideFromPlan(
  ctx: TierStartWorkflowContext,
  _hooks: TierStartWorkflowHooks
): Promise<void> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (isPlanMode(executionMode)) return;
  if (ctx.config.name === 'task') return;
  await syncPlannedTierDownToGuide(ctx);
  await runEnsureTierDownDocsForTier(ctx);
}

/** Legacy: ensure child docs. Execute mode only. No hook on interface; step is no-op. Use stepEnsureTierDownDocs instead. */
export async function stepEnsureChildDocs(
  ctx: TierStartWorkflowContext,
  _hooks: TierStartWorkflowHooks
): Promise<void> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (isPlanMode(executionMode)) return;
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
  if (isPlanMode(executionMode)) return;
  if (ctx.config.name === 'task') return;
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

/** Fix 2: Regex for one parser-friendly bullet line (parseTierDownBuildPlanPerItem expects - **Session X.Y.Z:** or - **Phase X.Y:** or - **Task X.Y.Z.N:**). */
const PARSER_FRIENDLY_TIERDOWN_LINE = /-\s+\*\*(?:Session|Phase|Task)\s+\d[\d.]*\*\*:/;

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

/**
 * Returns true if the guide has been filled (no placeholder text in tierDown blocks).
 * Used by /accepted-proceed for Gate 2 when state is guide_fill_pending.
 */
export async function isGuideFilled(
  guidePath: string,
  tier: 'feature' | 'phase' | 'session'
): Promise<boolean> {
  if (tier === 'feature') return true; // feature has no "fill guide" gate in Option A
  let content: string;
  try {
    content = await readProjectFile(guidePath);
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

/**
 * Returns false if the planning doc content still contains placeholders (doc not filled).
 * Used by acceptedProceed and acceptedCode to block proceeding until the agent fills the doc.
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
  return true;
}

/**
 * Build planning doc path from tier, identifier, and base path.
 * Used by acceptedProceed and acceptedCode to locate the doc when validating before proceed/execute.
 * All tiers (feature, phase, session, task) use the same planning-doc fill check.
 */
export function getPlanningDocPathForTier(
  tier: 'feature' | 'phase' | 'session' | 'task',
  identifier: string,
  basePath: string
): string {
  if (tier === 'feature') {
    return `${basePath}/feature-planning.md`;
  }
  if (tier === 'phase') {
    return `${basePath}/phases/phase-${identifier}-planning.md`;
  }
  if (tier === 'task') {
    return `${basePath}/sessions/task-${identifier}-planning.md`;
  }
  return `${basePath}/sessions/session-${identifier}-planning.md`;
}

/** Build planning doc path for task or session (sessions dir). */
function getPlanningDocPath(ctx: TierStartWorkflowContext): string {
  const base = ctx.context.paths.getBasePath();
  const tier = ctx.config.name;
  const id = ctx.identifier;
  if (tier === 'feature') {
    return `${base}/feature-planning.md`;
  }
  if (tier === 'phase') {
    return `${base}/phases/phase-${id}-planning.md`;
  }
  if (tier === 'task') {
    return `${base}/sessions/task-${id}-planning.md`;
  }
  return `${base}/sessions/session-${id}-planning.md`;
}

/** Parsed sections from a session/phase planning doc (Goal, Files, Approach, Checkpoint = todos). */
export interface ParsedPlanningSections {
  goal: string;
  files: string;
  approach: string;
  checkpoint: string;
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

/** Extract a one-liner from governance context for the short planning doc Contract section. */
function buildGovernanceOneLiner(governanceContext: string): string {
  const lines = (governanceContext || '').split('\n');
  const findings = lines
    .map(line => line.trim())
    .filter(line =>
      line.length > 0 &&
      (line.includes('P0') || line.includes('P1') || line.includes('violations') || line.includes('hotspot'))
    )
    .slice(0, 6);
  if (findings.length === 0) return 'Clean — no violations detected';
  return `${findings.length} governance highlights — read reports before filling slots`;
}

/** Build short planning doc markdown: contract + continuity + 4 slots + tierDown section (when applicable) + reference links. */
function buildPlanningDocContent(
  ctx: TierStartWorkflowContext,
  continuity: string,
  governanceOneLiner: string,
  referencePaths: ReferencePaths,
  tierDownBuildPlan?: string
): string {
  const tier = ctx.config.name;
  const title = ctx.resolvedDescription ?? ctx.resolvedId;
  const scopeLine = `- **Tier:** ${tier} | **ID:** ${ctx.resolvedId}`;
  const scopeDesc = (ctx.resolvedDescription ?? ctx.resolvedId).toString();
  const refLines: string[] = [
    `- TierUp guide (scope and intent): \`${referencePaths.tierUpGuide}\``,
  ];
  if (referencePaths.handoff) {
    refLines.push(`- Handoff (full transition context): \`${referencePaths.handoff}\``);
  }
  refLines.push(
    `- Governance reports: \`${referencePaths.auditReportsDir}\` — check function-complexity, component-health, composable-health, type-escape, type-constant-inventory`
  );
  refLines.push(`- Playbooks: ${referencePaths.playbooks.map(p => `\`${p}\``).join(', ')}`);

  // Fix 2: Never seed prose; use hook output only when it has at least one parser-friendly bullet, else tier-aware placeholder.
  const tierDownBody =
    tier === 'task'
      ? ''
      : hasParserFriendlyTierDownBullets(tierDownBuildPlan)
        ? (tierDownBuildPlan?.trim() ?? '')
        : getTierDownBulletPlaceholder(tier, ctx.identifier);
  const tierDownSection =
    tier === 'task' ? '' : `\n## How we build the tierDown to achieve them\n${tierDownBody}\n`;

  return `# Plan: ${tier} ${ctx.resolvedId} — ${title}

## Contract
${scopeLine}
- **Scope:** ${scopeDesc}
- **Governance:** ${governanceOneLiner}

## Where we left off
${continuity}

## Goal
[To be refined during discussion]

## Files
[To be refined during discussion]

## Approach
[To be refined during discussion]

## Checkpoint
[To be refined during discussion]
${tierDownSection}---
## Reference (read before filling slots — governance and inventory compliance is required)
${refLines.join('\n')}
`;
}

/**
 * Context gathering: plan-mode only. Writes short planning doc (contract + continuity + 4 slots + reference links),
 * sets ctx.planningDocPath, and returns early exit with reasonCode context_gathering.
 * When mode is execute (e.g. from /accepted-proceed), this step is skipped.
 */
export async function stepContextGathering(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<StepExitResult> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (!isPlanMode(executionMode)) return null;
  if (!hooks.getContextQuestions) return null;

  const questions = await hooks.getContextQuestions(ctx);
  if (!questions.length) return null;

  const tier = ctx.config.name;
  const readResult = ctx.readResult;
  const handoffRaw = readResult?.handoff ?? '';
  const continuity = buildContinuitySummary(handoffRaw, undefined, tier);

  const taskFiles = hooks.getTierDownFilePaths
    ? await hooks.getTierDownFilePaths(ctx)
    : undefined;
  const governanceContext = await buildGovernanceContext({
    tier: ctx.config.name,
    taskFiles,
  });
  const governanceOneLiner = buildGovernanceOneLiner(governanceContext);
  const referencePaths = buildReferencePaths(tier, ctx.identifier, ctx.context);

  const tierDownBuildPlan = hooks.getTierDownBuildPlan ? await hooks.getTierDownBuildPlan(ctx) : undefined;
  const planningDocPath = getPlanningDocPath(ctx);
  const content = buildPlanningDocContent(ctx, continuity, governanceOneLiner, referencePaths, tierDownBuildPlan);
  await writeProjectFile(planningDocPath, content);
  ctx.planningDocPath = planningDocPath;

  const contextWorkBrief = hooks.getContextWorkBrief
    ? await hooks.getContextWorkBrief(ctx)
    : undefined;
  const tierGoals = hooks.getTierGoals ? await hooks.getTierGoals(ctx) : undefined;

  const messageLines: string[] = [
    `Planning document created: \`${planningDocPath}\``,
    '',
    '**REQUIRED before /accepted-proceed (Step 1 — Light collection):**',
    '1. Read the Reference section links in the planning doc — governance reports, inventory audits, and playbooks define the patterns and standards you must follow.',
    '2. Fill ## Goal, ## Files, ## Approach, ## Checkpoint, and ## How we build the tierDown with concrete content.',
    '3. The ## How we build the tierDown section must be one line per phase/session/task in the format `- **Session X.Y.Z:** short name` (no paragraphs).',
    '4. Save the file.',
    '',
    '**Context for filling slots:**',
  ];
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
    'When ready, run /accepted-proceed.',
  );
  const deliverables = messageLines.join('\n\n');

  return {
    success: true,
    output: ctx.output.join('\n\n'),
    outcome: {
      status: 'plan',
      reasonCode: 'context_gathering',
      nextAction: 'Context gathering: you MUST fill the planning doc (Goal, Files, Approach, Checkpoint, and How we build the tierDown) then run /accepted-proceed; /accepted-proceed is blocked until the doc is filled.',
      deliverables,
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
    const scope = await readTierScope();
    const tierStamp = buildTierStamp({
      feature: scope.feature?.id ?? ctx.context.feature.name,
      phase: scope.phase?.id ?? null,
      session: scope.session?.id ?? null,
      task: scope.task?.id ?? null,
    });

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
  const planOutput = await runTierPlan(
    ctx.config,
    ctx.resolvedId,
    ctx.resolvedDescription,
    featureName,
    ctx.readResult?.guide
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

