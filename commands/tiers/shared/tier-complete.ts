/**
 * Shared tier complete: dispatches to mark-phase-complete or mark-session-complete.
 * Used by tier-end when completing a phase or session.
 */

import type { TierConfig } from './types';
import { markPhaseCompleteImpl, type MarkPhaseCompleteParams } from '../phase/composite/mark-phase-complete-impl';
import { markSessionCompleteImpl, type MarkSessionCompleteParams } from '../session/composite/mark-session-complete-impl';

export type TierCompleteParams =
  | { tier: 'phase'; phase: string; sessionsCompleted?: string[]; totalTasks?: number }
  | { tier: 'session'; sessionId: string; tasksCompleted?: string[]; accomplishments?: string[]; featureName?: string };

export async function runTierComplete(
  config: TierConfig,
  params: TierCompleteParams
): Promise<string> {
  switch (config.name) {
    case 'phase':
      return markPhaseCompleteImpl(params as MarkPhaseCompleteParams);
    case 'session':
      return markSessionCompleteImpl(params as MarkSessionCompleteParams);
    default:
      return Promise.resolve('');
  }
}
