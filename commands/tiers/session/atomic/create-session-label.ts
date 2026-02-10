/**
 * Atomic Command: /create-session-label [phase.sub-phase] [description]
 * Generate session label with date/status
 */

import { getCurrentDate } from '../../../utils/utils';

export interface SessionLabel {
  phase: string;
  subPhase: string;
  description: string;
  date: string;
  status: string;
  agent: string;
}

export function createSessionLabel(
  phaseSubPhase: string,
  description: string
): SessionLabel {
  const [phase, subPhase] = phaseSubPhase.split('.');
  
  // LEARNING: Explicit validation instead of fallback to empty string
  // WHY: Prevents silent failures - require valid phase/subPhase or throw error
  if (!phase || phase.trim() === '') {
    throw new Error(`Invalid phaseSubPhase format: "${phaseSubPhase}". Expected format: "X.Y" where X and Y are non-empty.`);
  }
  if (!subPhase || subPhase.trim() === '') {
    throw new Error(`Invalid phaseSubPhase format: "${phaseSubPhase}". Expected format: "X.Y" where X and Y are non-empty.`);
  }
  
  return {
    phase: phase.trim(),
    subPhase: subPhase.trim(),
    description,
    date: getCurrentDate(),
    status: 'In Progress',
    agent: 'Current',
  };
}

export function formatSessionLabel(label: SessionLabel): string {
  return `## Session: ${label.phase}.${label.subPhase} - ${label.description}
**Date:** ${label.date}
**Duration:** [Estimated]
**Status:** ${label.status}
**Agent:** ${label.agent}
`;
}

