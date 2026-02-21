/**
 * Shared: Resolve planning description (identifier-only; no tier requires description)
 *
 * When the user omits a description, we derive one from docs (feature guide, phase guide,
 * session guide) or tier-specific fallback. Every tier has a derivation path so a string
 * is always returned.
 */

import type { PlanningTier } from '../../utils/planning-types';
import type { WorkflowCommandContext } from '../../utils/command-context';
import { MarkdownUtils } from '../../utils/markdown-utils';
import { WorkflowId } from '../../utils/id-utils';
import { deriveSessionDescription } from '../../tiers/session/composite/session-end-impl';

export interface ResolvePlanningDescriptionParams {
  tier: PlanningTier;
  identifier: string;
  feature: string;
  context: WorkflowCommandContext;
  description?: string;
}

/**
 * Resolve description for planning: use provided description or derive from docs.
 * No tier requires description; derivation + fallback always return a string.
 */
export async function resolvePlanningDescription(
  params: ResolvePlanningDescriptionParams
): Promise<string> {
  const { tier, identifier, context, description } = params;
  if (description !== undefined && description !== null && description.trim() !== '') {
    return description.trim();
  }
  switch (tier) {
    case 'phase':
      return derivePhaseDescription(identifier, context);
    case 'session':
      return deriveSessionDescription(identifier, context);
    case 'feature':
      return deriveFeatureDescription(identifier, context);
    case 'task':
      return deriveTaskDescription(identifier, context);
    default:
      return `${tier} ${identifier}`;
  }
}

/**
 * Derive phase description from phase guide then feature guide Phases Breakdown.
 */
export async function derivePhaseDescription(
  phase: string,
  context: WorkflowCommandContext
): Promise<string> {
  try {
    const phaseGuideContent = await context.readPhaseGuide(phase);
    const phaseSection = MarkdownUtils.extractSection(phaseGuideContent, `Phase ${phase}`);
    if (phaseSection) {
      const firstLine = phaseSection.split('\n').find((l) => l.trim().length > 0);
      if (firstLine && !firstLine.trim().startsWith('#')) {
        return firstLine.trim().replace(/^#+\s*/, '').slice(0, 200);
      }
      const titleMatch = phaseSection.match(/^#+\s*Phase\s+[\d.]+\s*[:-]?\s*(.+?)(?:\n|$)/im);
      if (titleMatch) return titleMatch[1].trim().slice(0, 200);
    }
  } catch (err) {
    console.warn('Resolve planning description: phase guide not found or failed to read', phase, err);
  }
  try {
    const featureGuide = await context.readFeatureGuide();
    const phasesMatch = featureGuide.match(
      new RegExp(`(?:###\\s+)?Phase\\s+${phase.replace(/\./g, '\\.')}\\s*[:-]\\s*(.+?)(?:\\n|$)`, 'im')
    );
    if (phasesMatch) return phasesMatch[1].trim().slice(0, 200);
  } catch (err) {
    console.warn('Resolve planning description: feature guide not found or failed to read', err);
  }
  return `Phase ${phase} planning`;
}

/**
 * Derive feature description from feature guide overview/objectives.
 */
export async function deriveFeatureDescription(
  featureName: string,
  context: WorkflowCommandContext
): Promise<string> {
  try {
    const featureGuide = await context.readFeatureGuide();
    const overview = MarkdownUtils.extractSection(featureGuide, 'Feature Overview', {
      includeSubsections: true,
    });
    if (overview) {
      const descMatch = overview.match(/\*\*Description:\*\*\s*(.+?)(?:\n|$)/im);
      if (descMatch) return descMatch[1].trim().slice(0, 300);
    }
    const objectives = MarkdownUtils.extractSection(featureGuide, 'Feature Objectives', {
      includeSubsections: true,
    });
    if (objectives) {
      const firstBullet = objectives.match(/^-\s*(.+?)(?:\n|$)/m);
      if (firstBullet) return firstBullet[1].trim().slice(0, 300);
    }
  } catch (err) {
    console.warn('Resolve planning description: feature guide not found or failed to read', featureName, err);
  }
  return `Feature: ${featureName}`;
}

/**
 * Derive task description from session guide task list.
 */
export async function deriveTaskDescription(
  taskId: string,
  context: WorkflowCommandContext
): Promise<string> {
  const parsed = WorkflowId.parseTaskId(taskId);
  if (!parsed) return `Task ${taskId}`;
  const sessionId = parsed.sessionId;
  try {
    const sessionGuide = await context.readSessionGuide(sessionId);
    const escapedTaskId = taskId.replace(/\./g, '\\.');
    const taskRegex = new RegExp(
      `(?:###|####)\\s+Task\\s+${escapedTaskId}\\s*[:-]?\\s*(.+?)(?=\\n|$)`,
      'im'
    );
    const match = sessionGuide.match(taskRegex);
    if (match) return match[1].trim().slice(0, 200);
  } catch (err) {
    console.warn('Resolve planning description: session guide not found or failed to read', sessionId, err);
  }
  return `Task ${taskId}`;
}
