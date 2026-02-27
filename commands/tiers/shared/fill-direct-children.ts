/**
 * Fill implementation-plan fields for all direct children during parent-start.
 * Shared by all tiers: feature→phase, phase→session, session→task.
 * Runs in execute mode only; called from tier-start workflow step.
 */

import type { TierStartWorkflowContext } from './tier-start-workflow';
import type { WorkflowCommandContext } from '../../utils/command-context';
import { readProjectFile, writeProjectFile } from '../../utils/utils';

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
 * Session → task: fill Goal, Files, Approach, Checkpoint in each task section from session scope.
 */
async function fillTaskSectionsInSessionGuide(
  sessionId: string,
  scopeDescription: string,
  context: WorkflowCommandContext
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
    const newGoal = needsFill(goal) ? (scopeDescription || 'Implement per session scope above.') : goal;
    const newFiles = needsFill(files) ? '(See session guide and phase context above.)' : files;
    const newApproach = needsFill(approach) ? 'See session scope above.' : approach;
    const newCheckpoint = needsFill(checkpoint) ? 'Verify per session success criteria.' : checkpoint;
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
  if (replacements.length > 0) await writeProjectFile(guidePath, content);
}

/**
 * Phase → session: fill Description, Tasks, Learning Goals in each session section from phase scope.
 */
async function fillSessionSectionsInPhaseGuide(
  phaseId: string,
  scopeDescription: string,
  context: WorkflowCommandContext
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
    const learning = extractField('Learning Goals', sessionBody);
    if (!needsFill(desc) && !needsFill(tasks) && !needsFill(learning)) continue;
    const newDesc = needsFill(desc) ? (scopeDescription || 'See phase scope above.') : desc;
    const newTasks = needsFill(tasks) ? '[To be planned]' : tasks;
    const newLearning = needsFill(learning) ? '- [To be identified during planning]' : learning;
    const newSection = [
      firstLine,
      '',
      '**Description:** ' + newDesc,
      '',
      '**Tasks:** ' + newTasks,
      '',
      '**Learning Goals:**',
      '- ' + newLearning,
    ].join('\n');
    replacements.push({ from: fullMatch, to: newSection });
  }
  for (const { from, to } of replacements) {
    content = content.replace(from, to);
  }
  if (replacements.length > 0) await writeProjectFile(guidePath, content);
}

/**
 * Feature → phase: fill Description, Sessions, Success Criteria in each phase section from feature scope.
 */
async function fillPhaseSectionsInFeatureGuide(
  scopeDescription: string,
  context: WorkflowCommandContext
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
    const newDesc = needsFill(desc) ? (scopeDescription || 'See feature scope above.') : desc;
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
  if (replacements.length > 0) await writeProjectFile(guidePath, content);
}

/**
 * Fill implementation-plan fields for all direct children in the parent guide.
 * Dispatches by parent tier (feature → phases, phase → sessions, session → tasks).
 * No-op for task tier (no children). Idempotent: only fills empty/placeholder fields.
 */
export async function fillDirectChildrenInParentGuide(ctx: TierStartWorkflowContext): Promise<void> {
  const { config, identifier, context, resolvedDescription } = ctx;
  const scope = resolvedDescription ?? identifier;
  if (config.name === 'task') return;
  try {
    if (config.name === 'session') {
      await fillTaskSectionsInSessionGuide(identifier, scope, context);
    } else if (config.name === 'phase') {
      await fillSessionSectionsInPhaseGuide(identifier, scope, context);
    } else if (config.name === 'feature') {
      await fillPhaseSectionsInFeatureGuide(scope, context);
    }
  } catch (err) {
    console.warn('fill-direct-children: non-blocking failure', config.name, identifier, err);
  }
}
