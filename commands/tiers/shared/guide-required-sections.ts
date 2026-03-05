/**
 * Single source of truth for required guide and handoff sections (feature, phase, session).
 * Used by the docs audit and by all guide creation/update paths so every tier
 * emits the sections the audit expects. Agent-facing fill instructions should
 * reference .project-manager/REQUIRED_DOC_SECTIONS.md (kept in sync with these constants).
 * Tier-agnostic: one ensure function keyed by tier for guides.
 */

import { MarkdownUtils } from '../../utils/markdown-utils';

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

/** First line index of a heading whose title includes sectionTitle. */
function findSectionStartLine(lines: string[], sectionTitle: string): number {
  return lines.findIndex((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#')) return false;
    const titleMatch = trimmed.match(/^#+\s+(.+)$/);
    if (!titleMatch) return false;
    return titleMatch[1].trim().includes(sectionTitle);
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

  for (const sectionTitle of sections) {
    const sectionContent = MarkdownUtils.extractSection(result, sectionTitle);
    if (sectionContent.trim().length >= MIN_SECTION_LENGTH) continue;

    const minimal = buildMinimalSection(tier, sectionTitle, identifier, description);
    const currentLines = result.split('\n');
    const startIdx = findSectionStartLine(currentLines, sectionTitle);

    if (startIdx === -1) {
      result = result.trimEnd() + '\n\n---\n\n' + minimal;
      continue;
    }

    const endIdx = findSectionEndLine(currentLines, startIdx);
    const before = currentLines.slice(0, startIdx).join('\n');
    const after = currentLines.slice(endIdx).join('\n');
    result = (before ? before + '\n\n' : '') + minimal + (after ? '\n\n' + after : '');
  }

  return result;
}
