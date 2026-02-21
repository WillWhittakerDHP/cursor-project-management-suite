/**
 * Atomic Command: /create-session-label [sessionId] [description]
 * Generate session label with date/status
 * Session ID format: X.Y.Z (Feature.Phase.Session)
 */

import { getCurrentDate } from '../../../utils/utils';
import { WorkflowId } from '../../../utils/id-utils';

export interface SessionLabel {
  sessionId: string;
  description: string;
  date: string;
  status: string;
  agent: string;
}

export function createSessionLabel(
  sessionId: string,
  description: string
): SessionLabel {
  const parsed = WorkflowId.parseSessionId(sessionId);
  if (!parsed) {
    throw new Error(`Invalid session ID format: "${sessionId}". Expected format: "X.Y.Z" (e.g., "4.1.3").`);
  }
  
  return {
    sessionId: sessionId.trim(),
    description,
    date: getCurrentDate(),
    status: 'In Progress',
    agent: 'Current',
  };
}

export function formatSessionLabel(label: SessionLabel): string {
  return `## Session: ${label.sessionId} - ${label.description}
**Date:** ${label.date}
**Duration:** [Estimated]
**Status:** ${label.status}
**Agent:** ${label.agent}
`;
}

