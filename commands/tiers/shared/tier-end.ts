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
import { createContextInjector, createNodeFileSystemAdapter } from '../../harness/context-injector';
import type { WorkflowSpec } from '../../harness/contracts';
import { PROJECT_ROOT } from '../../utils/utils';
import { defaultKernel } from '../../harness/kernel';
import { createDefaultPlugins } from '../../harness/default-plugins';
import { createStepAdapter } from '../../harness/step-adapter';
import { defaultProfileDefaultsResolver } from '../../harness/spec-builder';
import { buildSpecFromTierRun } from '../../harness/build-spec-from-tier';
import { classifyWorkProfile } from '../../harness/work-profile-classifier';
import { WorkflowCommandContext, type TierParamsBag } from '../../utils/command-context';
import { writeEndPending } from './pending-state';
import { recordOrchestratorFailureFriction } from '../../harness/workflow-friction-manager';

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

function paramsSnippetForWorkflowFrictionEnd(params: TierEndParams): string {
  try {
    const s = JSON.stringify(params);
    return s.length > 2000 ? `${s.slice(0, 2000)}\n\n…(truncated)` : s;
  } catch {
    return '(params not serializable)';
  }
}

function getIdentifierFromEndParams(config: TierConfig, params: TierEndParams): string {
  switch (config.name) {
    case 'feature':
      if ('featureName' in params && typeof params.featureName === 'string') return params.featureName;
      if ('featureId' in params && typeof params.featureId === 'string') return params.featureId;
      return '';
    case 'phase':
      if ('phaseId' in params && typeof params.phaseId === 'string') return params.phaseId;
      if ('phaseNumber' in params && typeof params.phaseNumber === 'string') return params.phaseNumber;
      return '';
    case 'session':
      return 'sessionId' in params && typeof params.sessionId === 'string' ? params.sessionId : '';
    case 'task':
      return 'taskId' in params && typeof params.taskId === 'string' ? params.taskId : '';
    default:
      return '';
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
    const rc = String(failedResult.outcome.reasonCode ?? 'unhandled_error');
    recordOrchestratorFailureFriction({
      action: 'end',
      tier: config.name,
      identifier: identifier || '—',
      reasonCodeRaw: rc,
      symptom: message,
      context: `WorkflowCommandContext.contextFromParams failed.\n\n${paramsSnippetForWorkflowFrictionEnd(params)}`,
    });
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
        outcome: {
          status: 'blocked_fix_required',
          reasonCode: 'app_not_running',
          nextAction: appCheck.output,
        },
      };
      recordOrchestratorFailureFriction({
        action: 'end',
        tier: config.name,
        identifier,
        featureName: context.feature.name,
        reasonCodeRaw: 'app_not_running',
        nextAction: appCheck.output,
      });
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
    const userChoicesFromEnd: WorkflowSpec['userChoices'] = {};
    const endOptionsForChoices = getOptionsFromParams(params);
    if (endOptionsForChoices?.continuePastGapAnalysis === true) {
      userChoicesFromEnd.continuePastGapAnalysis = true;
    }
    if ('continuePastVerification' in params && typeof params.continuePastVerification === 'boolean') {
      userChoicesFromEnd.continuePastVerification = params.continuePastVerification;
    }
    if ('pushConfirmed' in params && typeof params.pushConfirmed === 'boolean') {
      userChoicesFromEnd.pushConfirmed = params.pushConfirmed;
    }
    if ('cascadeConfirmed' in params && typeof params.cascadeConfirmed === 'boolean') {
      userChoicesFromEnd.cascadeConfirmed = params.cascadeConfirmed;
    }
    const userChoices =
      Object.keys(userChoicesFromEnd).length > 0 ? userChoicesFromEnd : undefined;

    const spec = buildSpecFromTierRun({
      tier: config.name,
      action: 'end',
      identifier,
      featureContext,
      mode: resolveCommandExecutionMode(getOptionsFromParams(params), 'execute'),
      userChoices,
      workProfile,
    });
    const adapter = createStepAdapter({
      config,
      actionParams: { action: 'end', params },
      context,
    });
    const kernelResult = await defaultKernel.run(spec, {
      contextInjector: createContextInjector(),
      recorder: shadowRecorder,
      adapter,
      profileDefaults: defaultProfileDefaultsResolver,
      routingContext: { tier: config.name, action: 'end', originalParams: params, workProfile },
      plugins: createDefaultPlugins(),
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
    recordOrchestratorFailureFriction({
      action: 'end',
      tier: config.name,
      identifier,
      featureName: context.feature.name,
      reasonCodeRaw: 'unhandled_error',
      symptom: message,
      context: `defaultKernel.run threw.\n\n${paramsSnippetForWorkflowFrictionEnd(params)}`,
    });
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
