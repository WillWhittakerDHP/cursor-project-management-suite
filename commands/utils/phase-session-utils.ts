/**
 * Phase and Session Utilities
 * 
 * Utilities for checking phase/session relationships and status
 */

import { readdir } from 'fs/promises';
import { join } from 'path';
import { WorkflowCommandContext } from './command-context';
import { WorkflowId } from './id-utils';
import { PROJECT_ROOT } from './utils';

/**
 * Check if a session is the last session in its phase
 */
export async function isLastSessionInPhase(
  feature: string,
  sessionId: string
): Promise<boolean> {
  const parsed = WorkflowId.parseSessionId(sessionId);
  if (!parsed) {
    return false;
  }

  const context = new WorkflowCommandContext(feature);
  const phaseGuide = await context.readPhaseGuide(parsed.phaseId);
  
  // Extract all session IDs from phase guide
  const sessionIds = extractSessionIds(phaseGuide);
  
  if (sessionIds.length === 0) {
    return false;
  }

  // Sort sessions and check if this is the last one
  const sortedSessions = sessionIds.sort((a, b) => {
    const aParsed = WorkflowId.parseSessionId(a);
    const bParsed = WorkflowId.parseSessionId(b);
    if (!aParsed || !bParsed) return 0;
    return Number(aParsed.session) - Number(bParsed.session);
  });

  return sortedSessions[sortedSessions.length - 1] === sessionId;
}

/**
 * Get all session IDs from a phase guide
 */
function extractSessionIds(guide: string): string[] {
  const sessionMatches = guide.matchAll(/Session\s+(\d+\.\d+\.\d+):/g);
  const sessionIds: string[] = [];
  for (const match of sessionMatches) {
    if (WorkflowId.isValidSessionId(match[1])) {
      sessionIds.push(match[1]);
    }
  }
  return sessionIds;
}

/**
 * Extract session IDs that are marked complete in a phase guide.
 * Matches patterns like `- [x] ### Session X.Y.Z:` or `- [x] Session X.Y.Z:`.
 */
function extractCompletedSessionIds(guide: string): string[] {
  const completedMatches = guide.matchAll(/-\s*\[x\]\s*(?:###?\s*)?Session\s+(\d+\.\d+\.\d+):/gi);
  const ids: string[] = [];
  for (const match of completedMatches) {
    if (WorkflowId.isValidSessionId(match[1])) {
      ids.push(match[1]);
    }
  }
  return ids;
}

/**
 * Get the list of completed session IDs for a phase by reading the phase guide.
 * Used by phaseEnd when called with just a string ID (auto-derives completedSessions).
 */
export async function getCompletedSessionsInPhase(
  feature: string,
  phaseId: string
): Promise<string[]> {
  const context = new WorkflowCommandContext(feature);
  const phaseGuide = await context.readPhaseGuide(phaseId);
  return extractCompletedSessionIds(phaseGuide);
}

/**
 * Check if all sessions in a phase are completed
 */
export async function areAllSessionsCompleted(
  feature: string,
  phase: number
): Promise<boolean> {
  const context = new WorkflowCommandContext(feature);
  const phaseGuide = await context.readPhaseGuide(phase.toString());
  
  const sessionIds = extractSessionIds(phaseGuide);
  
  // Check if all sessions are marked as completed in the guide
  for (const sessionId of sessionIds) {
    // Look for checkbox pattern: - [x] Session X.Y
    const sessionRegex = new RegExp(`-\\s*\\[x\\]\\s*Session\\s+${sessionId.replace(/\./g, '\\.')}`, 'i');
    if (!sessionRegex.test(phaseGuide)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get phase ID from session ID (X.Y.Z → X.Y)
 */
export function getPhaseFromSessionId(sessionId: string): string | null {
  const parsed = WorkflowId.parseSessionId(sessionId);
  return parsed ? parsed.phaseId : null;
}

/**
 * Check if all tasks in a session are marked complete in the session guide.
 * Used by task-end to prompt for session-end when no incomplete tasks remain.
 */
export async function areAllTasksInSessionComplete(
  feature: string,
  sessionId: string
): Promise<boolean> {
  const context = new WorkflowCommandContext(feature);
  const guideContent = await context.readSessionGuide(sessionId);
  // Session guide uses "- [ ] #### Task X.Y.Z:" for incomplete; we just marked current task [x]
  // Any unchecked task line for this session (task ID starts with sessionId.) means not all complete
  // Match unchecked checkbox line that contains a task ID for this session (X.Y.Z where X.Y = sessionId)
  const uncheckedTaskPattern = new RegExp(
    `-\\s*\\[\\s\\][^\\n]*Task\\s+${sessionId.replace(/\./g, '\\.')}\\.\\d+`,
    'gi'
  );
  return !uncheckedTaskPattern.test(guideContent);
}

/**
 * Get all phase IDs for a feature (from disk). Exported for featureEnd auto-derive.
 * Returns numerically sorted array of phase ID strings (e.g. ['6.5', '6.9', '6.10', '6.11']).
 */
export async function getPhaseIdsFromDisk(feature: string): Promise<string[]> {
  const phasesDir = join(PROJECT_ROOT, '.project-manager/features', feature, 'phases');
  let entries: string[];
  try {
    entries = await readdir(phasesDir);
  } catch (err) {
    console.warn('Phase session utils: phases dir not found or unreadable', phasesDir, err);
    return [];
  }
  const phaseIds = entries
    .map((name) => {
      const m = name.match(/^phase-([\d.]+)-guide\.md$/);
      return m ? m[1] : null;
    })
    .filter((id): id is string => id !== null);
  return phaseIds.sort((a, b) => {
    const [aMajor, aMinor] = a.split('.').map(Number);
    const [bMajor, bMinor] = b.split('.').map(Number);
    return aMajor !== bMajor ? aMajor - bMajor : (aMinor ?? 0) - (bMinor ?? 0);
  });
}

/**
 * Check if this phase is the last phase in the feature (by listing phase guides on disk).
 * Used by phase-end to prompt for feature-end when no more phases remain.
 */
export async function isLastPhaseInFeature(feature: string, phase: string): Promise<boolean> {
  const phaseIds = await getPhaseIdsFromDisk(feature);
  if (phaseIds.length === 0) return false;
  return phaseIds.includes(phase) && phaseIds[phaseIds.length - 1] === phase;
}

/**
 * Return the next phase ID after the given one, or null if this is the last.
 * Scans phase guide files on disk so it works without explicit nextPhase params.
 */
export async function getNextPhaseInFeature(feature: string, phase: string): Promise<string | null> {
  const phaseIds = await getPhaseIdsFromDisk(feature);
  const idx = phaseIds.indexOf(phase);
  if (idx < 0 || idx >= phaseIds.length - 1) return null;
  return phaseIds[idx + 1];
}

