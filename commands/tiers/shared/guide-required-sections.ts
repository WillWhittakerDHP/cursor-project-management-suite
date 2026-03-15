/**
 * Single source of truth for required guide and handoff sections (feature, phase, session).
 * Used by the docs audit and by all guide creation/update paths so every tier
 * emits the sections the audit expects. Agent-facing fill instructions should
 * reference .project-manager/REQUIRED_DOC_SECTIONS.md (kept in sync with these constants).
 * Tier-agnostic: one ensure function keyed by tier for guides.
 */

export type GuideTier = 'feature' | 'phase' | 'session';

/** Section titles the docs audit expects; guides must include these (or equivalent) with sufficient content. */
export const REQUIRED_GUIDE_SECTIONS: Record<GuideTier, readonly string[]> = {
  feature: ['Overview', 'Architecture', 'Implementation Plan'],
  phase: ['Overview', 'Objectives', 'Tasks'],
  session: ['Quick Start', 'Tasks', 'Session Workflow'],
};

/** Section titles the docs audit expects for handoff documents; all tiers use the same set. */
export const REQUIRED_HANDOFF_SECTIONS: readonly string[] = [
  'Current Status',
  'Next Action',
  'Transition Context',
];

const MIN_SECTION_LENGTH = 30;

/**
 * Match section heading: for "Tasks" use exact title only so "#### Task 6.8.6.1: ..." never matches.
 * WHY: includes("Tasks") would match headings containing "Tasks"; task blocks use "Task" + id, but
 * we must only match the canonical "### Tasks" / "## Tasks" section to avoid replacing task blocks.
 */
function sectionTitleMatches(headingTitle: string, sectionTitle: string): boolean {
  const t = headingTitle.trim();
  if (sectionTitle === 'Tasks') return t === 'Tasks';
  return t.includes(sectionTitle);
}

/** First line index of the section heading; uses exact match for "Tasks" to avoid matching #### Task X.Y.Z.N. */
function findSectionStartLine(lines: string[], sectionTitle: string): number {
  return lines.findIndex((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#')) return false;
    const titleMatch = trimmed.match(/^#+\s+(.+)$/);
    if (!titleMatch) return false;
    return sectionTitleMatches(titleMatch[1].trim(), sectionTitle);
  });
}

/** Line index where the section ends (exclusive): next same or higher heading depth, or end. */
function findSectionEndLine(lines: string[], startLine: number): number {
  const startDepth = lines[startLine].match(/^#+/)?.[0].length ?? 0;
  for (let i = startLine + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('#')) {
      const depth = lines[i].match(/^#+/)?.[0].length ?? 0;
      if (depth <= startDepth) return i;
    }
  }
  return lines.length;
}

/** Count of #### Task or ### Task X.Y.Z.N blocks in content (session guide task blocks). */
function countTaskBlocksInSection(sectionContent: string): number {
  const taskHeadingRegex = /(?:^|\n)(?:-\s*\[\s*x?\s*\]\s*)?(?:####|###)\s+Task\s+\d+\.\d+\.\d+\.\d+[\s:]/im;
  let count = 0;
  let _m: RegExpExecArray | null;
  while ((_m = taskHeadingRegex.exec(sectionContent)) !== null) {
    count++;
    if (count >= 2) return 2; // safeguard only needs to know "more than one"
  }
  return count;
}

// --- Minimal content builders (each yields a block so extractSection returns >= MIN_SECTION_LENGTH) ---

function buildMinimalFeatureOverview(identifier: string, description: string): string {
  return [
    '## Overview',
    '',
    `**Feature:** ${identifier}. ${description}`,
    '',
  ].join('\n');
}

function buildMinimalFeatureArchitecture(): string {
  return [
    '## Architecture',
    '',
    'High-level architecture and dependencies. [Fill in from feature plan.]',
    '',
  ].join('\n');
}

function buildMinimalFeatureImplementationPlan(): string {
  return [
    '## Implementation Plan',
    '',
    'Phases and implementation order. [Fill in from feature plan.]',
    '',
  ].join('\n');
}

function buildMinimalPhaseOverview(identifier: string, description: string): string {
  return [
    '## Overview',
    '',
    `**Phase Number:** ${identifier}`,
    `**Phase Name:** ${description}`,
    '**Description:** [Fill in]',
    '**Status:** Not Started',
    '',
  ].join('\n');
}

function buildMinimalPhaseObjectives(): string {
  return [
    '## Objectives',
    '',
    '- [ ] Objectives to be planned. Add key outcomes for this phase.',
    '',
  ].join('\n');
}

function buildMinimalPhaseTasks(): string {
  return [
    '## Tasks',
    '',
    'Sessions and tasks for this phase. [See Sessions Breakdown below.]',
    '',
  ].join('\n');
}

function buildMinimalSessionQuickStart(sessionId: string, description: string): string {
  return [
    '## Quick Start',
    '',
    `**Session ID:** ${sessionId}`,
    `**Session Name:** ${description}`,
    '**Description:** See session scope above.',
    '**Status:** In Progress',
    '',
  ].join('\n');
}

function buildMinimalSessionTasks(): string {
  return [
    '### Tasks',
    '',
    '- [ ] Tasks to be planned. Add task blocks with Goal, Files, Approach, Checkpoint.',
    '',
  ].join('\n');
}

function buildMinimalSessionWorkflow(): string {
  return [
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

/** Return minimal markdown block for the given tier and section title. */
function buildMinimalSection(
  tier: GuideTier,
  sectionTitle: string,
  identifier: string,
  description: string
): string {
  if (tier === 'feature') {
    if (sectionTitle === 'Overview') return buildMinimalFeatureOverview(identifier, description);
    if (sectionTitle === 'Architecture') return buildMinimalFeatureArchitecture();
    if (sectionTitle === 'Implementation Plan') return buildMinimalFeatureImplementationPlan();
  }
  if (tier === 'phase') {
    if (sectionTitle === 'Overview') return buildMinimalPhaseOverview(identifier, description);
    if (sectionTitle === 'Objectives') return buildMinimalPhaseObjectives();
    if (sectionTitle === 'Tasks') return buildMinimalPhaseTasks();
  }
  if (tier === 'session') {
    if (sectionTitle === 'Quick Start') return buildMinimalSessionQuickStart(identifier, description);
    if (sectionTitle === 'Tasks') return buildMinimalSessionTasks();
    if (sectionTitle === 'Session Workflow') return buildMinimalSessionWorkflow();
  }
  return `## ${sectionTitle}\n\n[Fill in.]\n\n`;
}

/**
 * Ensure content has all REQUIRED_GUIDE_SECTIONS for the tier, each with at least MIN_SECTION_LENGTH
 * characters. Replaces short or missing sections with minimal content; appends if section not found.
 * Uses the same bounds for "short?" check and replacement so we never replace a range we didn't deem short.
 * Session "Tasks": never replace if the section already has 2+ task blocks (preserve tierDown list).
 */
export function ensureGuideHasRequiredSections(
  content: string,
  tier: GuideTier,
  identifier: string,
  description: string
): string {
  const sections = REQUIRED_GUIDE_SECTIONS[tier];
  if (!sections.length) return content;

  let result = content;
  const currentLines = result.split('\n');

  for (const sectionTitle of sections) {
    const startIdx = findSectionStartLine(currentLines, sectionTitle);

    if (startIdx === -1) {
      const minimal = buildMinimalSection(tier, sectionTitle, identifier, description);
      result = result.trimEnd() + '\n\n---\n\n' + minimal;
      // Refresh lines after append so next section uses updated content
      currentLines.length = 0;
      currentLines.push(...result.split('\n'));
      continue;
    }

    const endIdx = findSectionEndLine(currentLines, startIdx);
    const sectionContent = currentLines.slice(startIdx, endIdx).join('\n');

    // Session "Tasks": preserve section if it already has multiple task blocks (tierDown list from tierUp).
    if (tier === 'session' && sectionTitle === 'Tasks' && countTaskBlocksInSection(sectionContent) >= 2) {
      continue;
    }

    if (sectionContent.trim().length >= MIN_SECTION_LENGTH) continue;

    const minimal = buildMinimalSection(tier, sectionTitle, identifier, description);
    const before = currentLines.slice(0, startIdx).join('\n');
    const after = currentLines.slice(endIdx).join('\n');
    result = (before ? before + '\n\n' : '') + minimal + (after ? '\n\n' + after : '');
    currentLines.length = 0;
    currentLines.push(...result.split('\n'));
  }

  return result;
}

// --- Handoff: minimal section builders and ensure ---

export type HandoffTierForSections = 'feature' | 'phase' | 'session';

function buildMinimalHandoffCurrentStatus(identifier: string, description: string): string {
  return [
    '## Current Status',
    '',
    `**Last Completed:** [Fill in for ${description || identifier}]`,
    '**Next Session:** [Fill in]',
    '**Git Branch:** [Fill in]',
    '**Last Updated:** [Fill in]',
    '',
  ].join('\n');
}

function buildMinimalHandoffNextAction(): string {
  return [
    '## Next Action',
    '',
    'Continue with next step. [Fill in.]',
    '',
  ].join('\n');
}

function buildMinimalHandoffTransitionContext(): string {
  return [
    '## Transition Context',
    '',
    '**Where we left off:** [Fill in]',
    '',
    '**What you need to start:** [Fill in]',
    '',
  ].join('\n');
}

function buildMinimalHandoffSection(
  sectionTitle: string,
  identifier: string,
  description: string
): string {
  if (sectionTitle === 'Current Status') return buildMinimalHandoffCurrentStatus(identifier, description);
  if (sectionTitle === 'Next Action') return buildMinimalHandoffNextAction();
  if (sectionTitle === 'Transition Context') return buildMinimalHandoffTransitionContext();
  return `## ${sectionTitle}\n\n[Fill in.]\n\n`;
}

/** Handoff section match: use same logic as guide (## Title). */
function handoffSectionTitleMatches(headingTitle: string, sectionTitle: string): boolean {
  return headingTitle.trim().includes(sectionTitle);
}

function findHandoffSectionStartLine(lines: string[], sectionTitle: string): number {
  return lines.findIndex((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#')) return false;
    const titleMatch = trimmed.match(/^#+\s+(.+)$/);
    if (!titleMatch) return false;
    return handoffSectionTitleMatches(titleMatch[1].trim(), sectionTitle);
  });
}

/**
 * Ensure content has all REQUIRED_HANDOFF_SECTIONS, each with at least MIN_SECTION_LENGTH
 * characters. Replaces short or missing sections with minimal content.
 * Used by DocumentManager.ensureHandoff and writeHandoff verification.
 */
export function ensureHandoffHasRequiredSections(
  content: string,
  tier: HandoffTierForSections,
  identifier: string,
  description?: string
): string {
  const desc = description ?? identifier;
  let result = content;
  const currentLines = result.split('\n');

  for (const sectionTitle of REQUIRED_HANDOFF_SECTIONS) {
    const startIdx = findHandoffSectionStartLine(currentLines, sectionTitle);

    if (startIdx === -1) {
      const minimal = buildMinimalHandoffSection(sectionTitle, identifier, desc);
      result = result.trimEnd() + '\n\n---\n\n' + minimal;
      currentLines.length = 0;
      currentLines.push(...result.split('\n'));
      continue;
    }

    const endIdx = findSectionEndLine(currentLines, startIdx);
    const sectionContent = currentLines.slice(startIdx, endIdx).join('\n');

    if (sectionContent.trim().length >= MIN_SECTION_LENGTH) continue;

    const minimal = buildMinimalHandoffSection(sectionTitle, identifier, desc);
    const before = currentLines.slice(0, startIdx).join('\n');
    const after = currentLines.slice(endIdx).join('\n');
    result = (before ? before + '\n\n' : '') + minimal + (after ? '\n\n' + after : '');
    currentLines.length = 0;
    currentLines.push(...result.split('\n'));
  }

  return result;
}
