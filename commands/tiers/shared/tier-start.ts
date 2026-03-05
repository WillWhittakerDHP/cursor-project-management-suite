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
import type { TierStartResult, TierStartOutcome } from '../../utils/tier-outcome';
import { verifyApp } from '../../utils/verify-app';
import { routeByOutcome } from './control-plane-route';
import type { ControlPlaneDecision } from './control-plane-types';
import { formatAskQuestionInstruction } from './control-plane-askquestion-instruction';
import { getDefaultShadowRecorder } from '../../harness/run-recorder-shadow';
import { createContextInjector } from '../../harness/context-injector';
import { defaultKernel } from '../../harness/kernel';
import { createTierAdapter } from '../../harness/tier-adapter';
import { defaultProfileDefaultsResolver } from '../../harness/spec-builder';
import { buildSpecFromTierRun } from '../../harness/build-spec-from-tier';
import { WorkflowCommandContext } from '../../utils/command-context';
import {
  writeTierStartPending,
  writeTaskStartPending,
  type TierStartPendingParams,
} from './pending-state';

export type TierStartParams =
  | { featureId: string }
  | { phaseId: string }
  | { sessionId: string; description?: string }
  | { taskId: string; featureId?: string };

function getIdentifierFromParams(config: TierConfig, params: TierStartParams): string {
  switch (config.name) {
    case 'feature': return (params as { featureId: string }).featureId;
    case 'phase': return (params as { phaseId: string }).phaseId;
    case 'session': return (params as { sessionId: string }).sessionId;
    case 'task': return (params as { taskId: string }).taskId;
    default: return '';
  }
}

export async function runTierStart(
  config: TierConfig,
  params: TierStartParams,
  options?: CommandExecutionOptions
): Promise<TierStartResultWithControlPlane> {
  // Default plan so start always creates planning doc and exits; execute only via /accepted-proceed or /accepted-code.
  const executionMode = resolveCommandExecutionMode(options, 'plan');
  const gate = modeGateText(cursorModeForExecution(executionMode), `${config.name}-start`);

  const shadowRecorder = getDefaultShadowRecorder();
  const identifier = getIdentifierFromParams(config, params);

  if (config.preflight?.ensureAppRunning?.onStart && !isPlanMode(executionMode)) {
    const appCheck = await verifyApp();
    if (!appCheck.success) {
      const outcome: TierStartOutcome = {
        status: 'blocked',
        reasonCode: 'app_not_running',
        nextAction: appCheck.output,
      };
      const failedResult: TierStartResult = {
        success: false,
        output: appCheck.output,
        outcome,
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

  try {
    const context = await WorkflowCommandContext.getCurrent();
    const spec = buildSpecFromTierRun({
      tier: config.name,
      action: 'start',
      identifier,
      featureContext: { featureId: context.feature.name, featureName: context.feature.name },
      mode: executionMode,
      userChoices: options,
    });
    const adapter = createTierAdapter({ config, params, options });
    const kernelResult = await defaultKernel.run(spec, {
      contextInjector: createContextInjector(),
      recorder: shadowRecorder,
      adapter,
      profileDefaults: defaultProfileDefaultsResolver,
      routingContext: { tier: config.name, action: 'start', originalParams: params },
    });
    const needsPlanFirst =
      !kernelResult.success ||
      kernelResult.outcome.reasonCode === 'context_gathering' ||
      kernelResult.outcome.reasonCode === 'guide_fill_pending' ||
      kernelResult.outcome.reasonCode === 'uncommitted_blocking';
    const enforcedMode = needsPlanFirst ? ('plan' as const) : cursorModeForExecution(executionMode);
    const enforcement = enforceModeSwitch(
      enforcedMode,
      `${config.name}-start`,
      kernelResult.success ? 'normal' : 'failure'
    );
    const reasonCode = kernelResult.outcome.reasonCode;
    if (reasonCode === 'context_gathering') {
      if (config.name === 'feature' || config.name === 'phase' || config.name === 'session') {
        await writeTierStartPending({
          tier: config.name,
          params: params as TierStartPendingParams,
          pass: 1,
        });
      } else if (config.name === 'task') {
        const p = params as { taskId: string; featureId?: string };
        await writeTaskStartPending({ taskId: p.taskId, featureId: p.featureId });
      }
    } else if (
      reasonCode === 'guide_fill_pending' &&
      (config.name === 'phase' || config.name === 'session') &&
      kernelResult.outcome.guidePath
    ) {
      await writeTierStartPending({
        tier: config.name,
        params: params as TierStartPendingParams,
        pass: 1,
        guideFillPending: true,
        guidePath: kernelResult.outcome.guidePath,
      });
    }

    let finalOutput = enforcement.text + '\n\n---\n\n' + kernelResult.output;
    if (kernelResult.controlPlaneDecision.stop && kernelResult.controlPlaneDecision.questionKey) {
      const askInstruction = formatAskQuestionInstruction(kernelResult.controlPlaneDecision);
      if (askInstruction) finalOutput = finalOutput + '\n\n---\n\n' + askInstruction;
    }
    return {
      success: kernelResult.success,
      output: finalOutput,
      outcome: kernelResult.outcome as TierStartResult['outcome'],
      modeGate: gate,
      controlPlaneDecision: kernelResult.controlPlaneDecision,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failedResult: TierStartResult = {
      success: false,
      output: `**${config.name}-start failed:**\n\n\`\`\`\n${message}\n\`\`\``,
      outcome: {
        status: 'failed',
        reasonCode: 'unhandled_error',
        nextAction: `Unhandled error in ${config.name}-start. See playbook: "On command crash".`,
      },
      modeGate: gate,
    };
    const decision = routeByOutcome(
      failedResult,
      { tier: config.name, action: 'start', originalParams: params }
    );
    return {
      ...failedResult,
      controlPlaneDecision: decision,
    };
  }
}

/** Result of runTierStart including control-plane decision for mode/question routing. */
export type TierStartResultWithControlPlane = TierStartResult & {
  controlPlaneDecision: ControlPlaneDecision;
};
