/**
 * Shared tier end: dispatches to feature/phase/session/task end implementations.
 * Single entry point for tier end pipeline; each tier's logic remains in its composite.
 * Mode gate is applied here (generic); tier impls do not add mode messages.
 */

import type { TierConfig } from './types';
import type { FeatureEndParams, FeatureEndResult } from '../feature/composite/feature-end-impl';
import type { PhaseEndParams, PhaseEndResult } from '../phase/composite/phase-end-impl';
import type { SessionEndParams, SessionEndResult } from '../session/composite/session-end-impl';
import type { TaskEndParams } from '../task/composite/task-end-impl';
import { featureEndImpl } from '../feature/composite/feature-end-impl';
import { phaseEndImpl } from '../phase/composite/phase-end-impl';
import { sessionEndImpl } from '../session/composite/session-end-impl';
import { taskEndImpl } from '../task/composite/task-end-impl';
import {
  resolveCommandExecutionMode,
  cursorModeForExecution,
  modeGateText,
  type CommandExecutionOptions,
} from '../../utils/command-execution-mode';

export type TierEndParams =
  | FeatureEndParams
  | PhaseEndParams
  | SessionEndParams
  | TaskEndParams;

export type TierEndResult =
  (FeatureEndResult | PhaseEndResult | SessionEndResult | Awaited<ReturnType<typeof taskEndImpl>>)
  & { modeGate: string };

export async function runTierEnd(
  config: TierConfig,
  params: TierEndParams
): Promise<TierEndResult> {
  const executionMode = resolveCommandExecutionMode(params as CommandExecutionOptions);
  const gate = modeGateText(cursorModeForExecution(executionMode), `${config.name}-end`);

  let result: FeatureEndResult | PhaseEndResult | SessionEndResult | Awaited<ReturnType<typeof taskEndImpl>>;
  switch (config.name) {
    case 'feature':
      result = await featureEndImpl(params as FeatureEndParams);
      break;
    case 'phase':
      result = await phaseEndImpl(params as PhaseEndParams);
      break;
    case 'session':
      result = await sessionEndImpl(params as SessionEndParams);
      break;
    case 'task':
      result = await taskEndImpl(params as TaskEndParams);
      break;
    default:
      result = { success: false, output: '' } as Awaited<ReturnType<typeof taskEndImpl>>;
  }
  return { ...result, modeGate: gate };
}
