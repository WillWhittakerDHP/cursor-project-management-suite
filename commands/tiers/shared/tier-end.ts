/**
 * Shared tier end: dispatches to feature/phase/session/task end implementations.
 * Single entry point for tier end pipeline; each tier's logic remains in its composite.
 * Mode gate is applied here (generic); tier impls do not add mode messages.
 *
 * Preflight checks (e.g. ensureAppRunning) are executed here in the orchestrator,
 * keeping infrastructure concerns out of individual tier impls.
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
  isPlanMode,
  enforceModeSwitch,
  type CommandExecutionOptions,
} from '../../utils/command-execution-mode';
import { verifyApp } from '../../utils/verify-app';

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

  if (config.preflight?.ensureAppRunning?.onEnd && !isPlanMode(executionMode)) {
    const appCheck = await verifyApp();
    if (!appCheck.success) {
      return {
        success: false,
        output: appCheck.output,
        modeGate: gate,
      } as TierEndResult;
    }
  }

  let result: FeatureEndResult | PhaseEndResult | SessionEndResult | Awaited<ReturnType<typeof taskEndImpl>>;
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result = {
      success: false,
      output: `**${config.name}-end failed with unhandled error:**\n\n\`\`\`\n${message}\n\`\`\``,
      outcome: {
        status: 'failed' as const,
        reasonCode: 'unhandled_error',
        nextAction: `Unhandled error in ${config.name}-end. See playbook: "On command crash".`,
      },
    } as Awaited<ReturnType<typeof taskEndImpl>>;
  }
  const needsPlanFirst = !result.success
    || result.outcome?.reasonCode === 'pending_push_confirmation'
    || result.outcome?.cascade != null;
  const enforcedMode = needsPlanFirst ? 'plan' as const : cursorModeForExecution(executionMode);
  const enforcement = enforceModeSwitch(
    enforcedMode,
    `${config.name}-end`,
    result.success ? 'normal' : 'failure'
  );
  return {
    ...result,
    output: enforcement.text + '\n\n---\n\n' + result.output,
    modeGate: gate,
  };
}
