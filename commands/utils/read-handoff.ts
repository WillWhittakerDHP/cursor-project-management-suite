/**
 * Atomic Command: /read-handoff
 * Read and display transition context from handoff document
 * Focus: Where we left off, what's next (minimal context only)
 * 
 * @param tier Optional tier ('phase' | 'session' | 'task')
 * @param identifier Optional identifier (phase number, session ID, or task ID)
 * @param featureName Optional: resolved from .current-feature or git branch
 */

import { WorkflowCommandContext } from './command-context';
import { MarkdownUtils } from './markdown-utils';
import { WorkflowId } from './id-utils';
import { resolveFeatureName } from './feature-context';
import { readProjectFile, writeProjectFile, getCurrentDate } from './utils';

export type HandoffTier = 'phase' | 'session' | 'task';

interface TierDocumentationStatus {
  exists: boolean;
  reason: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readProjectFile(path);
    return true;
  } catch {
    return false;
  }
}

async function getTierDocumentationStatus(
  context: WorkflowCommandContext,
  tier: HandoffTier,
  identifier: string
): Promise<TierDocumentationStatus> {
  if (tier === 'phase') {
    const escapedPhase = escapeRegExp(identifier);
    const phaseGuidePath = context.paths.getPhaseGuidePath(identifier);
    const phaseLogPath = context.paths.getPhaseLogPath(identifier);
    const phaseHandoffPath = context.paths.getPhaseHandoffPath(identifier);
    const [hasPhaseGuide, hasPhaseLog, hasPhaseHandoff] = await Promise.all([
      fileExists(phaseGuidePath),
      fileExists(phaseLogPath),
      fileExists(phaseHandoffPath),
    ]);

    let listedInFeatureGuide = false;
    try {
      const featureGuide = await context.readFeatureGuide();
      listedInFeatureGuide = new RegExp(`\\bPhase\\s+${escapedPhase}(?::|\\b)`, 'i').test(featureGuide);
    } catch {
      listedInFeatureGuide = false;
    }

    if (listedInFeatureGuide || hasPhaseGuide || hasPhaseLog || hasPhaseHandoff) {
      return {
        exists: true,
        reason: listedInFeatureGuide
          ? `Phase ${identifier} is listed in the feature guide.`
          : `Phase ${identifier} has existing tier documentation.`,
      };
    }

    return {
      exists: false,
      reason: `Phase ${identifier} is not listed in the feature guide and has no phase guide/log/handoff files.`,
    };
  }

  if (tier === 'session') {
    const parsedSession = WorkflowId.parseSessionId(identifier);
    if (!parsedSession) {
      return { exists: false, reason: `Invalid session ID format: ${identifier}` };
    }

    const escapedSession = escapeRegExp(identifier);
    const sessionGuidePath = context.paths.getSessionGuidePath(identifier);
    const sessionLogPath = context.paths.getSessionLogPath(identifier);
    const sessionHandoffPath = context.paths.getSessionHandoffPath(identifier);
    const [hasSessionGuide, hasSessionLog, hasSessionHandoff] = await Promise.all([
      fileExists(sessionGuidePath),
      fileExists(sessionLogPath),
      fileExists(sessionHandoffPath),
    ]);

    let listedInPhaseGuide = false;
    try {
      const phaseGuide = await context.readPhaseGuide(parsedSession.phaseId);
      listedInPhaseGuide = new RegExp(`\\bSession\\s+${escapedSession}(?::|\\b)`, 'i').test(phaseGuide);
    } catch {
      listedInPhaseGuide = false;
    }

    if (listedInPhaseGuide || hasSessionGuide || hasSessionLog || hasSessionHandoff) {
      return {
        exists: true,
        reason: listedInPhaseGuide
          ? `Session ${identifier} is listed in phase ${parsedSession.phaseId} guide.`
          : `Session ${identifier} has existing tier documentation.`,
      };
    }

    return {
      exists: false,
      reason: `Session ${identifier} is not listed in phase ${parsedSession.phaseId} guide and has no session guide/log/handoff files.`,
    };
  }

  const parsedTask = WorkflowId.parseTaskId(identifier);
  if (!parsedTask) {
    return { exists: false, reason: `Invalid task ID format: ${identifier}` };
  }

  const escapedTask = escapeRegExp(identifier);
  let listedInSessionGuide = false;
  try {
    const sessionGuide = await context.readSessionGuide(parsedTask.sessionId);
    listedInSessionGuide = new RegExp(`(?:####|###)\\s*Task\\s+${escapedTask}(?::|\\b)`, 'i').test(sessionGuide);
  } catch {
    listedInSessionGuide = false;
  }

  if (listedInSessionGuide) {
    return { exists: true, reason: `Task ${identifier} is listed in session ${parsedTask.sessionId} guide.` };
  }

  return {
    exists: false,
    reason: `Task ${identifier} is not listed in session ${parsedTask.sessionId} guide.`,
  };
}

async function createMissingHandoffFromTemplate(
  context: WorkflowCommandContext,
  tier: HandoffTier,
  identifier: string
): Promise<void> {
  const applyLiteralPlaceholders = (template: string, replacements: Record<string, string>): string => {
    let result = template;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.split(`[${key}]`).join(value);
    }
    return result;
  };

  const date = getCurrentDate();
  let handoffPath: string;
  let rendered: string;

  if (tier === 'phase') {
    const nextPhase = Number(identifier) + 1;
    handoffPath = context.paths.getPhaseHandoffPath(identifier);
    const template = await context.templates.loadTemplate('phase', 'handoff');
    rendered = applyLiteralPlaceholders(template, {
      N: identifier,
      DATE: date,
      Date: date,
      'N+1': Number.isFinite(nextPhase) ? String(nextPhase) : '',
      'Complete / In Progress': 'In Progress',
    })
      .replace(/\[N\+1\]/g, Number.isFinite(nextPhase) ? String(nextPhase) : '')
      .replace(/\[Complete \/ In Progress\]/g, 'In Progress');
  } else {
    const sessionId = tier === 'task'
      ? (WorkflowId.parseTaskId(identifier)?.sessionId ?? identifier)
      : identifier;
    const parsed = WorkflowId.parseSessionId(sessionId);
    handoffPath = context.paths.getSessionHandoffPath(sessionId);
    const template = await context.templates.loadTemplate('session', 'handoff');
    rendered = applyLiteralPlaceholders(template, {
      SESSION_ID: sessionId,
      DESCRIPTION: `Session ${sessionId}`,
      DATE: date,
      Date: date,
      NEXT_SESSION: '',
      LAST_TASK: '',
      PHASE: parsed?.phaseId ?? '',
      'Complete / In Progress': 'In Progress',
    })
      .replace(/\[Complete \/ In Progress\]/g, 'In Progress');
  }

  await writeProjectFile(handoffPath, rendered);
}

export async function readHandoff(
  tier?: HandoffTier,
  identifier?: string,
  featureName?: string
): Promise<string> {
  const resolved = await resolveFeatureName(featureName);
  const context = new WorkflowCommandContext(resolved);
  
  let content: string;

  // Determine handoff path based on tier
  if (tier === 'phase' && identifier) {
    try {
      content = await context.readPhaseHandoff(identifier);
    } catch (_error) {
      const docs = await getTierDocumentationStatus(context, 'phase', identifier);
      if (!docs.exists) {
        throw new Error(
          `ERROR: phase-specific handoff not found and phase is not documented\n` +
          `Attempted: ${context.paths.getPhaseHandoffPath(identifier)}\n` +
          `Tier existence check: ${docs.reason}\n` +
          `Suggestion: Add Phase ${identifier} to the feature guide/phase docs before starting it\n` +
          `Error: ${_error instanceof Error ? _error.message : String(_error)}`
        );
      }
      try {
        await createMissingHandoffFromTemplate(context, 'phase', identifier);
        content = await context.readPhaseHandoff(identifier);
      } catch (createError) {
        throw new Error(
          `ERROR: phase-specific handoff missing and auto-create failed\n` +
          `Attempted: ${context.paths.getPhaseHandoffPath(identifier)}\n` +
          `Tier existence check: ${docs.reason}\n` +
          `Suggestion: Create the phase handoff file from phase template, then retry\n` +
          `Error: ${createError instanceof Error ? createError.message : String(createError)}`
        );
      }
    }
  } else if (tier === 'session' && identifier) {
    if (!WorkflowId.isValidSessionId(identifier)) {
      throw new Error(`ERROR: Invalid session ID format. Expected X.Y.Z (e.g., 4.1.3)\nAttempted: ${identifier}`);
    }
    try {
      content = await context.readSessionHandoff(identifier);
    } catch (_error) {
      const docs = await getTierDocumentationStatus(context, 'session', identifier);
      if (!docs.exists) {
        throw new Error(
          `ERROR: session-specific handoff not found and session is not documented\n` +
          `Attempted: ${context.paths.getSessionHandoffPath(identifier)}\n` +
          `Tier existence check: ${docs.reason}\n` +
          `Suggestion: Add Session ${identifier} to phase docs or create its guide before starting it\n` +
          `Error: ${_error instanceof Error ? _error.message : String(_error)}`
        );
      }
      try {
        await createMissingHandoffFromTemplate(context, 'session', identifier);
        content = await context.readSessionHandoff(identifier);
      } catch (createError) {
        throw new Error(
          `ERROR: session-specific handoff missing and auto-create failed\n` +
          `Attempted: ${context.paths.getSessionHandoffPath(identifier)}\n` +
          `Tier existence check: ${docs.reason}\n` +
          `Suggestion: Create the session handoff file from session template, then retry\n` +
          `Error: ${createError instanceof Error ? createError.message : String(createError)}`
        );
      }
    }
  } else if (tier === 'task' && identifier) {
    // Task context is within session handoff
    // Parse task ID to get session ID
    const parsedTask = WorkflowId.parseTaskId(identifier);
    if (!parsedTask) {
      throw new Error(`ERROR: Invalid task ID format. Expected X.Y.Z.A (e.g., 4.1.3.1)\nAttempted: ${identifier}`);
    }
    const sessionId = parsedTask.sessionId;
    try {
      content = await context.readSessionHandoff(sessionId);
    } catch (_error) {
      const docs = await getTierDocumentationStatus(context, 'task', identifier);
      if (!docs.exists) {
        throw new Error(
          `ERROR: session handoff not found for task ${identifier} and task is not documented\n` +
          `Attempted: ${context.paths.getSessionHandoffPath(sessionId)}\n` +
          `Tier existence check: ${docs.reason}\n` +
          `Suggestion: Add Task ${identifier} to session guide before starting it\n` +
          `Error: ${_error instanceof Error ? _error.message : String(_error)}`
        );
      }
      try {
        await createMissingHandoffFromTemplate(context, 'task', identifier);
        content = await context.readSessionHandoff(sessionId);
      } catch (createError) {
        throw new Error(
          `ERROR: session handoff missing for task ${identifier} and auto-create failed\n` +
          `Attempted: ${context.paths.getSessionHandoffPath(sessionId)}\n` +
          `Tier existence check: ${docs.reason}\n` +
          `Suggestion: Create session handoff from session template, then retry task-start\n` +
          `Error: ${createError instanceof Error ? createError.message : String(createError)}`
        );
      }
    }
  } else {
    // No tier specified, use feature handoff
    try {
      content = await context.readFeatureHandoff();
    } catch (_error) {
      throw new Error(
        `ERROR: Feature handoff not found\n` +
        `Attempted: ${context.paths.getFeatureHandoffPath()}\n` +
        `Error: ${_error instanceof Error ? _error.message : String(_error)}`
      );
    }
  }
  
  // Focus on transition context only
  const sections = [
    'Current Status',
    'Next Action',
    'Transition Context', // New minimal context section
  ];
  
  const output: string[] = [];
  
  for (const section of sections) {
    const sectionContent = MarkdownUtils.extractSection(content, section);
    if (sectionContent) {
      output.push(sectionContent);
      output.push('');
    }
  }
  
  // If no sections found, return minimal message
  if (output.length === 0) {
    return '**No transition context found. Check handoff document.**';
  }
  
  return output.join('\n');
}

