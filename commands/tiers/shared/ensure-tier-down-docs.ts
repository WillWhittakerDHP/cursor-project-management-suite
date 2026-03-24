/**
 * Tier-generic ensure tierDown docs: enumerate all direct tierDown, append missing sections
 * in the current-tier guide, and create tierDown doc files where applicable. Used by
 * stepEnsureTierDownDocs for all tiers (lowest tier is no-op). Language:
 * tierUp/tierDown/tierAcross only; no parent/child or concrete tier names in generic prose.
 *
 * Guide reads/writes go through DocumentManager only. Errors propagate (no warn-and-continue).
 */

import type { TierStartWorkflowContext, TierDownPlanItem } from './tier-start-workflow-types';
import type { TierConfig } from './types';
import type { WorkflowCommandContext } from '../../utils/command-context';
import { writeProjectFile } from '../../utils/utils';
import { derivePhaseDescription } from '../../planning/utils/resolve-planning-description';
import { ensureGuideHasRequiredSections } from './guide-required-sections';
import { getConfigForTier } from '../configs';

// --- Enumerate tierDown IDs from current-tier guide content ---

const PHASE_ID_IN_FEATURE_GUIDE = /(?:^|\n)(?:###\s+)?Phase\s+(\d+\.\d+)[\s:]/gi;
const SESSION_ID_IN_PHASE_GUIDE = /(?:^|\n)(?:-\s*\[\s*x?\s*\]\s*)?###\s+Session\s+(\d+\.\d+\.\d+)[\s:]/gi;
const TASK_ID_IN_SESSION_GUIDE = /(?:^|\n)(?:-\s*\[\s*x?\s*\]\s*)?(?:####|###)\s+Task\s+(\d+\.\d+\.\d+\.\d+)[\s:]/gi;

function enumeratePhaseIdsFromFeatureGuide(content: string): string[] {
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  PHASE_ID_IN_FEATURE_GUIDE.lastIndex = 0;
  while ((m = PHASE_ID_IN_FEATURE_GUIDE.exec(content)) !== null) {
    const id = m[1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function enumerateSessionIdsFromPhaseGuide(content: string): string[] {
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  SESSION_ID_IN_PHASE_GUIDE.lastIndex = 0;
  while ((m = SESSION_ID_IN_PHASE_GUIDE.exec(content)) !== null) {
    const id = m[1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function enumerateTaskIdsForSession(
  phaseGuideContent: string,
  sessionGuideContent: string | null,
  sessionId: string
): string[] {
  const escaped = sessionId.replace(/\./g, '\\.');
  const sessionBlockRegex = new RegExp(
    `###\\s+Session\\s+${escaped}[\\s:\\S]*?(?=\\n###\\s+Session|\\n##\\s+|$)`,
    'i'
  );
  const sessionBlock = phaseGuideContent.match(sessionBlockRegex)?.[0] ?? '';
  const taskListMatch = sessionBlock.match(/\*\*Tasks:\*\*\s*([\s\S]*?)(?=\n\*\*|\n\n|$)/i);
  const taskList = taskListMatch?.[1]?.trim() ?? '';
  const fromPhase: string[] = [];
  if (taskList) {
    const bulletOrNum = /(?:^|\n)\s*[-*]?\s*(\d+\.\d+\.\d+\.\d+)/g;
    let tm: RegExpExecArray | null;
    while ((tm = bulletOrNum.exec(taskList)) !== null) {
      const tid = tm[1];
      if (tid && !fromPhase.includes(tid)) fromPhase.push(tid);
    }
  }
  if (fromPhase.length > 0) return fromPhase;
  if (sessionGuideContent) {
    const fromGuide: string[] = [];
    let tm: RegExpExecArray | null;
    TASK_ID_IN_SESSION_GUIDE.lastIndex = 0;
    while ((tm = TASK_ID_IN_SESSION_GUIDE.exec(sessionGuideContent)) !== null) {
      const id = tm[1];
      if (id && !fromGuide.includes(id)) fromGuide.push(id);
    }
    if (fromGuide.length > 0) return fromGuide;
  }
  return [`${sessionId}.1`];
}

// --- Fix 4: Derive tierDown plan items from guide content (for execute-time fallback when planning doc has no bullets) ---

const PHASE_ID_NAME_IN_FEATURE = /(?:^|\n)(?:###\s+)?Phase\s+(\d+\.\d+)[\s:]\s*([^\n]*)/gi;
const SESSION_ID_NAME_IN_PHASE = /(?:^|\n)(?:-\s*\[\s*x?\s*\]\s*)?###\s+Session\s+(\d+\.\d+\.\d+)[\s:]\s*([^\n]*)/gi;
const TASK_ID_NAME_IN_SESSION = /(?:^|\n)(?:-\s*\[\s*x?\s*\]\s*)?(?:####|###)\s+Task\s+(\d+\.\d+\.\d+\.\d+)[\s:]\s*([^\n]*)/gi;

/**
 * Enumerate tierDown IDs and descriptions from current-tier guide content.
 * Used when the planning doc has no parseable bullets so we can still populate ctx.tierDownPlanItems from the guide.
 */
export function deriveTierDownPlanItemsFromGuide(
  content: string,
  tier: 'feature' | 'phase' | 'session'
): TierDownPlanItem[] {
  const items: TierDownPlanItem[] = [];
  if (tier === 'feature') {
    let m: RegExpExecArray | null;
    PHASE_ID_NAME_IN_FEATURE.lastIndex = 0;
    while ((m = PHASE_ID_NAME_IN_FEATURE.exec(content)) !== null) {
      const id = m[1];
      const description = m[2].trim().slice(0, 500) || id;
      if (id && !items.some((i) => i.id === id)) items.push({ id, description });
    }
  } else if (tier === 'phase') {
    let m: RegExpExecArray | null;
    SESSION_ID_NAME_IN_PHASE.lastIndex = 0;
    while ((m = SESSION_ID_NAME_IN_PHASE.exec(content)) !== null) {
      const id = m[1];
      const description = m[2].trim().slice(0, 500) || id;
      if (id && !items.some((i) => i.id === id)) items.push({ id, description });
    }
  } else {
    let m: RegExpExecArray | null;
    TASK_ID_NAME_IN_SESSION.lastIndex = 0;
    while ((m = TASK_ID_NAME_IN_SESSION.exec(content)) !== null) {
      const id = m[1];
      const description = m[2].trim().slice(0, 500) || id;
      if (id && !items.some((i) => i.id === id)) items.push({ id, description });
    }
  }
  return items;
}

// --- Section presence checks (exported for stepSyncPlannedTierDownToGuide) ---

export function hasPhaseSection(content: string, phaseId: string): boolean {
  const escaped = phaseId.replace(/\./g, '\\.');
  return new RegExp(`(?:###\\s+)?Phase\\s+${escaped}[\\s:]`, 'i').test(content);
}

export function hasSessionSection(content: string, sessionId: string): boolean {
  const escaped = sessionId.replace(/\./g, '\\.');
  return new RegExp(`###\\s+Session\\s+${escaped}[\\s:]`, 'i').test(content);
}

export function hasTaskSection(content: string, taskId: string): boolean {
  const escaped = taskId.replace(/\./g, '\\.');
  return new RegExp(`(?:####|###)\\s+Task\\s+${escaped}[\\s:]`, 'i').test(content);
}

// --- Section builders (exported for stepSyncPlannedTierDownToGuide; match fill-direct-tier-down / tier-start format) ---

export function buildPhaseSection(phaseId: string, name: string): string {
  return [
    '',
    `- [ ] ### Phase ${phaseId}: ${name}`,
    '**Description:** [Fill in]',
    '',
    '**Sessions:** [To be planned]',
    '',
    '**Success Criteria:**',
    '- [To be defined]',
  ].join('\n');
}

export function buildSessionSection(sessionId: string, name: string): string {
  return [
    '',
    `- [ ] ### Session ${sessionId}: ${name}`,
    '**Description:** [Fill in]',
    '',
    '**Tasks:** [To be planned]',
  ].join('\n');
}

export function buildTaskSection(taskId: string, name: string): string {
  return [
    '',
    `- [ ] #### Task ${taskId}: ${name}`,
    '**Goal:** [Fill in]',
    '**Files:**',
    '- [Files to work with]',
    '**Approach:** [Fill in]',
    '**Checkpoint:** [What needs to be verified]',
  ].join('\n');
}

/** Session logs are not session guides; create minimal log file when missing. */
async function ensureSessionLogExists(
  context: WorkflowCommandContext,
  sessionId: string,
  description: string
): Promise<void> {
  const logPath = context.paths.getSessionLogPath(sessionId);
  try {
    await context.documents.readLog('session', sessionId);
  } catch {
    const written = await writeProjectFile(logPath, `# Session ${sessionId}: ${description}\n\n`);
    if (!written) {
      throw new Error(`ensureSessionLogExists: write blocked or failed for ${logPath}`);
    }
  }
}

// --- Tier handlers ---

async function runForFeature(ctx: TierStartWorkflowContext): Promise<void> {
  const { context, identifier, resolvedDescription } = ctx;
  const scopeName = resolvedDescription ?? identifier;
  let content: string;
  try {
    content = await context.documents.readGuide('feature');
  } catch {
    throw new Error(
      `ensure-tier-down-docs: feature guide not found at ${context.paths.getFeatureGuidePath()}`
    );
  }
  const phaseIds = enumeratePhaseIdsFromFeatureGuide(content);
  if (phaseIds.length === 0) return;
  let updated = content;
  for (const phaseId of phaseIds) {
    const planDesc = ctx.tierDownPlanItems?.find(i => i.id === phaseId)?.description;
    let phaseDesc = planDesc ?? `Phase ${phaseId}`;
    if (!planDesc) {
      try {
        phaseDesc = await derivePhaseDescription(phaseId, context);
      } catch {
        phaseDesc = `Phase ${phaseId}`;
      }
    }
    if (!hasPhaseSection(updated, phaseId)) {
      updated = updated.trimEnd() + '\n' + buildPhaseSection(phaseId, phaseDesc);
    }
    await context.documents.ensureGuide('phase', phaseId, phaseDesc);
  }
  if (updated !== content) {
    updated = ensureGuideHasRequiredSections(updated, 'feature', identifier, scopeName);
    await context.documents.updateGuide('feature', identifier, () => updated);
  }

  /** Leaf / collapsed decomposition: single auto phase — scaffold session + task chain under that phase. */
  if (ctx.leafTier === true) {
    const finalGuide = await context.documents.readGuide('feature');
    const leafPhaseIds = enumeratePhaseIdsFromFeatureGuide(finalGuide);
    if (leafPhaseIds.length === 1) {
      const phaseId = leafPhaseIds[0]!;
      const phaseCfg = getConfigForTier('phase') as TierConfig;
      await runForPhase({ ...ctx, config: phaseCfg, identifier: phaseId });
      const phaseContentAfter = await context.documents.readGuide('phase', phaseId);
      const sessionIds = enumerateSessionIdsFromPhaseGuide(phaseContentAfter);
      const sessionId = sessionIds[0];
      if (sessionId) {
        const sessionCfg = getConfigForTier('session') as TierConfig;
        await runForSession({ ...ctx, config: sessionCfg, identifier: sessionId });
      }
    }
  }
}

async function runForPhase(ctx: TierStartWorkflowContext): Promise<void> {
  const { context, identifier, resolvedDescription } = ctx;
  const phaseId = identifier;
  const scopeName = resolvedDescription ?? phaseId;
  let content: string;
  try {
    content = await context.documents.readGuide('phase', phaseId);
  } catch {
    const phaseName = await derivePhaseDescription(phaseId, context);
    await context.documents.ensureGuide('phase', phaseId, phaseName);
    content = await context.documents.readGuide('phase', phaseId);
  }
  const sessionIds = enumerateSessionIdsFromPhaseGuide(content);
  if (sessionIds.length === 0) {
    const firstSessionId = `${phaseId}.1`;
    if (!hasSessionSection(content, firstSessionId)) {
      const sessionSection = buildSessionSection(firstSessionId, scopeName);
      await context.documents.updateGuide('phase', phaseId, (c) => c.trimEnd() + '\n' + sessionSection);
      content = content + sessionSection;
      const firstDesc =
        ctx.tierDownPlanItems?.find(i => i.id === firstSessionId)?.description ?? scopeName;
      await context.documents.ensureGuide('session', firstSessionId, firstDesc);
      await ensureSessionLogExists(context, firstSessionId, firstDesc);
    }
    return;
  }
  let updated = content;
  for (const sessionId of sessionIds) {
    if (!hasSessionSection(updated, sessionId)) {
      const name =
        ctx.tierDownPlanItems?.find(i => i.id === sessionId)?.description ?? scopeName;
      updated = updated.trimEnd() + '\n' + buildSessionSection(sessionId, name);
    }
    const sessionDesc =
      ctx.tierDownPlanItems?.find(i => i.id === sessionId)?.description ?? scopeName;
    await context.documents.ensureGuide('session', sessionId, sessionDesc);
    await ensureSessionLogExists(context, sessionId, sessionDesc);
  }
  if (updated !== content) {
    updated = ensureGuideHasRequiredSections(updated, 'phase', phaseId, scopeName);
    await context.documents.updateGuide('phase', phaseId, () => updated);
  }
}

async function runForSession(ctx: TierStartWorkflowContext): Promise<void> {
  const { context, identifier, resolvedDescription } = ctx;
  const sessionId = identifier;
  const scopeName = resolvedDescription ?? sessionId;
  if (!(await context.documents.guideExists('session', sessionId))) {
    await context.documents.ensureGuide('session', sessionId, scopeName);
  }
  const content = await context.documents.readGuide('session', sessionId);
  let phaseGuideContent = '';
  const parsed = sessionId.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (parsed) {
    const phaseId = `${parsed[1]}.${parsed[2]}`;
    try {
      phaseGuideContent = await context.documents.readGuide('phase', phaseId);
    } catch {
      phaseGuideContent = '';
    }
  }
  const taskIds = enumerateTaskIdsForSession(phaseGuideContent, content, sessionId);
  let updated = content;
  for (const taskId of taskIds) {
    const taskDesc =
      ctx.tierDownPlanItems?.find(i => i.id === taskId)?.description ?? scopeName;
    if (!hasTaskSection(updated, taskId)) {
      updated = updated.trimEnd() + '\n' + buildTaskSection(taskId, taskDesc);
    }
  }
  if (updated !== content) {
    updated = ensureGuideHasRequiredSections(updated, 'session', sessionId, scopeName);
    await context.documents.updateGuide('session', sessionId, () => updated);
  }
}

/**
 * Run tier-generic ensure tierDown docs: enumerate all direct tierDown, append missing
 * sections to the current-tier guide, and ensure tierDown doc files exist (tierDown guide and log).
 * No-op for lowest tier (task). Errors propagate.
 */
export async function runEnsureTierDownDocsForTier(ctx: TierStartWorkflowContext): Promise<void> {
  const tier = ctx.config.name;
  if (tier === 'task') return;
  if (tier === 'feature') await runForFeature(ctx);
  else if (tier === 'phase') await runForPhase(ctx);
  else if (tier === 'session') await runForSession(ctx);
}
