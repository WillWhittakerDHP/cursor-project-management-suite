/**
 * Shared tier end: dispatches to feature/phase/session/task end implementations.
 * Single entry point for tier end pipeline; each tier's logic remains in its composite.
 * Control-plane routing runs after the command; result includes controlPlaneDecision.
 */

import type { TierConfig } from './types';
import type { FeatureEndParams } from '../feature/composite/feature-end-impl';
import type { PhaseEndParams } from '../phase/composite/phase-end-impl';
import type { SessionEndParams } from '../session/composite/session-end-impl';
import type { TaskEndParams } from '../task/composite/task-end-impl';
import {
  resolveCommandExecutionMode,
  isPlanMode,
  getOptionsFromParams,
} from '../../utils/command-execution-mode';
import { verifyApp } from '../../utils/verify-app';
import { routeByOutcome } from './control-plane-route';
import type { ControlPlaneDecision, CommandResultForRouting } from './control-plane-types';
import { formatChoiceForChat } from './control-plane-choice-display';
import { getDefaultShadowRecorder } from '../../harness/run-recorder-shadow';
import { createContextInjector } from '../../harness/context-injector';
import { defaultKernel } from '../../harness/kernel';
import { createTierAdapter } from '../../harness/tier-adapter';
import { defaultProfileDefaultsResolver } from '../../harness/spec-builder';
import { buildSpecFromTierRun } from '../../harness/build-spec-from-tier';
import { classifyWorkProfile } from '../../harness/work-profile-classifier';
import { isHarnessDefaultForTier } from '../../harness/cutover-config';
import { WorkflowCommandContext, type TierParamsBag } from '../../utils/command-context';
import { writeEndPending } from './pending-state';

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
  modeGate?: string;
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

export async function runTierEnd(
  config: TierConfig,
  params: TierEndParams
): Promise<TierEndResultWithControlPlane> {
  const executionMode = resolveCommandExecutionMode(getOptionsFromParams(params), 'execute');

  const identifier = getIdentifierFromEndParams(config, params);

  // Resolve F/P/S/T context first; fail fast before any recorder, injector, or preflight.
  let context: WorkflowCommandContext;
  try {
    context = await WorkflowCommandContext.contextFromParams(config.name, params as TierParamsBag);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failedResult: TierEndResult = {
      success: false,
      output: `**${config.name}-end failed:**\n\n\`\`\`\n${message}\n\`\`\``,
      steps: {},
      outcome: {
        status: 'failed' as const,
        reasonCode: 'unhandled_error',
        nextAction: `Context resolution failed. Check tier identifier and feature.`,
      },
    };
    const decision = routeByOutcome(
      failedResult as CommandResultForRouting,
      { tier: config.name, action: 'end', originalParams: params }
    );
    let failedOutput = failedResult.output;
    if (decision.stop && decision.questionKey) {
      const choiceBlock = formatChoiceForChat(decision);
      if (choiceBlock) failedOutput = failedOutput + '\n\n---\n\n' + choiceBlock;
    }
    return {
      ...failedResult,
      output: failedOutput,
      controlPlaneDecision: decision,
    } as TierEndResultWithControlPlane;
  }

  const shadowRecorder = getDefaultShadowRecorder();
  const runId = `run_${config.name}_end_${Date.now()}`;
  const handle = await shadowRecorder.begin({
    runId,
    tier: config.name,
    action: 'end',
    identifier,
    harnessCutoverTier: isHarnessDefaultForTier(config.name),
  });

  const minimalSpec: Pick<WorkflowSpec, 'tier' | 'action' | 'identifier' | 'featureContext' | 'contextBudget'> = {
    tier: config.name,
    action: 'end',
    identifier,
    featureContext: { featureId: context.feature.name, featureName: context.feature.name },
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
      const failedResult: TierEndResult = {
        success: false,
        output: appCheck.output,
        steps: {},
        outcome: { reasonCode: 'app_not_running', nextAction: appCheck.output },
      };
      const decision = routeByOutcome(
        failedResult as CommandResultForRouting,
        { tier: config.name, action: 'end', originalParams: params }
      );
      return {
        ...failedResult,
        output: appCheck.output,
        controlPlaneDecision: decision,
      } as TierEndResultWithControlPlane;
    }
  }

  try {
    const featureContext = { featureId: context.feature.name, featureName: context.feature.name };
    const workProfile = classifyWorkProfile({ tier: config.name, action: 'end' });
    const spec = buildSpecFromTierRun({
      tier: config.name,
      action: 'end',
      identifier,
      featureContext,
      mode: resolveCommandExecutionMode(getOptionsFromParams(params), 'execute'),
      userChoices: getOptionsFromParams(params) != null ? { continuePastVerification: (params as Record<string, unknown>).continuePastVerification as boolean | undefined } : undefined,
      workProfile,
    });
    const adapter = createTierAdapter({ config, params, context });
    const kernelResult = await defaultKernel.run(spec, {
      contextInjector: createContextInjector(),
      recorder: shadowRecorder,
      adapter,
      profileDefaults: defaultProfileDefaultsResolver,
      routingContext: { tier: config.name, action: 'end', originalParams: params, workProfile },
    });
    // Kernel returns charter reasonCode 'pending_push' (adapters map pending_push_confirmation → pending_push)
    if (kernelResult.outcome.reasonCode === 'pending_push') {
      await writeEndPending({
        tier: config.name,
        identifier,
        cascade: kernelResult.outcome.cascade,
      });
    }
    let finalOutput = kernelResult.output;
    if (kernelResult.controlPlaneDecision.stop && kernelResult.controlPlaneDecision.questionKey) {
      const choiceBlock = formatChoiceForChat(kernelResult.controlPlaneDecision);
      if (choiceBlock) finalOutput = finalOutput + '\n\n---\n\n' + choiceBlock;
    }
    return {
      success: kernelResult.success,
      output: finalOutput,
      steps: {},
      outcome: kernelResult.outcome as TierEndResult['outcome'],
      controlPlaneDecision: kernelResult.controlPlaneDecision,
    } as TierEndResultWithControlPlane;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failedResult: TierEndResult = {
      success: false,
      output: `**${config.name}-end failed:**\n\n\`\`\`\n${message}\n\`\`\``,
      steps: {},
      outcome: {
        status: 'failed' as const,
        reasonCode: 'unhandled_error',
        nextAction: `Unhandled error in ${config.name}-end. See playbook: "On command crash".`,
      },
    };
    const decision = routeByOutcome(
      failedResult as CommandResultForRouting,
      { tier: config.name, action: 'end', originalParams: params }
    );
    let failedOutput = failedResult.output;
    if (decision.stop && decision.questionKey) {
      const choiceBlock = formatChoiceForChat(decision);
      if (choiceBlock) failedOutput = failedOutput + '\n\n---\n\n' + choiceBlock;
    }
    return {
      ...failedResult,
      output: failedOutput,
      controlPlaneDecision: decision,
    } as TierEndResultWithControlPlane;
  }
}
