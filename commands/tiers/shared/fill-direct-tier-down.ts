/**
 * Fill implementation-plan fields for all direct tierDown in the current-tier guide during tier-start.
 * Shared by all tiers (each tier fills its tierDown sections from tierUp scope). Uses tierUp/tierDown
 * language only; no parent/child or concrete tier names in generic prose. Execute mode only; tier-start step.
 */

import type { TierStartWorkflowContext } from './tier-start-workflow-types';
import type { WorkflowCommandContext } from '../../utils/command-context';
import { readProjectFile } from '../../utils/utils';

const PLACEHOLDER_PATTERN = /\[Fill in\]|\[Files to work with\]|\[What needs to be verified\]|\[To be planned\]|\[To be identified during planning\]|\[To be defined\]/i;

function extractField(name: string, content: string): string {
  const re = new RegExp(`\\*\\*${name}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*|\\n\\n|$)`, 'i');
  const m = content.match(re);
  return m ? m[1].trim() : '';
}

function needsFill(value: string): boolean {
  if (!value || value.trim() === '') return true;
  return PLACEHOLDER_PATTERN.test(value);
}

/**
 * Fill tierDown sections: Goal, Files, Approach, Checkpoint from tierUp scope.
 * When mode is 'light', uses minimal placeholders; 'moderate'/'explicit' use fuller text.
 */
async function fillTaskSectionsInSessionGuide(
  sessionId: string,
  scopeDescription: string,
  context: WorkflowCommandContext,
  mode: DecompositionModeForFill
): Promise<void> {
  const guidePath = context.paths.getSessionGuidePath(sessionId);
  let content = await readProjectFile(guidePath);
  const taskSectionRegex = new RegExp(
    `((-?\\s*\\[[ x]\\])?\\s*(?:####|###) Task \\d+\\.\\d+\\.\\d+\\.\\d+:[^\\n]*)([\\s\\S]*?)(?=(?:-?\\s*\\[|#### Task|### Task|## |$))`,
    'g'
  );
  let match: RegExpMatchArray | null;
  const replacements: { from: string; to: string }[] = [];
  while ((match = taskSectionRegex.exec(content)) !== null) {
    const fullMatch = match[0];
    const firstLine = match[1];
    const taskBody = match[2];
    const goal = extractField('Goal', taskBody);
    const files = extractField('Files', taskBody);
    const approach = extractField('Approach', taskBody);
    const checkpoint = extractField('Checkpoint', taskBody);
    if (!needsFill(goal) && !needsFill(files) && !needsFill(approach) && !needsFill(checkpoint)) continue;
    const isLight = mode === 'light';
    const newGoal = needsFill(goal) ? (scopeDescription || (isLight ? 'Implement per tierUp.' : 'Implement per tierUp scope above.')) : goal;
    const newFiles = needsFill(files) ? (isLight ? '(See tierUp.)' : '(See tierUp guide and context above.)') : files;
    const newApproach = needsFill(approach) ? (isLight ? 'See tierUp.' : 'See tierUp scope above.') : approach;
    const newCheckpoint = needsFill(checkpoint) ? (isLight ? 'Verify per tierUp.' : 'Verify per tierUp success criteria.') : checkpoint;
    const newSection = [
      firstLine,
      '',
      '**Goal:** ' + newGoal,
      '',
      '**Files:**',
      newFiles,
      '',
      '**Approach:** ' + newApproach,
      '',
      '**Checkpoint:** ' + newCheckpoint,
    ].join('\n');
    replacements.push({ from: fullMatch, to: newSection });
  }
  for (const { from, to } of replacements) {
    content = content.replace(from, to);
  }
  if (replacements.length > 0) {
    await context.documents.updateGuide('session', sessionId, () => content);
  }
}

/**
 * Fill tierDown sections: Description, Tasks from tierUp scope.
 */
async function fillSessionSectionsInPhaseGuide(
  phaseId: string,
  scopeDescription: string,
  context: WorkflowCommandContext,
  mode: DecompositionModeForFill
): Promise<void> {
  const guidePath = context.paths.getPhaseGuidePath(phaseId);
  let content = await readProjectFile(guidePath);
  const sessionSectionRegex = new RegExp(
    `((-?\\s*\\[[ x]\\])?\\s*### Session \\d+\\.\\d+\\.\\d+:[^\\n]*)([\\s\\S]*?)(?=(?:-?\\s*\\[|### Session|## |$))`,
    'g'
  );
  let match: RegExpMatchArray | null;
  const replacements: { from: string; to: string }[] = [];
  while ((match = sessionSectionRegex.exec(content)) !== null) {
    const fullMatch = match[0];
    const firstLine = match[1];
    const sessionBody = match[2];
    const desc = extractField('Description', sessionBody);
    const tasks = extractField('Tasks', sessionBody);
    if (!needsFill(desc) && !needsFill(tasks)) continue;
    const isLight = mode === 'light';
    const newDesc = needsFill(desc) ? (scopeDescription || (isLight ? 'See tierUp.' : 'See tierUp scope above.')) : desc;
    const newTasks = needsFill(tasks) ? '[To be planned]' : tasks;
    const newSection = [
      firstLine,
      '',
      '**Description:** ' + newDesc,
      '',
      '**Tasks:** ' + newTasks,
    ].join('\n');
    replacements.push({ from: fullMatch, to: newSection });
  }
  for (const { from, to } of replacements) {
    content = content.replace(from, to);
  }
  if (replacements.length > 0) {
    await context.documents.updateGuide('phase', phaseId, () => content);
  }
}

/**
 * Fill tierDown sections: Description, Sessions, Success Criteria from tierUp scope.
 */
async function fillPhaseSectionsInFeatureGuide(
  scopeDescription: string,
  context: WorkflowCommandContext,
  mode: DecompositionModeForFill
): Promise<void> {
  const guidePath = context.paths.getFeatureGuidePath();
  let content = await readProjectFile(guidePath);
  const phaseSectionRegex = new RegExp(
    `((-?\\s*\\[[ x]\\])?\\s*### Phase \\d+\\.\\d+:[^\\n]*)([\\s\\S]*?)(?=(?:-?\\s*\\[|### Phase|## |$))`,
    'g'
  );
  let match: RegExpMatchArray | null;
  const replacements: { from: string; to: string }[] = [];
  while ((match = phaseSectionRegex.exec(content)) !== null) {
    const fullMatch = match[0];
    const firstLine = match[1];
    const phaseBody = match[2];
    const desc = extractField('Description', phaseBody);
    const sessions = extractField('Sessions', phaseBody);
    const criteria = extractField('Success Criteria', phaseBody);
    if (!needsFill(desc) && !needsFill(sessions) && !needsFill(criteria)) continue;
    const isLight = mode === 'light';
    const newDesc = needsFill(desc) ? (scopeDescription || (isLight ? 'See tierUp.' : 'See tierUp scope above.')) : desc;
    const newSessions = needsFill(sessions) ? '[To be planned]' : sessions;
    const newCriteria = needsFill(criteria) ? '- [To be defined]' : criteria;
    const newSection = [
      firstLine,
      '',
      '**Description:** ' + newDesc,
      '',
      '**Sessions:** ' + newSessions,
      '',
      '**Success Criteria:**',
      '- ' + newCriteria,
    ].join('\n');
    replacements.push({ from: fullMatch, to: newSection });
  }
  for (const { from, to } of replacements) {
    content = content.replace(from, to);
  }
  if (replacements.length > 0) {
    await context.documents.updateGuide('feature', undefined, () => content);
  }
}

/** Decomposition mode from WorkProfile; controls fill intensity. Guide is authoritative for current-tier decomposition. */
export type DecompositionModeForFill = 'light' | 'moderate' | 'explicit';

/**
 * Fill implementation-plan fields for all direct tierDown in the current-tier guide.
 * Dispatches by current tier (each tier fills its tierDown sections).
 * No-op for lowest tier (no tierDown). Idempotent: only fills empty/placeholder fields.
 * When decompositionMode is 'light', uses minimal placeholders; 'explicit' allows richer content.
 * Guide owns the canonical child-unit list; planning doc is advisory.
 */
export async function fillDirectTierDownInGuide(ctx: TierStartWorkflowContext): Promise<void> {
  const { config, identifier, context, resolvedDescription, options } = ctx;
  const scope = resolvedDescription ?? identifier;
  const mode: DecompositionModeForFill = options?.workProfile?.decompositionMode ?? 'moderate';
  if (config.name === 'task') return; // lowest tier
  try {
    if (config.name === 'session') {
      await fillTaskSectionsInSessionGuide(identifier, scope, context, mode);
    } else if (config.name === 'phase') {
      await fillSessionSectionsInPhaseGuide(identifier, scope, context, mode);
    } else if (config.name === 'feature') {
      await fillPhaseSectionsInFeatureGuide(scope, context, mode);
    }
  } catch (err) {
    console.warn('fill-direct-tier-down: non-blocking failure', config.name, identifier, err);
  }
}
