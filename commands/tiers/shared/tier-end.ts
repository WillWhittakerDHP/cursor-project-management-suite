/**
 * Shared tier end: dispatches to feature/phase/session/task end implementations.
 * Single entry point for tier end pipeline; each tier's logic remains in its composite.
 * Mode gate is applied here (generic); tier impls do not add mode messages.
 * Control-plane routing runs after the command; result includes controlPlaneDecision.
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
import { routeByOutcome } from './control-plane-route';
import type { ControlPlaneDecision, CommandResultForRouting } from './control-plane-types';
import { formatAskQuestionInstruction } from './control-plane-askquestion-instruction';

export type TierEndParams =
  | FeatureEndParams
  | PhaseEndParams
  | SessionEndParams
  | TaskEndParams;

export type TierEndResult =
  (FeatureEndResult | PhaseEndResult | SessionEndResult | Awaited<ReturnType<typeof taskEndImpl>>)
  & { modeGate: string };

/** Result of runTierEnd including control-plane decision. */
export type TierEndResultWithControlPlane = TierEndResult & {
  controlPlaneDecision: ControlPlaneDecision;
};

export async function runTierEnd(
  config: TierConfig,
  params: TierEndParams
): Promise<TierEndResultWithControlPlane> {
  const executionMode = resolveCommandExecutionMode(params as CommandExecutionOptions);
  const gate = modeGateText(cursorModeForExecution(executionMode), `${config.name}-end`);

  if (config.preflight?.ensureAppRunning?.onEnd && !isPlanMode(executionMode)) {
    const appCheck = await verifyApp();
    if (!appCheck.success) {
      const failedResult = {
        success: false,
        output: appCheck.output,
        modeGate: gate,
        outcome: { reasonCode: 'app_not_running', nextAction: appCheck.output },
      };
      const decision = routeByOutcome(
        failedResult as CommandResultForRouting,
        { tier: config.name, action: 'end', originalParams: params }
      );
      return {
        ...failedResult,
        output: enforceModeSwitch('plan', `${config.name}-end`, 'failure').text + '\n\n---\n\n' + appCheck.output,
        controlPlaneDecision: decision,
      } as TierEndResultWithControlPlane;
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
  const outputWithEnforcement = enforcement.text + '\n\n---\n\n' + result.output;

  const forRouting: CommandResultForRouting = {
    success: result.success,
    output: result.output,
    outcome: result.outcome,
    modeGate: gate,
  };
  const ctx = {
    tier: config.name,
    action: 'end' as const,
    originalParams: params,
  };
  const controlPlaneDecision = routeByOutcome(forRouting, ctx);

  let finalOutput = outputWithEnforcement;
  if (controlPlaneDecision.stop && controlPlaneDecision.questionKey) {
    const askInstruction = formatAskQuestionInstruction(controlPlaneDecision);
    if (askInstruction) {
      finalOutput = finalOutput + '\n\n---\n\n' + askInstruction;
    }
  }

  return {
    ...result,
    output: finalOutput,
    modeGate: gate,
    controlPlaneDecision,
  } as TierEndResultWithControlPlane;
}
