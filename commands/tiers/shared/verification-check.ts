/**
 * Verification checklist proposal for tier-end.
 * Analyzes work completed in the tier (session, phase, feature) and proposes a short
 * manual verification checklist when the work supports it and child tiers did not
 * already cover that verification. Uses "verification" wording only (no "test").
 */

import type { WorkflowCommandContext } from '../../utils/command-context';
import { WorkflowId } from '../../utils/id-utils';
import {
  detectSessionModifiedFiles,
  detectPhaseModifiedFiles,
  detectFeatureModifiedFiles,
} from '../../utils/detect-modified-files';

export interface VerificationCheckResult {
  suggested: boolean;
  checklist?: string;
  /** Primary: what to verify about what we built (behavior, UX). Shown first. */
  productChecklist?: string;
  /** Secondary: doc/artifact-only items. Shown after product or omitted. */
  artifactChecklist?: string;
}

/** Doc-only patterns: items that describe verifying documentation/artifacts, not product behavior. */
const ARTIFACT_PATTERNS = /\b(session\s+log|handoff|guide\s+updated|documentation|document\s+updated|phase\s+guide|updated\s+checklist|session\s+guide)\b/i;
/** Product/behavior patterns: items that suggest verifying what we built (UX, behavior, correctness). */
const PRODUCT_PATTERNS = /\b(verify|confirm|user\s+sees|display|ui\s+shows|works\s+when|behavior|in\s+the\s+app|in\s+the\s+ui)\b/i;

function isProductVerificationItem(text: string): boolean {
  const t = text.toLowerCase();
  if (ARTIFACT_PATTERNS.test(t)) return false;
  if (PRODUCT_PATTERNS.test(t)) return true;
  if (UI_INDICATOR_PATTERNS.some((p) => p.test(text))) return true;
  return true;
}

function splitProductAndArtifact(items: string[]): { product: string[]; artifact: string[] } {
  const product: string[] = [];
  const artifact: string[] = [];
  for (const item of items) {
    if (isProductVerificationItem(item)) {
      product.push(item);
    } else {
      artifact.push(item);
    }
  }
  return { product, artifact };
}

const UI_INDICATOR_PATTERNS = [
  /\b(booking|calendar|modal|slot|form|ui|vue|component|composable)\b/i,
  /\.vue\b/i,
  /client\/src\//i,
];
const VERIFICATION_WORDS = /\b(verify|confirm|check|validation)\b/i;

function workSummarySuggestsUserFacing(summary: string, modifiedFiles: string[]): boolean {
  const combined = summary + '\n' + modifiedFiles.join('\n');
  return UI_INDICATOR_PATTERNS.some((p) => p.test(combined));
}

function extractTaskSections(sessionGuideContent: string, sessionId: string): Array<{ goal: string; checkpoint: string }> {
  const sections: Array<{ goal: string; checkpoint: string }> = [];
  const escapedSession = sessionId.replace(/\./g, '\\.');
  const taskSectionRegex = new RegExp(
    `(?:####|###)\\s*Task\\s+${escapedSession}\\.(\\d+):[^\\n]*\\n([\\s\\S]*?)(?=(?:-?\\s*\\[|#### Task|### Task|##\\s|$))`,
    'gi'
  );
  let m: RegExpExecArray | null;
  while ((m = taskSectionRegex.exec(sessionGuideContent)) !== null) {
    const block = m[2];
    const goalMatch = block.match(/\*\*Goal:\*\*\s*([\s\S]*?)(?=\n\*\*|\n\n|$)/i);
    const checkpointMatch = block.match(/\*\*Checkpoint:\*\*\s*([\s\S]*?)(?=\n\*\*|\n\n|$)/i);
    const goal = goalMatch ? goalMatch[1].trim() : '';
    const checkpoint = checkpointMatch ? checkpointMatch[1].trim() : '';
    if (goal || checkpoint) {
      sections.push({ goal, checkpoint });
    }
  }
  return sections;
}

function deriveChecklistItemsFromGoalsAndCheckpoints(
  tasks: Array<{ goal: string; checkpoint: string }>
): string[] {
  const items: string[] = [];
  const seen = new Set<string>();
  for (const { goal, checkpoint } of tasks) {
    const text = (goal + ' ' + checkpoint).trim();
    if (!text) continue;
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (/\[fill in\]|\[what needs to be verified\]/i.test(text)) continue;
    const bullet = checkpoint || goal;
    const trimmed = bullet.trim().slice(0, 200);
    if (trimmed) {
      items.push(trimmed.startsWith('-') ? trimmed : `- ${trimmed}`);
    }
  }
  return items;
}

function alreadyVerifiedInTaskCheckpoints(tasks: Array<{ goal: string; checkpoint: string }>): Set<string> {
  const covered = new Set<string>();
  for (const { checkpoint } of tasks) {
    if (VERIFICATION_WORDS.test(checkpoint)) {
      const key = checkpoint.toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
      covered.add(key);
    }
  }
  return covered;
}

function filterChecklistByAlreadyCovered(
  items: string[],
  coveredKeys: Set<string>
): string[] {
  return items.filter((item) => {
    const key = item.toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
    for (const c of coveredKeys) {
      if (key.includes(c) || c.includes(key)) return false;
    }
    return true;
  });
}

/**
 * Propose a verification checklist for a session. Uses session guide (task goals/checkpoints)
 * and optionally modified files to decide if manual validation is helpful and what steps to suggest.
 */
export async function proposeVerificationChecklistForSession(
  sessionId: string,
  context: WorkflowCommandContext
): Promise<VerificationCheckResult | null> {
  if (!WorkflowId.isValidSessionId(sessionId)) {
    return { suggested: false };
  }
  let sessionGuide: string;
  try {
    sessionGuide = await context.readSessionGuide(sessionId);
  } catch {
    return { suggested: false };
  }
  const modifiedFiles = await detectSessionModifiedFiles(sessionId, context);
  const tasks = extractTaskSections(sessionGuide, sessionId);
  const workSummary = tasks.map((t) => t.goal + ' ' + t.checkpoint).join(' ') || sessionGuide.slice(0, 500);
  if (!workSummarySuggestsUserFacing(workSummary, modifiedFiles)) {
    return { suggested: false };
  }
  let items = deriveChecklistItemsFromGoalsAndCheckpoints(tasks);
  const covered = alreadyVerifiedInTaskCheckpoints(tasks);
  items = filterChecklistByAlreadyCovered(items, covered);
  if (items.length === 0) {
    return { suggested: false };
  }
  const { product, artifact } = splitProductAndArtifact(items);
  const suggested = product.length > 0;
  if (!suggested && artifact.length === 0) return { suggested: false };
  if (!suggested) return { suggested: false };
  const productChecklist = product.join('\n');
  const artifactChecklist = artifact.length > 0 ? artifact.join('\n') : undefined;
  return {
    suggested: true,
    checklist: productChecklist + (artifactChecklist ? '\n' + artifactChecklist : ''),
    productChecklist,
    artifactChecklist,
  };
}

/**
 * Propose a verification checklist for a phase. Aggregates session guides for completed sessions
 * and optionally uses modified files; filters out verification already covered in sessions.
 */
export async function proposeVerificationChecklistForPhase(
  phaseId: string,
  completedSessions: string[],
  context: WorkflowCommandContext
): Promise<VerificationCheckResult | null> {
  let phaseGuide: string;
  try {
    phaseGuide = await context.readPhaseGuide(phaseId);
  } catch {
    return { suggested: false };
  }
  const modifiedFiles = await detectPhaseModifiedFiles(phaseId, completedSessions, context);
  const allGoals: string[] = [];
  const allCheckpoints: string[] = [];
  const sessionVerifiedThemes = new Set<string>();
  for (const sid of completedSessions) {
    try {
      const sg = await context.readSessionGuide(sid);
      const tasks = extractTaskSections(sg, sid);
      for (const t of tasks) {
        if (t.goal) allGoals.push(t.goal);
        if (t.checkpoint) allCheckpoints.push(t.checkpoint);
        if (VERIFICATION_WORDS.test(t.checkpoint)) {
          sessionVerifiedThemes.add(t.checkpoint.toLowerCase().slice(0, 60));
        }
      }
    } catch {
      continue;
    }
  }
  const workSummary = phaseGuide.slice(0, 500) + ' ' + allGoals.join(' ') + ' ' + allCheckpoints.join(' ');
  if (!workSummarySuggestsUserFacing(workSummary, modifiedFiles)) {
    return { suggested: false };
  }
  const items: string[] = [];
  const seen = new Set<string>();
  for (const cp of allCheckpoints) {
    if (!cp || /\[fill in\]/i.test(cp)) continue;
    const key = cp.toLowerCase().slice(0, 60);
    if (sessionVerifiedThemes.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(cp.startsWith('-') ? cp : `- ${cp}`);
  }
  for (const g of allGoals) {
    if (!g || /\[fill in\]/i.test(g)) continue;
    const key = g.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    let alreadyCovered = false;
    for (const theme of sessionVerifiedThemes) {
      if (key.includes(theme) || theme.includes(key)) {
        alreadyCovered = true;
        break;
      }
    }
    if (alreadyCovered) continue;
    seen.add(key);
    items.push(g.startsWith('-') ? g : `- ${g}`);
  }
  if (items.length === 0) {
    return { suggested: false };
  }
  const limited = items.slice(0, 7);
  const { product, artifact } = splitProductAndArtifact(limited);
  const suggested = product.length > 0;
  if (!suggested) return { suggested: false };
  const productChecklist = product.join('\n');
  const artifactChecklist = artifact.length > 0 ? artifact.join('\n') : undefined;
  return {
    suggested: true,
    checklist: productChecklist + (artifactChecklist ? '\n' + artifactChecklist : ''),
    productChecklist,
    artifactChecklist,
  };
}

/**
 * Propose a verification checklist for a feature. Uses feature guide and phase guides;
 * optionally uses modified files. Filters out verification already implied in phase/session content.
 */
export async function proposeVerificationChecklistForFeature(
  featureName: string,
  context: WorkflowCommandContext
): Promise<VerificationCheckResult | null> {
  let featureGuide: string;
  try {
    featureGuide = await context.readFeatureGuide();
  } catch {
    return { suggested: false };
  }
  const modifiedFiles = await detectFeatureModifiedFiles(featureName, context);
  const workSummary = featureGuide.slice(0, 800);
  if (!workSummarySuggestsUserFacing(workSummary, modifiedFiles)) {
    return { suggested: false };
  }
  const phaseMatch = featureGuide.match(/Phase\s+(\d+\.\d+)/g);
  const phaseIds = phaseMatch
    ? [...new Set(phaseMatch.map((m) => m.replace(/Phase\s+/i, '').trim()))]
    : [];
  const items: string[] = [];
  const seen = new Set<string>();
  for (const phaseId of phaseIds.slice(0, 5)) {
    try {
      const pg = await context.readPhaseGuide(phaseId);
      const goalLike = pg.match(/\*\*Description:\*\*\s*([\s\S]*?)(?=\n\*\*|\n\n|$)/i);
      const desc = goalLike ? goalLike[1].trim() : '';
      if (desc && desc.length > 10 && !/\[fill in\]/i.test(desc)) {
        const key = desc.toLowerCase().slice(0, 50);
        if (!seen.has(key)) {
          seen.add(key);
          items.push(desc.startsWith('-') ? desc : `- ${desc}`);
        }
      }
    } catch {
      continue;
    }
  }
  if (items.length === 0) {
    const fallback = featureGuide.match(/##\s*[^\n]+\n([\s\S]*?)(?=\n##|$)/);
    const firstSection = fallback ? fallback[1].trim().split('\n').slice(0, 3).join('\n') : '';
    if (firstSection.length > 20) {
      items.push(firstSection.startsWith('-') ? firstSection : `- ${firstSection}`);
    }
  }
  if (items.length === 0) {
    return { suggested: false };
  }
  const limited = items.slice(0, 5);
  const { product, artifact } = splitProductAndArtifact(limited);
  const suggested = product.length > 0;
  if (!suggested) return { suggested: false };
  const productChecklist = product.join('\n');
  const artifactChecklist = artifact.length > 0 ? artifact.join('\n') : undefined;
  return {
    suggested: true,
    checklist: productChecklist + (artifactChecklist ? '\n' + artifactChecklist : ''),
    productChecklist,
    artifactChecklist,
  };
}
