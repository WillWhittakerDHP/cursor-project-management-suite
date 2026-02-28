/**
 * Shared tier start: dispatches to feature/phase/session/task start implementations.
 * Single entry point for tier start pipeline; each tier's logic remains in its composite.
 * Mode gate is applied here (generic); tier impls do not add mode messages.
 * Control-plane routing runs after the command; result includes controlPlaneDecision for mode/question behavior.
 */

import type { TierConfig } from './types';
import {
  type CommandExecutionOptions,
  resolveCommandExecutionMode,
  cursorModeForExecution,
  modeGateText,
  isPlanMode,
  enforceModeSwitch,
} from '../../utils/command-execution-mode';
import type { TierStartResult } from '../../utils/tier-outcome';
import { verifyApp } from '../../utils/verify-app';
import { featureStartImpl } from '../feature/composite/feature-start-impl';
import { phaseStartImpl } from '../phase/composite/phase-start-impl';
import { sessionStartImpl } from '../session/composite/session-start-impl';
import { taskStartImpl } from '../task/composite/task-start-impl';
import { routeByOutcome } from './control-plane-route';
import type { ControlPlaneDecision, CommandResultForRouting } from './control-plane-types';
import { formatAskQuestionInstruction } from './control-plane-askquestion-instruction';

export type TierStartParams =
  | { featureId: string }
  | { phaseId: string }
  | { sessionId: string; description?: string }
  | { taskId: string; featureId?: string };

export async function runTierStart(
  config: TierConfig,
  params: TierStartParams,
  options?: CommandExecutionOptions
): Promise<TierStartResultWithControlPlane> {
  const executionMode = resolveCommandExecutionMode(options, 'plan');
  const gate = modeGateText(cursorModeForExecution(executionMode), `${config.name}-start`);

  if (config.preflight?.ensureAppRunning?.onStart && !isPlanMode(executionMode)) {
    const appCheck = await verifyApp();
    if (!appCheck.success) {
      const failedResult = {
        success: false,
        output: appCheck.output,
        outcome: {
          status: 'blocked',
          reasonCode: 'app_not_running',
          nextAction: appCheck.output,
        },
        modeGate: gate,
      };
      const decision = routeByOutcome(
        failedResult,
        { tier: config.name, action: 'start', originalParams: params }
      );
      return {
        ...failedResult,
        output: enforceModeSwitch('plan', `${config.name}-start`, 'failure').text + '\n\n---\n\n' + appCheck.output,
        controlPlaneDecision: decision,
      };
    }
  }

  let result: TierStartResult;
  try {
    switch (config.name) {
      case 'feature':
        result = await featureStartImpl((params as { featureId: string }).featureId, options);
        break;
      case 'phase':
        result = await phaseStartImpl((params as { phaseId: string }).phaseId, options);
        break;
      case 'session': {
        const p = params as { sessionId: string; description?: string };
        result = await sessionStartImpl(p.sessionId, p.description, options);
        break;
      }
      case 'task': {
        const p = params as { taskId: string; featureId?: string };
        result = await taskStartImpl(p.taskId, p.featureId, options);
        break;
      }
      default:
        result = {
          success: false,
          output: '',
          outcome: { status: 'failed', reasonCode: 'unknown_tier', nextAction: 'Unknown tier.' },
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result = {
      success: false,
      output: `**${config.name}-start failed with unhandled error:**\n\n\`\`\`\n${message}\n\`\`\``,
      outcome: {
        status: 'failed',
        reasonCode: 'unhandled_error',
        nextAction: `Unhandled error in ${config.name}-start. See playbook: "On command crash".`,
      },
    };
  }
  // Only force Plan mode header when we actually stopped for plan approval or failed; don't force it for cascade (start_ok).
  const reasonCode = result.outcome?.reasonCode;
  const needsPlanFirst =
    !result.success ||
    reasonCode === 'plan_mode' ||
    reasonCode === 'context_gathering' ||
    reasonCode === 'uncommitted_changes_blocking';
  const enforcedMode = needsPlanFirst ? ('plan' as const) : cursorModeForExecution(executionMode);
  const enforcement = enforceModeSwitch(
    enforcedMode,
    `${config.name}-start`,
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
    action: 'start' as const,
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
  };
}

/** Result of runTierStart including control-plane decision for mode/question routing. */
export type TierStartResultWithControlPlane = TierStartResult & {
  controlPlaneDecision: ControlPlaneDecision;
};
