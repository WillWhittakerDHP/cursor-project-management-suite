/**
 * Phase and Session Utilities
 * 
 * Utilities for checking phase/session relationships and status
 */

import { WorkflowCommandContext } from './command-context';
import { WorkflowId } from './id-utils';

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
  const phaseGuide = await context.readPhaseGuide(parsed.phase.toString());
  
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
    return aParsed.session - bParsed.session;
  });

  return sortedSessions[sortedSessions.length - 1] === sessionId;
}

/**
 * Get all session IDs from a phase guide
 */
function extractSessionIds(guide: string): string[] {
  const sessionMatches = guide.matchAll(/Session\s+(\d+\.\d+):/g);
  const sessionIds: string[] = [];
  for (const match of sessionMatches) {
    if (WorkflowId.isValidSessionId(match[1])) {
      sessionIds.push(match[1]);
    }
  }
  return sessionIds;
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
 * Get phase number from session ID
 */
export function getPhaseFromSessionId(sessionId: string): number | null {
  const parsed = WorkflowId.parseSessionId(sessionId);
  return parsed ? parsed.phase : null;
}

