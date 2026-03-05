/**
 * Tier-agnostic context policy: readTierUpContext and ensureTierScaffold.
 * All tiers use tierUp/tierDown terminology; no concrete tier names in generic logic.
 */

import type { WorkflowCommandContext } from '../../utils/command-context';
import type { TierStartReadResult } from './tier-start-workflow-types';
import { WorkflowId } from '../../utils/id-utils';
import { readProjectFile, writeProjectFile, PROJECT_ROOT } from '../../utils/utils';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { MarkdownUtils } from '../../utils/markdown-utils';
import { generateCurrentStateSummary } from '../../utils/context-gatherer';
import { formatAutoGatheredContext } from '../../utils/context-templates';
import { getFeatureGuideFromProjectPlan } from '../../utils/project-plan-adapter';

export type TierName = 'feature' | 'phase' | 'session' | 'task';

/** Which tier supplies each doc type for this tier's planning context. */
export type TierContextSources = {
  guide: TierName | 'project';
  handoff: TierName;
  log?: TierName;
};

/** Per-tier context sources: guide from tierUp (or project for feature), handoff/log from tierUp or same tier (tierAcross = previous sibling). */
export const TIER_CONTEXT_SOURCES: Record<TierName, TierContextSources> = {
  feature: { guide: 'project', handoff: 'feature' },
  phase: { guide: 'feature', handoff: 'phase', log: 'phase' },
  session: { guide: 'phase', handoff: 'session', log: 'session' },
  task: { guide: 'session', handoff: 'task', log: 'task' },
};

export interface TierContextReadParams {
  tier: TierName;
  identifier: string;
  resolvedDescription: string;
  context: WorkflowCommandContext;
}

/**
 * Ensure tier scaffold exists before reading (phase/session: guide from template when missing; feature/task no-op).
 */
export async function ensureTierScaffold(params: TierContextReadParams): Promise<void> {
  const { tier, identifier, resolvedDescription, context } = params;
  if (tier === 'feature' || tier === 'task') return;

  // Phase: create phase guide from template when missing (so phase-start works without /phase-plan first).
  if (tier === 'phase') {
    try {
      await context.readPhaseGuide(identifier);
    } catch {
      try {
        const template = await context.templates.loadTemplate('phase', 'guide');
        const rendered = context.templates.render(template, {
          N: identifier,
          NAME: resolvedDescription,
          DESCRIPTION: resolvedDescription,
        });
        const phaseGuidePath = context.paths.getPhaseGuidePath(identifier);
        const fullPath = join(PROJECT_ROOT, phaseGuidePath);
        await mkdir(dirname(fullPath), { recursive: true });
        await context.documents.writeGuide('phase', identifier, rendered);
      } catch {
        // non-blocking
      }
    }
    return;
  }

  // Session: create session guide and log if missing
  if (tier === 'session') {
    try {
      await context.readSessionGuide(identifier);
    } catch {
      try {
        const template = await context.templates.loadTemplate('session', 'guide');
        const rendered = context.templates.render(template, {
          SESSION_ID: identifier,
          DESCRIPTION: resolvedDescription,
          DATE: new Date().toISOString().split('T')[0],
        });
        await context.documents.writeGuide('session', identifier, rendered);
      } catch {
        // non-blocking
      }
    }
    const sessionLogPath = context.paths.getSessionLogPath(identifier);
    try {
      await readProjectFile(sessionLogPath);
    } catch {
      try {
        await writeProjectFile(
          sessionLogPath,
          `# Session ${identifier} Log: ${resolvedDescription}\n\n` +
            '**Status:** In Progress\n' +
            `**Date:** ${new Date().toISOString().split('T')[0]}\n\n` +
            '---\n\n' +
            '## Session Goal\n\n[Document concrete session goal]\n'
        );
      } catch {
        // non-blocking
      }
    }
  }
}

/**
 * Convention: stop-reading marker in guide/handoff/log docs.
 * Format: <!-- end excerpt <tier> --> (tier = feature | phase | session | task).
 * Content is included up to (and excluding) the first occurrence; if absent, full content is used (with optional fallback max).
 */
export function getExcerptEndMarker(tier: TierName): string {
  return `<!-- end excerpt ${tier} -->`;
}

/** Max chars when no marker is found (safety cap). */
const EXCERPT_FALLBACK_MAX = 15000;

/**
 * Return content up to (excluding) the first occurrence of the tier's excerpt end marker.
 * If marker is not found, returns full content (or truncated to fallbackMax if provided).
 */
export function excerptUpToMarker(
  content: string,
  docTier: TierName,
  fallbackMax: number = EXCERPT_FALLBACK_MAX
): string {
  const t = content.trim();
  if (!t) return '';
  const marker = getExcerptEndMarker(docTier);
  const idx = t.indexOf(marker);
  if (idx >= 0) return t.slice(0, idx).trim();
  return fallbackMax > 0 && t.length > fallbackMax
    ? t.slice(0, fallbackMax) + '\n\n*(excerpt truncated — add "' + marker + '" to doc to set boundary)*'
    : t;
}

/** Feature guide content: from PROJECT_PLAN adapter when feature uses project, else feature guide file. */
async function getFeatureGuideContent(
  context: WorkflowCommandContext,
  featureIdentifier: string
): Promise<string> {
  const sources = TIER_CONTEXT_SOURCES.feature;
  if (sources.guide === 'project') {
    const fromPlan = await getFeatureGuideFromProjectPlan(featureIdentifier);
    if (fromPlan) return fromPlan;
  }
  try {
    return await context.readFeatureGuide();
  } catch {
    return '';
  }
}

/** Load guide content for the current tier from sources (data-driven). Uses <!-- end excerpt <tier> --> when present. */
async function loadGuideForTier(
  context: WorkflowCommandContext,
  sources: TierContextSources,
  tier: TierName,
  identifier: string
): Promise<string> {
  if (tier === 'feature') {
    const raw = await getFeatureGuideContent(context, identifier);
    return raw ? excerptUpToMarker(raw, 'feature') : '**Warning:** Feature guide not found.';
  }
  if (tier === 'phase') {
    const featureGuideContent = await getFeatureGuideContent(context, context.feature.name);
    const phaseSection = MarkdownUtils.extractSection(featureGuideContent, `Phase ${identifier}`);
    if (phaseSection) return `## Phase intent from feature guide\n\n${excerptUpToMarker(phaseSection, 'feature')}`;
    const phaseMatch = featureGuideContent.match(
      new RegExp(
        `(?:Phase|###)\\s+${identifier.replace(/\./g, '\\.')}[\\s:]*([\\s\\S]*?)(?=\\n(?:Phase|###)\\s+\\d|\\n##\\s+|$)`,
        'i'
      )
    );
    if (phaseMatch?.[0]) return `## Phase intent from feature guide\n\n${excerptUpToMarker(phaseMatch[0].trim(), 'feature')}`;
    return `**Warning: Feature guide not found or phase ${identifier} not listed.** Planning will proceed with minimal context.`;
  }
  if (tier === 'session') {
    const parsed = WorkflowId.parseSessionId(identifier);
    if (!parsed) return '**Warning:** Invalid session ID.';
    let phaseIntentBlock = '';
    let sessionEntry = '';
    try {
      const phaseGuide = await context.readPhaseGuide(parsed.phaseId);
      const dashIdx = phaseGuide.indexOf('\n---\n');
      const breakdownIdx = phaseGuide.search(/\n##\s+Sessions\s+Breakdown/i);
      const intentEnd = Math.min(
        dashIdx >= 0 ? dashIdx : phaseGuide.length,
        breakdownIdx >= 0 ? breakdownIdx : phaseGuide.length
      );
      phaseIntentBlock = excerptUpToMarker(phaseGuide.slice(0, intentEnd).trim(), 'phase');
      const escaped = identifier.replace(/\./g, '\\.');
      const sessionRegex = new RegExp(
        `(?:-\\s*\\[[ x]\\]\\s*)?###\\s*Session\\s+${escaped}:([\\s\\S]*?)(?=(?:\\n(?:-\\s*\\[[ x]\\]\\s*)?###\\s*Session\\s+\\d+\\.\\d+\\.\\d+:)|\\n##\\s+|\\n#\\s+|$)`,
        'i'
      );
      const match = phaseGuide.match(sessionRegex);
      if (match?.[0]) sessionEntry = excerptUpToMarker(match[0].trim(), 'phase');
    } catch {
      sessionEntry = '**Warning:** Phase guide context not found for this session.';
    }
    const guideParts: string[] = [];
    if (phaseIntentBlock) guideParts.push('## Phase intent (goals and context)\n\n' + phaseIntentBlock);
    if (sessionEntry) guideParts.push('## Session intent from phase guide\n\n' + sessionEntry);
    return guideParts.length > 0 ? guideParts.join('\n\n') : '**No phase guide session entry found.**';
  }
  // task
  const parsed = WorkflowId.parseTaskId(identifier);
  const sessionId = parsed?.sessionId ?? '';
  try {
    const guideContent = await context.readSessionGuide(sessionId);
    const escaped = identifier.replace(/\./g, '\\.');
    const pattern = new RegExp(
      `(?:- \\[[ x]\\])?\\s*(?:####|###) Task ${escaped}:.*?(?=(?:- \\[|#### Task|### Task|## |$))`,
      's'
    );
    const match = guideContent.match(pattern);
    return match ? excerptUpToMarker(match[0], 'session') : '';
  } catch {
    return '';
  }
}

/** Load handoff content: tierUp + tierAcross (previous sibling) when sources.handoff === tier. Uses <!-- end excerpt <tier> --> when present. */
async function loadHandoffForTier(
  context: WorkflowCommandContext,
  sources: TierContextSources,
  tier: TierName,
  identifier: string
): Promise<string> {
  const excerpt = (s: string, docTier: TierName) => excerptUpToMarker(s, docTier);
  const parts: string[] = [];

  if (tier === 'phase') {
    try {
      const handoff = await context.readFeatureHandoff();
      if (handoff?.trim()) parts.push(`## Transition Context (tierUp: feature)\n\n${excerpt(handoff, 'feature')}`);
    } catch {
      // no handoff
    }
    if (sources.handoff === 'phase') {
      const prevId = WorkflowId.getPreviousSiblingId(identifier, 'phase');
      if (prevId) {
        try {
          const prev = await context.readPhaseHandoff(prevId);
          if (prev?.trim()) parts.push(`## tierAcross (previous phase ${prevId})\n\n${excerpt(prev, 'phase')}`);
        } catch {
          // skip
        }
      }
    }
  } else if (tier === 'session') {
    const parsed = WorkflowId.parseSessionId(identifier);
    if (parsed) {
      try {
        const handoffContent = await context.readPhaseHandoff(parsed.phaseId);
        if (handoffContent?.trim())
          parts.push(
            `## Transition Context (tierUp: phase)\n\n**Where we left off and what you need to start:**\n\n## Phase Handoff (${parsed.phaseId})\n\n${excerpt(handoffContent, 'phase')}`
          );
      } catch {
        parts.push('**Warning:** Phase handoff not found.');
      }
      if (sources.handoff === 'session') {
        const prevId = WorkflowId.getPreviousSiblingId(identifier, 'session');
        if (prevId) {
          try {
            const prev = await context.readSessionHandoff(prevId);
            if (prev?.trim()) parts.push(`## tierAcross (previous session ${prevId})\n\n${excerpt(prev, 'session')}`);
          } catch {
            // skip
          }
        }
      }
    }
  } else if (tier === 'task') {
    const parsed = WorkflowId.parseTaskId(identifier);
    const sessionId = parsed?.sessionId ?? '';
    try {
      const content = await context.readSessionHandoff(sessionId);
      if (content?.trim()) parts.push(`## Transition Context (tierUp: session)\n\n${excerpt(content, 'session')}`);
    } catch {
      // no handoff
    }
    if (sources.handoff === 'task') {
      const prevId = WorkflowId.getPreviousSiblingId(identifier, 'task');
      if (prevId) {
        try {
          const prev = await context.readTaskHandoff(prevId);
          if (prev?.trim()) parts.push(`## tierAcross (previous task ${prevId})\n\n${excerpt(prev, 'task')}`);
        } catch {
          // skip
        }
      }
    }
  }
  return parts.join('\n\n');
}

/** Load optional log excerpt (previous sibling when sources.log === tier). No per-task log file. Uses <!-- end excerpt <tier> --> when present. */
async function loadLogForTier(
  context: WorkflowCommandContext,
  sources: TierContextSources,
  tier: TierName,
  identifier: string
): Promise<string> {
  if (sources.log !== tier) return '';
  if (tier === 'task') return ''; // no per-task log file
  const prevId = WorkflowId.getPreviousSiblingId(identifier, tier);
  if (!prevId) return '';
  try {
    if (tier === 'phase') {
      const log = await context.readPhaseLog(prevId);
      return log?.trim() ? excerptUpToMarker(log, 'phase') : '';
    }
    if (tier === 'session') {
      const log = await context.readSessionLog(prevId);
      return log?.trim() ? excerptUpToMarker(log, 'session') : '';
    }
  } catch {
    // non-blocking
  }
  return '';
}

/**
 * Read tierUp guide and handoff; extract section for current tier. Data-driven from TIER_CONTEXT_SOURCES.
 * When sources.guide === 'project', feature guide comes from PROJECT_PLAN adapter. tierAcross handoff/log loaded when sources specify same tier.
 */
export async function readTierUpContext(params: TierContextReadParams): Promise<TierStartReadResult> {
  const { tier, identifier, resolvedDescription, context } = params;
  await ensureTierScaffold(params);

  const label = `## ${tier} ${identifier} - ${resolvedDescription}`;
  const sources = TIER_CONTEXT_SOURCES[tier];

  const guide = await loadGuideForTier(context, sources, tier, identifier);
  const handoffRaw = await loadHandoffForTier(context, sources, tier, identifier);
  const handoff = handoffRaw.trim() ? handoffRaw : undefined;
  const logExcerpt = await loadLogForTier(context, sources, tier, identifier);

  const sectionTitles: Record<TierName, string> = {
    feature: 'Feature Guide',
    phase: 'Phase intent (from feature guide)',
    session: 'Session intent (from phase guide)',
    task: 'Task context (from session guide)',
  };

  let result: TierStartReadResult = {
    label,
    guide: guide || undefined,
    handoff,
    sectionTitle: sectionTitles[tier],
    sourcePolicy: 'tierUpOnly',
  };

  if (logExcerpt.trim()) {
    result = {
      ...result,
      handoff: [result.handoff, `## tierAcross log (previous ${tier})\n\n${logExcerpt}`].filter(Boolean).join('\n\n'),
    };
  }

  return result;
}

/**
 * Gather auto-context (file status, implementation status) for the tier scope. Same pattern for all tiers.
 */
export async function gatherTierContext(params: TierContextReadParams): Promise<string> {
  try {
    const summary = await generateCurrentStateSummary(
      params.identifier,
      params.context.feature.name
    );
    if (
      summary.filesStatus.length > 0 ||
      summary.implementationStatus.done.length > 0 ||
      summary.implementationStatus.missing.length > 0
    ) {
      return formatAutoGatheredContext(summary);
    }
  } catch {
    // non-blocking
  }
  return '';
}

/**
 * Human-readable description of allowed context sources, derived from the structured policy.
 */
export function formatTierContextSourceDescription(
  sources: TierContextSources,
  tier: TierName
): string {
  const guideFrom =
    sources.guide === 'project'
      ? 'PROJECT_PLAN (adapter)'
      : `${sources.guide} guide`;
  const handoffSameTier = sources.handoff === tier;
  const handoffFrom = handoffSameTier
    ? `${sources.handoff} (tierUp + tierAcross previous sibling)`
    : `${sources.handoff} handoff`;
  const logPart =
    sources.log != null
      ? sources.log === tier
        ? `; log from ${sources.log} (previous sibling)`
        : `; log from ${sources.log}`
      : '';
  return `Guide from ${guideFrom}; handoff from ${handoffFrom}${logPart}. TierDown docs for this unit are produced by this run, not read as input.`;
}

/**
 * Returns the standard tierUp-only policy for a tier (for getContextSourcePolicy hooks).
 */
export function getTierContextSourcePolicy(tier: TierName): {
  tierUpOnly: true;
  sources: TierContextSources;
  allowedSourceDescription: string;
  governance: true;
} {
  const sources = TIER_CONTEXT_SOURCES[tier];
  return {
    tierUpOnly: true as const,
    sources,
    allowedSourceDescription: formatTierContextSourceDescription(sources, tier),
    governance: true,
  };
}

/** Max characters for continuity summary in the short planning prompt. */
const CONTINUITY_SUMMARY_MAX = 600;

/**
 * Extract the last "Where we left off" and "What you need to start" blocks from handoff text
 * and return a curated 3–5 sentence summary. Caps at CONTINUITY_SUMMARY_MAX chars.
 */
export function buildContinuitySummary(
  handoffText: string | undefined,
  _logText: string | undefined,
  tier: TierName
): string {
  if (!handoffText?.trim()) {
    return `No prior handoff for this ${tier}.`;
  }
  const whereRe = /\*\*Where we left off:\*\*\s*([\s\S]*?)(?=\n\*\*|\n##|\n---|\n<!-- end excerpt|$)/gi;
  const whatRe = /\*\*What you need to start:\*\*\s*([\s\S]*?)(?=\n\*\*|\n##|\n---|\n<!-- end excerpt|$)/gi;
  const whereMatches = [...handoffText.matchAll(whereRe)];
  const whatMatches = [...handoffText.matchAll(whatRe)];
  const lastWhere = whereMatches.length > 0 ? whereMatches[whereMatches.length - 1][1].trim() : '';
  const lastWhat = whatMatches.length > 0 ? whatMatches[whatMatches.length - 1][1].trim() : '';
  const combined = [lastWhere, lastWhat].filter(Boolean).join(' ');
  if (!combined) {
    return `No prior handoff for this ${tier}.`;
  }
  const trimmed = combined.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= CONTINUITY_SUMMARY_MAX) {
    return trimmed;
  }
  return trimmed.slice(0, CONTINUITY_SUMMARY_MAX) + ' (See full handoff linked below)';
}

/** Tier-aware reference paths for the short planning doc (links only). */
export interface ReferencePaths {
  tierUpGuide: string;
  handoff: string | null;
  auditReportsDir: string;
  playbooks: string[];
}

const GOVERNANCE_PLAYBOOKS = [
  '.project-manager/TYPE_AUTHORING_PLAYBOOK.md',
  '.project-manager/COMPOSABLE_AUTHORING_PLAYBOOK.md',
  '.project-manager/FUNCTION_AUTHORING_PLAYBOOK.md',
  '.project-manager/COMPONENT_AUTHORING_PLAYBOOK.md',
];

/**
 * Build tier-aware reference file paths for the planning doc Reference section.
 * Paths are relative to repo root.
 */
export function buildReferencePaths(
  tier: TierName,
  identifier: string,
  context: WorkflowCommandContext
): ReferencePaths {
  const basePath = context.paths.getBasePath();
  let tierUpGuide: string;
  let handoff: string | null = null;

  if (tier === 'feature') {
    tierUpGuide = context.paths.getFeatureGuidePath();
    handoff = context.paths.getFeatureHandoffPath();
  } else if (tier === 'phase') {
    tierUpGuide = context.paths.getFeatureGuidePath();
    const prevPhaseId = WorkflowId.getPreviousSiblingId(identifier, 'phase');
    handoff = prevPhaseId ? context.paths.getPhaseHandoffPath(prevPhaseId) : null;
  } else if (tier === 'session') {
    const parsed = WorkflowId.parseSessionId(identifier);
    tierUpGuide = parsed ? context.paths.getPhaseGuidePath(parsed.phaseId) : `${basePath}/phases/phase-?.?.?-guide.md`;
    const prevSessionId = WorkflowId.getPreviousSiblingId(identifier, 'session');
    handoff = prevSessionId ? context.paths.getSessionHandoffPath(prevSessionId) : null;
  } else {
    const parsed = WorkflowId.parseTaskId(identifier);
    const sessionId = parsed?.sessionId ?? '';
    tierUpGuide = context.paths.getSessionGuidePath(sessionId);
    const prevTaskId = WorkflowId.getPreviousSiblingId(identifier, 'task');
    handoff = prevTaskId ? context.paths.getTaskHandoffPath(prevTaskId) : null;
  }

  return {
    tierUpGuide,
    handoff,
    auditReportsDir: 'client/.audit-reports/',
    playbooks: [...GOVERNANCE_PLAYBOOKS],
  };
}
