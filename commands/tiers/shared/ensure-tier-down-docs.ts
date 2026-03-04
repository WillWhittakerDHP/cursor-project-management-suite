/**
 * Tier-generic ensure tierDown docs: enumerate all direct tierDown, append missing sections
 * in the current-tier guide, and create tierDown doc files where applicable. Used by
 * stepEnsureTierDownDocs for all tiers (lowest tier is no-op). Language:
 * tierUp/tierDown/tierAcross only; no parent/child or concrete tier names in generic prose.
 */

import type { TierStartWorkflowContext, TierDownPlanItem } from './tier-start-workflow-types';
import type { WorkflowCommandContext } from '../../utils/command-context';
import { readProjectFile, writeProjectFile } from '../../utils/utils';
import { derivePhaseDescription } from '../../planning/utils/resolve-planning-description';

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

// --- Ensure tierDown doc files exist ---

async function ensurePhaseGuideExists(
  context: WorkflowCommandContext,
  phaseId: string,
  description: string
): Promise<void> {
  const guidePath = context.paths.getPhaseGuidePath(phaseId);
  try {
    await readProjectFile(guidePath);
    return;
  } catch {
    // missing: create minimal
  }
  try {
    const firstSessionId = `${phaseId}.1`;
    const minimal = [
      `# Phase ${phaseId} Guide: ${description}`,
      '',
      '**Purpose:** Phase-level guide for planning and tracking.',
      '**Tier:** Phase',
      '',
      '---',
      '',
      '## Phase Overview',
      '',
      `**Phase Number:** ${phaseId}`,
      `**Phase Name:** ${description}`,
      '**Description:** [Fill in]',
      '**Duration:** 1+ sessions',
      '**Status:** Not Started',
      '',
      '---',
      '',
      '## Sessions Breakdown',
      '',
      `- [ ] ### Session ${firstSessionId}: ${description}`,
      '**Description:** [Fill in]',
      '',
      '**Tasks:** [To be planned]',
    ].join('\n');
    await writeProjectFile(guidePath, minimal);
  } catch (err) {
    console.warn('ensure-tier-down-docs: could not create tierDown guide', phaseId, err);
  }
}

async function ensureSessionGuideExists(
  context: WorkflowCommandContext,
  sessionId: string,
  description: string
): Promise<void> {
  const guidePath = context.paths.getSessionGuidePath(sessionId);
  try {
    await readProjectFile(guidePath);
  } catch {
    try {
      const template = await context.templates.loadTemplate('session', 'guide');
      const content = context.templates.render(template, {
        SESSION_ID: sessionId,
        DESCRIPTION: description,
        DATE: new Date().toISOString().split('T')[0],
      });
      await context.documents.writeGuide('session', sessionId, content);
    } catch (err) {
      console.warn('ensure-tier-down-docs: could not create tierDown guide', sessionId, err);
    }
  }
  const logPath = context.paths.getSessionLogPath(sessionId);
  try {
    await readProjectFile(logPath);
  } catch {
    try {
      await writeProjectFile(logPath, `# Session ${sessionId}: ${description}\n\n`);
    } catch (logErr) {
      console.warn('ensure-tier-down-docs: could not create tierDown log', sessionId, logErr);
    }
  }
}

// --- Tier handlers ---

async function runForFeature(ctx: TierStartWorkflowContext): Promise<void> {
  const { context, identifier, resolvedDescription } = ctx;
  const scopeName = resolvedDescription ?? identifier;
  const guidePath = context.paths.getFeatureGuidePath();
  let content: string;
  try {
    content = await readProjectFile(guidePath);
  } catch {
    console.warn('ensure-tier-down-docs: current-tier guide not found, skipping', guidePath);
    return;
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
        // keep fallback
      }
    }
    if (!hasPhaseSection(updated, phaseId)) {
      updated = updated.trimEnd() + '\n' + buildPhaseSection(phaseId, phaseDesc);
    }
    await ensurePhaseGuideExists(context, phaseId, phaseDesc);
  }
  if (updated !== content) {
    try {
      await writeProjectFile(guidePath, updated);
    } catch (err) {
      console.warn('ensure-tier-down-docs: could not write current-tier guide', err);
    }
  }
}

async function runForPhase(ctx: TierStartWorkflowContext): Promise<void> {
  const { context, identifier, resolvedDescription } = ctx;
  const phaseId = identifier;
  const scopeName = resolvedDescription ?? phaseId;
  const guidePath = context.paths.getPhaseGuidePath(phaseId);
  let content: string;
  try {
    content = await readProjectFile(guidePath);
  } catch {
    try {
      const phaseName = await derivePhaseDescription(phaseId, context);
      const firstSessionId = `${phaseId}.1`;
      content = [
        `# Phase ${phaseId} Guide: ${phaseName}`,
        '',
        '**Purpose:** Phase-level guide for planning and tracking.',
        '**Tier:** Phase',
        '',
        '---',
        '',
        '## Phase Overview',
        '',
        `**Phase Number:** ${phaseId}`,
        `**Phase Name:** ${phaseName}`,
        '**Description:** [Fill in]',
        '**Duration:** 1+ sessions',
        '**Status:** Not Started',
        '',
        '---',
        '',
        '## Sessions Breakdown',
        '',
        `- [ ] ### Session ${firstSessionId}: ${phaseName}`,
        '**Description:** [Fill in]',
        '',
        '**Tasks:** [To be planned]',
      ].join('\n');
      await writeProjectFile(guidePath, content);
    } catch (err) {
      console.warn('ensure-tier-down-docs: could not create tierDown guide', phaseId, err);
      return;
    }
  }
  const sessionIds = enumerateSessionIdsFromPhaseGuide(content);
  if (sessionIds.length === 0) {
    const firstSessionId = `${phaseId}.1`;
    if (!hasSessionSection(content, firstSessionId)) {
      const sessionSection = buildSessionSection(firstSessionId, scopeName);
      try {
        await writeProjectFile(guidePath, content.trimEnd() + '\n' + sessionSection);
        content = content + sessionSection;
      } catch (err) {
        console.warn('ensure-tier-down-docs: could not append first tierDown section', err);
      }
      const firstDesc =
        ctx.tierDownPlanItems?.find(i => i.id === firstSessionId)?.description ?? scopeName;
      await ensureSessionGuideExists(context, firstSessionId, firstDesc);
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
    await ensureSessionGuideExists(context, sessionId, sessionDesc);
  }
  if (updated !== content) {
    try {
      await writeProjectFile(guidePath, updated);
    } catch (err) {
      console.warn('ensure-tier-down-docs: could not write tierDown guide', err);
    }
  }
}

async function runForSession(ctx: TierStartWorkflowContext): Promise<void> {
  const { context, identifier, resolvedDescription } = ctx;
  const sessionId = identifier;
  const scopeName = resolvedDescription ?? sessionId;
  const guidePath = context.paths.getSessionGuidePath(sessionId);
  let content: string;
  try {
    content = await readProjectFile(guidePath);
  } catch {
    // Session guide creation is owned by context-policy (ensureSessionScaffold in readContext)
    return;
  }
  let phaseGuideContent = '';
  try {
    const parsed = sessionId.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (parsed) {
      const phaseId = `${parsed[1]}.${parsed[2]}`;
      phaseGuideContent = await readProjectFile(context.paths.getPhaseGuidePath(phaseId));
    }
  } catch {
    // optional for tierDown enumeration
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
    try {
      await context.documents.writeGuide('session', sessionId, updated);
    } catch (err) {
      console.warn('ensure-tier-down-docs: could not write current-tier guide', sessionId, err);
    }
  }
}

/**
 * Run tier-generic ensure tierDown docs: enumerate all direct tierDown, append missing
 * sections to current-tier guide, and ensure tierDown doc files exist (tierDown guide and log).
 * No-op for lowest tier. Non-blocking on errors (log and continue).
 */
export async function runEnsureTierDownDocsForTier(ctx: TierStartWorkflowContext): Promise<void> {
  const tier = ctx.config.name;
  if (tier === 'task') return; // lowest tier: no tierDown
  try {
    if (tier === 'feature') await runForFeature(ctx);
    else if (tier === 'phase') await runForPhase(ctx);
    else if (tier === 'session') await runForSession(ctx);
  } catch (err) {
    console.warn('ensure-tier-down-docs: non-blocking failure', tier, ctx.identifier, err);
  }
}
