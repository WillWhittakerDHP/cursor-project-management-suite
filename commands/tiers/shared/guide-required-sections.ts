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
  /** Feature Objectives is required so template bullets like `[Objective 1]` cannot ship unfilled (see feature-guide.md). */
  feature: ['Overview', 'Architecture', 'Implementation Plan', 'Feature Objectives'],
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

function buildMinimalFeatureObjectives(identifier: string, description: string): string {
  const label = description?.trim() || identifier;
  return [
    '## Feature Objectives',
    '',
    `- Deliver **${label}** end-to-end per PROJECT_PLAN and phase guides (migrations, server, client, and docs as scoped).`,
    '- Meet LAUNCH_CHECKLIST and security gates that apply before beta or production cutover.',
    '- Publish stable contracts for downstream features (APIs, session/identity semantics, or docs) defined under **Dependencies** / **Implementation Plan**.',
    '',
  ].join('\n');
}

/** True when the feature guide still has the stock template objective bullets. */
function featureObjectivesStillTemplatePlaceholders(sectionBody: string): boolean {
  return /\[Objective\s*1\]/.test(sectionBody) && /\[Objective\s*2\]/.test(sectionBody);
}

/**
 * Replace a Feature Objectives section that still contains `feature-guide.md` template placeholders.
 * WHY: REQUIRED_GUIDE_SECTIONS used to omit this heading, so ensureGuide never repaired it after Overview/Architecture were filled manually.
 */
function replaceStaleFeatureObjectivesSection(
  content: string,
  identifier: string,
  description: string
): string {
  const lines = content.split('\n');
  const startIdx = findSectionStartLine(lines, 'Feature Objectives');
  if (startIdx === -1) return content;
  const endIdx = findSectionEndLine(lines, startIdx);
  const sectionBlock = lines.slice(startIdx, endIdx).join('\n');
  if (!featureObjectivesStillTemplatePlaceholders(sectionBlock)) return content;
  const fresh = buildMinimalFeatureObjectives(identifier, description);
  const before = lines.slice(0, startIdx).join('\n');
  const after = lines.slice(endIdx).join('\n');
  return [before.trimEnd(), fresh.trimEnd(), after.trimStart()].filter(Boolean).join('\n\n');
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
    if (sectionTitle === 'Feature Objectives') return buildMinimalFeatureObjectives(identifier, description);
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
 * Ensure content has all REQUIRED_GUIDE_SECTIONS for the tier by **appending** any missing section
 * headings. If a section already exists (matched heading), its body is **never** rewritten — avoids
 * clobbering user-filled guides when a section is short or oddly shaped. Docs audit still flags weak sections.
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
      currentLines.length = 0;
      currentLines.push(...result.split('\n'));
    }
  }

  if (tier === 'feature') {
    result = replaceStaleFeatureObjectivesSection(result, identifier, description);
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
