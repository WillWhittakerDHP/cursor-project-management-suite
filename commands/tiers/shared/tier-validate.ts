/**
 * Shared tier validation: dispatches to tier-specific validator.
 * Used by tier-start to validate before starting.
 */

import type { TierConfig } from './types';
import { validatePhaseImpl } from '../phase/composite/validate-phase-impl';
import { validateSessionImpl } from '../session/composite/validate-session-impl';

export interface TierValidateResult {
  canStart: boolean;
  reason: string;
  details: string[];
}

export async function runTierValidate(
  config: TierConfig,
  identifier: string
): Promise<TierValidateResult> {
  const parsed = config.parseId(identifier);
  if (!parsed && config.name !== 'feature') {
    return {
      canStart: false,
      reason: 'Invalid ID format',
      details: [`Invalid ${config.name} ID format. Received: ${identifier}`],
    };
  }

  switch (config.name) {
    case 'phase':
      return validatePhaseImpl(identifier);
    case 'session':
      return validateSessionImpl(identifier);
    case 'task':
    case 'feature':
      return { canStart: true, reason: 'No validation', details: [] };
    default:
      return { canStart: true, reason: 'OK', details: [] };
  }
}
