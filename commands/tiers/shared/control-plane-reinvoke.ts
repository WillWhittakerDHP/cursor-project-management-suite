/**
 * Control-plane re-invoke: canonical helpers for building re-invoke params and (future) WorkflowSpec.
 * Keeps option nesting in one place so flat option keys are never added at the dispatcher boundary.
 */

import type { CommandExecutionOptions } from '../../utils/command-execution-mode';
import type { StartReinvokeParams } from './control-plane-types';
import type { TierName } from './types';
import type { TierAction } from './control-plane-types';

const START_TIERS: TierName[] = ['feature', 'phase', 'session', 'task'];

/**
 * Build start re-invoke params with options nested.
 * All start handlers must use this so the dispatcher receives options via params.options.
 */
export function buildStartReinvokeParams(
  baseParams: Record<string, unknown>,
  options: CommandExecutionOptions
): StartReinvokeParams {
  return { ...baseParams, options };
}

/**
 * Build tier-end re-invoke params: merge execution toggles into `params.options` without dropping existing keys.
 */
export function buildEndReinvokeParams(
  baseParams: Record<string, unknown>,
  options: CommandExecutionOptions
): Record<string, unknown> {
  const existing = baseParams.options as CommandExecutionOptions | undefined;
  const mergedOptions: CommandExecutionOptions =
    existing != null && typeof existing === 'object' ? { ...existing, ...options } : { ...options };
  return { ...baseParams, options: mergedOptions };
}

/**
 * Build reinvoke params for "start with execute" for a given tier.
 * Returns a Promise that resolves to StartReinvokeParams for known tiers and rejects for unknown tier.
 */
export function reinvokeStartExecute(
  tier: TierName,
  baseParams: Record<string, unknown>
): Promise<StartReinvokeParams> {
  if (!START_TIERS.includes(tier)) {
    return Promise.reject(new Error('Unknown tier'));
  }
  return Promise.resolve(buildStartReinvokeParams(baseParams, { mode: 'execute' }));
}

/**
 * Shape used when re-invoking after user confirmation.
 * For harness cutover, nextInvoke will be a full WorkflowSpec (see harness ControlPlaneDecision).
 */
export interface ReinvokeIntent {
  tier: TierName;
  action: TierAction;
  params: unknown; // StartReinvokeParams when action === 'start'
}
