/**
 * Re-invocation adapter: invokes tier start with { mode: 'execute' } (and any
 * other options from params.options) so the second run performs side effects
 * after plan or context-gathering approval.
 * Single place that knows each tier's start signature and option placement.
 */

import type { CommandExecutionOptions } from '../../utils/command-execution-mode';
import type { TierName } from './types';
import type { TierStartResult } from '../../utils/tier-outcome';
import { featureStart } from '../feature/composite/feature';
import { phaseStart } from '../phase/composite/phase';
import { sessionStart } from '../session/composite/session';
import { taskStart } from '../task/composite/task';

/** Start params per tier (identifier-only; options injected by this adapter). */
export type StartParamsByTier =
  | { tier: 'feature'; featureId: string }
  | { tier: 'phase'; phaseId: string }
  | { tier: 'session'; sessionId: string; description?: string }
  | { tier: 'task'; taskId: string; featureId?: string };

/**
 * Re-invoke the same tier start with execute mode. Use after plan_mode approval.
 * Preserves task-start option overloading (featureId vs options as second arg).
 */
export async function reinvokeStartExecute(
  tier: TierName,
  params: unknown
): Promise<TierStartResult> {
  const base = (params as { options?: CommandExecutionOptions })?.options;
  const opts: CommandExecutionOptions = { ...base, mode: 'execute' };
  switch (tier) {
    case 'feature': {
      const p = params as { featureId: string };
      return featureStart(p.featureId, opts);
    }
    case 'phase': {
      const p = params as { phaseId: string };
      return phaseStart(p.phaseId, opts);
    }
    case 'session': {
      const p = params as { sessionId: string; description?: string };
      return sessionStart(p.sessionId, p.description, opts);
    }
    case 'task': {
      const p = params as { taskId: string; featureId?: string };
      if (p.featureId != null && p.featureId !== '') {
        return taskStart(p.taskId, p.featureId, opts);
      }
      return taskStart(p.taskId, opts);
    }
    default:
      throw new Error(`Unknown tier: ${tier}`);
  }
}
