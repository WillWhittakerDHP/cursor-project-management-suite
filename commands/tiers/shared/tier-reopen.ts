/**
 * Shared tier reopen: flips a completed tier back to Reopened so additional child work can be added.
 * Runs through defaultKernel + step adapter (same path as tier-start / tier-end). Task reopen not supported.
 */

import type { TierConfig } from './types';
import type { TierReopenParams, TierReopenResult } from './tier-reopen-workflow';
import { WorkflowCommandContext, type TierParamsBag } from '../../utils/command-context';
import { WorkflowId } from '../../utils/id-utils';
import { routeByOutcome } from './control-plane-route';
import type { ControlPlaneDecision } from './control-plane-types';
import { formatChoiceForChat } from './control-plane-choice-display';
import { getDefaultShadowRecorder } from '../../harness/run-recorder-shadow';
import { createContextInjector } from '../../harness/context-injector';
import { defaultKernel } from '../../harness/kernel';
import { createDefaultPlugins } from '../../harness/default-plugins';
import { createStepAdapter } from '../../harness/step-adapter';
import { defaultProfileDefaultsResolver } from '../../harness/spec-builder';
import { buildSpecFromTierRun } from '../../harness/build-spec-from-tier';
import { classifyWorkProfile } from '../../harness/work-profile-classifier';
import { recordOrchestratorFailureFriction } from '../../harness/workflow-friction-manager';
import type { WorkflowSpec } from '../../harness/contracts';

export type { TierReopenParams, TierReopenResult };

/** Result of runTierReopen including control-plane decision and optional kernel trace id. */
export type TierReopenResultWithControlPlane = TierReopenResult & {
  controlPlaneDecision: ControlPlaneDecision;
  traceId?: string;
};

function paramsSnippet(params: TierReopenParams): string {
  try {
    const s = JSON.stringify(params);
    return s.length > 2000 ? `${s.slice(0, 2000)}\n\n…(truncated)` : s;
  } catch {
    return '(params not serializable)';
  }
}

function reopenParamsToTierBag(config: TierConfig, params: TierReopenParams): TierParamsBag {
  const id = params.identifier.trim();
  switch (config.name) {
    case 'feature':
      return { featureId: id };
    case 'phase': {
      const featureFromPhase = id.split('.')[0]?.trim();
      if (!featureFromPhase) {
        throw new Error(`reopen: invalid phase id "${id}"`);
      }
      if (params.featureId?.trim()) return { phaseId: id, featureId: params.featureId.trim() };
      if (params.featureName?.trim()) return { phaseId: id, featureName: params.featureName.trim() };
      return { phaseId: id, featureId: featureFromPhase };
    }
    case 'session': {
      const parsed = WorkflowId.parseSessionId(id);
      if (params.featureId?.trim()) return { sessionId: id, featureId: params.featureId.trim() };
      if (params.featureName?.trim()) return { sessionId: id, featureName: params.featureName.trim() };
      if (parsed?.feature) return { sessionId: id, featureId: parsed.feature };
      throw new Error(
        'session reopen: could not derive feature from session id; pass featureId or featureName in params.'
      );
    }
    default:
      return {};
  }
}

export async function runTierReopen(
  config: TierConfig,
  params: TierReopenParams,
  preResolvedContext?: WorkflowCommandContext,
  metadata?: WorkflowSpec['metadata']
): Promise<TierReopenResultWithControlPlane> {
  const identifier = params.identifier.trim();
  const shadowRecorder = getDefaultShadowRecorder();

  let context: WorkflowCommandContext;
  try {
    if (preResolvedContext) {
      context = preResolvedContext;
    } else {
      const bag = reopenParamsToTierBag(config, params);
      context = await WorkflowCommandContext.contextFromParams(config.name, bag);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordOrchestratorFailureFriction({
      action: 'reopen',
      tier: config.name,
      identifier: identifier || '—',
      featureName: preResolvedContext?.feature.name,
      reasonCodeRaw: 'unhandled_error',
      symptom: message,
      context: `runTierReopen: context resolution failed.\n\n${paramsSnippet(params)}`,
    });
    const failedResult: TierReopenResult = {
      success: false,
      output: `**${config.name}-reopen failed:**\n\n\`\`\`\n${message}\n\`\`\``,
      previousStatus: '',
      newStatus: '',
      modeGate: '',
    };
    const decision = routeByOutcome(
      {
        success: false,
        output: failedResult.output,
        outcome: { reasonCode: 'unhandled_error', nextAction: failedResult.output },
      },
      {
        tier: config.name,
        action: 'reopen',
        originalParams: params,
      }
    );
    let failedOutput = failedResult.output;
    if (decision.stop && decision.questionKey) {
      const choiceBlock = formatChoiceForChat(decision);
      if (choiceBlock) failedOutput = `${failedOutput}\n\n---\n\n${choiceBlock}`;
    }
    return {
      ...failedResult,
      output: failedOutput,
      controlPlaneDecision: decision,
    };
  }

  if (config.name === 'task') {
    const r: TierReopenResult = {
      success: false,
      output: 'Task reopen is not supported. Reopen the session to add or change tasks.',
      previousStatus: '',
      newStatus: '',
      modeGate: '',
    };
    const decision = routeByOutcome(
      {
        success: false,
        output: r.output,
        outcome: { reasonCode: 'unhandled_error', nextAction: r.output },
      },
      { tier: config.name, action: 'reopen', originalParams: params }
    );
    let out = r.output;
    if (decision.stop && decision.questionKey) {
      const choiceBlock = formatChoiceForChat(decision);
      if (choiceBlock) out = `${out}\n\n---\n\n${choiceBlock}`;
    }
    return { ...r, output: out, controlPlaneDecision: decision };
  }

  const featureName = context.feature.name;
  const workProfile = classifyWorkProfile({ tier: config.name, action: 'reopen' });

  try {
    const spec = buildSpecFromTierRun({
      tier: config.name,
      action: 'reopen',
      identifier,
      featureContext: { featureId: featureName, featureName },
      mode: 'execute',
      workProfile,
      metadata,
    });
    const adapter = createStepAdapter({
      config,
      actionParams: { action: 'reopen', params },
      context,
    });
    const kernelResult = await defaultKernel.run(spec, {
      contextInjector: createContextInjector(),
      recorder: shadowRecorder,
      adapter,
      profileDefaults: defaultProfileDefaultsResolver,
      routingContext: { tier: config.name, action: 'reopen', originalParams: params, workProfile },
      plugins: createDefaultPlugins(),
    });

    let finalOutput = kernelResult.output;
    if (kernelResult.controlPlaneDecision.stop && kernelResult.controlPlaneDecision.questionKey) {
      const choiceBlock = formatChoiceForChat(kernelResult.controlPlaneDecision);
      if (choiceBlock) finalOutput = `${finalOutput}\n\n---\n\n${choiceBlock}`;
    }

    const base: TierReopenResult = kernelResult.success
      ? {
          success: true,
          output: finalOutput,
          previousStatus: 'Complete',
          newStatus: 'Reopened',
          modeGate: '',
        }
      : {
          success: false,
          output: finalOutput,
          previousStatus: '',
          newStatus: '',
          modeGate: '',
        };

    return {
      ...base,
      controlPlaneDecision: kernelResult.controlPlaneDecision,
      traceId: kernelResult.traceId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordOrchestratorFailureFriction({
      action: 'reopen',
      tier: config.name,
      identifier,
      featureName: context.feature.name,
      reasonCodeRaw: 'unhandled_error',
      symptom: message,
      context: `runTierReopen: defaultKernel.run threw.\n\n${paramsSnippet(params)}`,
    });
    const failedResult: TierReopenResult = {
      success: false,
      output: `**${config.name}-reopen failed:**\n\n\`\`\`\n${message}\n\`\`\``,
      previousStatus: '',
      newStatus: '',
      modeGate: '',
    };
    const decision = routeByOutcome(
      {
        success: false,
        output: failedResult.output,
        outcome: { reasonCode: 'unhandled_error', nextAction: failedResult.output },
      },
      {
        tier: config.name,
        action: 'reopen',
        originalParams: params,
      }
    );
    let failedOutput = failedResult.output;
    if (decision.stop && decision.questionKey) {
      const choiceBlock = formatChoiceForChat(decision);
      if (choiceBlock) failedOutput = `${failedOutput}\n\n---\n\n${choiceBlock}`;
    }
    return {
      ...failedResult,
      output: failedOutput,
      controlPlaneDecision: decision,
    };
  }
}
