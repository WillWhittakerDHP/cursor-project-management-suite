/**
 * Shared tier start: dispatches to feature/phase/session/task start implementations.
 * Single entry point for tier start pipeline; each tier's logic remains in its composite.
 * Control-plane routing runs after the command; result includes controlPlaneDecision for routing.
 */

import type { TierConfig } from './types';
import {
  type CommandExecutionOptions,
  resolveCommandExecutionMode,
  isPlanMode,
} from '../../utils/command-execution-mode';
import type { TierStartResult, TierStartOutcome } from '../../utils/tier-outcome';
import { verifyApp } from '../../utils/verify-app';
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
import { WorkflowCommandContext, type TierParamsBag } from '../../utils/command-context';
import { WorkflowId } from '../../utils/id-utils';
import {
  writeTierStartPending,
  writeTaskStartPending,
  type TierStartPendingParams,
  type TaskStartPendingState,
} from './pending-state';
import {
  buildWorkflowFrictionEntryFromOrchestrator,
  recordWorkflowFriction,
  shouldAppendWorkflowFriction,
} from '../../utils/workflow-friction-log';

export type TierStartParams =
  | { featureId: string }
  | ({ phaseId: string } & ({ featureId: string } | { featureName: string }))
  | ({ sessionId: string; description?: string } & ({ featureId: string } | { featureName: string }))
  | { taskId: string; featureId?: string; featureName?: string };

function paramsSnippetForWorkflowFriction(params: TierStartParams): string {
  try {
    const s = JSON.stringify(params);
    return s.length > 2000 ? `${s.slice(0, 2000)}\n\n…(truncated)` : s;
  } catch {
    return '(params not serializable)';
  }
}

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
  // Default plan so start always creates planning doc and exits; execute via /accepted-plan + /accepted-build (feature/phase/session) or /accepted-code (task).
  const executionMode = resolveCommandExecutionMode(options, 'plan');

  const shadowRecorder = getDefaultShadowRecorder();
  const identifier = getIdentifierFromParams(config, params);

  // Resolve F/P/S/T context first; fail fast before any preflight or steps.
  let context: WorkflowCommandContext;
  try {
    context = await WorkflowCommandContext.contextFromParams(config.name, params as TierParamsBag);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failedResult: TierStartResult = {
      success: false,
      output: `**${config.name}-start failed:**\n\n\`\`\`\n${message}\n\`\`\``,
      outcome: {
        status: 'failed',
        reasonCode: 'unhandled_error',
        nextAction: `Context resolution failed. Check tier identifier and feature.`,
      },
    };
    const rc = String(failedResult.outcome.reasonCode ?? 'unhandled_error');
    if (shouldAppendWorkflowFriction({ success: false, reasonCodeRaw: rc })) {
      recordWorkflowFriction(
        buildWorkflowFrictionEntryFromOrchestrator({
          action: 'start',
          tier: config.name,
          identifier: identifier || '—',
          reasonCodeRaw: rc,
          symptom: message,
          context: `WorkflowCommandContext.contextFromParams failed.\n\n${paramsSnippetForWorkflowFriction(params)}`,
        })
      );
    }
    const decision = routeByOutcome(
      failedResult,
      { tier: config.name, action: 'start', originalParams: params }
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
    };
  }

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
      };
      const decision = routeByOutcome(
        failedResult,
        { tier: config.name, action: 'start', originalParams: params }
      );
      return {
        ...failedResult,
        output: appCheck.output,
        controlPlaneDecision: decision,
      };
    }
  }

  try {
    const featureName = context.feature.name;
    const workProfile =
      options?.workProfile ?? classifyWorkProfile({ tier: config.name, action: 'start' });
    const spec = buildSpecFromTierRun({
      tier: config.name,
      action: 'start',
      identifier,
      featureContext: { featureId: featureName, featureName },
      mode: executionMode,
      workProfile,
    });
    const adapter = createStepAdapter({
      config,
      params,
      options: { ...options, workProfile },
      context,
    });
    const kernelResult = await defaultKernel.run(spec, {
      contextInjector: createContextInjector(),
      recorder: shadowRecorder,
      adapter,
      profileDefaults: defaultProfileDefaultsResolver,
      routingContext: { tier: config.name, action: 'start', originalParams: params, workProfile },
      plugins: createDefaultPlugins(),
    });
    const reasonCode = kernelResult.outcome.reasonCode;
    if (reasonCode === 'context_gathering') {
      if (config.name === 'feature' || config.name === 'phase' || config.name === 'session') {
        await writeTierStartPending({
          tier: config.name,
          params: params as TierStartPendingParams,
          pass: 1,
          workProfile,
          gateProfile: workProfile.gateProfile,
          ...(kernelResult.outcome.leafTier === true && { leafTier: true }),
        });
      } else if (config.name === 'task') {
        const p = params as { taskId: string; featureId?: string; featureName?: string };
        const derived = WorkflowId.parseTaskId(p.taskId.trim())?.feature;
        const fn = p.featureName?.trim();
        const fid = p.featureId?.trim();
        const pending: TaskStartPendingState = {
          taskId: p.taskId,
          workProfile,
        };
        if (fn) pending.featureName = fn;
        else if (fid) pending.featureId = fid;
        else if (derived) pending.featureId = derived;
        await writeTaskStartPending(pending);
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
        workProfile,
        gateProfile: workProfile.gateProfile,
        ...(kernelResult.outcome.leafTier === true && { leafTier: true }),
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
      outcome: kernelResult.outcome as TierStartResult['outcome'],
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
    };
    const decision = routeByOutcome(
      failedResult,
      { tier: config.name, action: 'start', originalParams: params }
    );
    let failedOutput = (failedResult as TierStartResult).output;
    if (decision.stop && decision.questionKey) {
      const choiceBlock = formatChoiceForChat(decision);
      if (choiceBlock) failedOutput = failedOutput + '\n\n---\n\n' + choiceBlock;
    }
    return {
      ...failedResult,
      output: failedOutput,
      controlPlaneDecision: decision,
    };
  }
}

/** Result of runTierStart including control-plane decision for mode/choice routing. */
export type TierStartResultWithControlPlane = TierStartResult & {
  controlPlaneDecision: ControlPlaneDecision;
};
