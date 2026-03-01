/**
 * Shared tier end: dispatches to feature/phase/session/task end implementations.
 * Single entry point for tier end pipeline; each tier's logic remains in its composite.
 * Mode gate is applied here (generic); tier impls do not add mode messages.
 * Control-plane routing runs after the command; result includes controlPlaneDecision.
 */

import type { TierConfig } from './types';
import type { FeatureEndParams } from '../feature/composite/feature-end-impl';
import type { PhaseEndParams } from '../phase/composite/phase-end-impl';
import type { SessionEndParams } from '../session/composite/session-end-impl';
import type { TaskEndParams } from '../task/composite/task-end-impl';
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
import { getDefaultShadowRecorder } from '../../harness/run-recorder-shadow';
import { createContextInjector } from '../../harness/context-injector';
import { defaultKernel } from '../../harness/kernel';
import { createTierAdapter } from '../../harness/tier-adapter';
import { defaultProfileDefaultsResolver } from '../../harness/spec-builder';
import { buildSpecFromTierRun } from '../../harness/build-spec-from-tier';
import { WorkflowCommandContext } from '../../utils/command-context';

export type TierEndParams =
  | FeatureEndParams
  | PhaseEndParams
  | SessionEndParams
  | TaskEndParams;

export type TierEndResult = {
  success: boolean;
  output: string;
  steps: Record<string, { success: boolean; output: string }>;
  outcome: import('../../utils/tier-outcome').TierEndOutcome;
  modeGate: string;
};

/** Result of runTierEnd including control-plane decision. */
export type TierEndResultWithControlPlane = TierEndResult & {
  controlPlaneDecision: ControlPlaneDecision;
};

function getIdentifierFromEndParams(config: TierConfig, params: TierEndParams): string {
  const p = params as Record<string, unknown>;
  switch (config.name) {
    case 'feature': return (p.featureName as string) ?? (p.featureId as string) ?? '';
    case 'phase': return (p.phaseId as string) ?? (p.phaseNumber as string) ?? '';
    case 'session': return (p.sessionId as string) ?? '';
    case 'task': return (p.taskId as string) ?? '';
    default: return '';
  }
}

async function getFeatureContextForEnd(params: TierEndParams): Promise<{ featureId: string; featureName: string }> {
  const context = await WorkflowCommandContext.getCurrent();
  return { featureId: context.feature.name, featureName: context.feature.name };
}

export async function runTierEnd(
  config: TierConfig,
  params: TierEndParams
): Promise<TierEndResultWithControlPlane> {
  const executionMode = resolveCommandExecutionMode(params as CommandExecutionOptions);
  const gate = modeGateText(cursorModeForExecution(executionMode), `${config.name}-end`);

  const shadowRecorder = getDefaultShadowRecorder();
  const runId = `run_${config.name}_end_${Date.now()}`;
  const identifier = getIdentifierFromEndParams(config, params);
  const handle = await shadowRecorder.begin({
    runId,
    tier: config.name,
    action: 'end',
    identifier,
    harnessCutoverTier: isHarnessDefaultForTier(config.name),
  });
  const shadowContext = { recorder: shadowRecorder, handle };

  const minimalSpec: Pick<WorkflowSpec, 'tier' | 'action' | 'identifier' | 'featureContext' | 'contextBudget'> = {
    tier: config.name,
    action: 'end',
    identifier,
    featureContext: { featureId: identifier, featureName: identifier },
    contextBudget: { maxTokens: 8000, maxArtifacts: 15, maxFiles: 10, includeHistory: 'recent' },
  };
  try {
    const injector = createContextInjector();
    const plan = injector.plan(minimalSpec as WorkflowSpec);
    const sources = { fs: createNodeFileSystemAdapter(PROJECT_ROOT) };
    const pack = await injector.build(plan, sources);
    await shadowRecorder.contextReport(handle, { summary: pack.summary, budget: pack.budget });
  } catch (_e) {
    // Telemetry-only: do not fail the run
  }

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

  try {
    const featureContext = await getFeatureContextForEnd(params);
    const identifier = getIdentifierFromEndParams(config, params);
    const spec = buildSpecFromTierRun({
      tier: config.name,
      action: 'end',
      identifier,
      featureContext,
      mode: resolveCommandExecutionMode(params as CommandExecutionOptions),
      userChoices: (params as Record<string, unknown>).mode !== undefined ? { continuePastVerification: (params as Record<string, unknown>).continuePastVerification as boolean | undefined } : undefined,
    });
    const adapter = createTierAdapter({ config, params });
    const shadowRecorder = getDefaultShadowRecorder();
    const kernelResult = await defaultKernel.run(spec, {
      contextInjector: createContextInjector(),
      recorder: shadowRecorder,
      adapter,
      profileDefaults: defaultProfileDefaultsResolver,
      routingContext: { tier: config.name, action: 'end', originalParams: params },
    });
    const needsPlanFirst =
      !kernelResult.success ||
      kernelResult.outcome.reasonCode === 'pending_push_confirmation' ||
      kernelResult.outcome.cascade != null;
    const enforcedMode = needsPlanFirst ? ('plan' as const) : cursorModeForExecution(executionMode);
    const enforcement = enforceModeSwitch(
      enforcedMode,
      `${config.name}-end`,
      kernelResult.success ? 'normal' : 'failure'
    );
    let finalOutput = enforcement.text + '\n\n---\n\n' + kernelResult.output;
    if (kernelResult.controlPlaneDecision.stop && kernelResult.controlPlaneDecision.questionKey) {
      const askInstruction = formatAskQuestionInstruction(kernelResult.controlPlaneDecision);
      if (askInstruction) finalOutput = finalOutput + '\n\n---\n\n' + askInstruction;
    }
    return {
      success: kernelResult.success,
      output: finalOutput,
      steps: {},
      outcome: kernelResult.outcome as TierEndResult['outcome'],
      modeGate: gate,
      controlPlaneDecision: kernelResult.controlPlaneDecision,
    } as TierEndResultWithControlPlane;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failedResult = {
      success: false,
      output: `**${config.name}-end failed:**\n\n\`\`\`\n${message}\n\`\`\``,
      outcome: {
        status: 'failed' as const,
        reasonCode: 'unhandled_error',
        nextAction: `Unhandled error in ${config.name}-end. See playbook: "On command crash".`,
      },
      modeGate: gate,
    };
    const decision = routeByOutcome(
      failedResult as CommandResultForRouting,
      { tier: config.name, action: 'end', originalParams: params }
    );
    return {
      ...failedResult,
      controlPlaneDecision: decision,
    } as TierEndResultWithControlPlane;
  }
}
