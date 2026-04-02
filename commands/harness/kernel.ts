/**
 * Harness kernel: deterministic step graph and step runner loop (charter §7.2).
 * Runs steps in order, records events, delegates step execution to TierAdapter.
 */

import type {
  WorkflowSpec,
  HarnessContext,
  HarnessDeps,
  HarnessRunResult,
  HarnessKernel,
  StepDefinition,
  StepId,
  TierOutcome,
  RunTraceHandle,
  ControlPlaneDecision,
  PluginStepResult,
  StepRunResult,
  PolicyPlugin,
} from './contracts';
import { getStepGraph } from './step-graph';
import { routeByOutcome } from '../tiers/shared/control-plane-route';
import type { CommandResultForRouting, ControlPlaneContext } from '../tiers/shared/control-plane-types';
import { recordHarnessPluginAdvisoryFriction } from './workflow-friction-manager';

const clock = (): number => (typeof Date.now === 'function' ? Date.now() : 0);

/** Cap plugin diagnostic lines so harness output stays bounded. */
const MAX_PLUGIN_DIAGNOSTIC_CHARS = 500;

/** Success-path chat output: avoid huge `output` strings on start_ok / end_ok (friction: unhandled_error noise). */
const MAX_SUCCESS_KERNEL_OUTPUT_CHARS = 12_000;
const SUCCESS_OUTPUT_CAP_REASONS = new Set<string>(['start_ok', 'end_ok', 'task_complete', 'reopen_ok']);

function capSuccessKernelOutput(output: string, success: boolean, reasonCode: string): string {
  if (!success || !SUCCESS_OUTPUT_CAP_REASONS.has(reasonCode)) {
    return output;
  }
  if (output.length <= MAX_SUCCESS_KERNEL_OUTPUT_CHARS) {
    return output;
  }
  return `${output.slice(0, MAX_SUCCESS_KERNEL_OUTPUT_CHARS)}\n\n---\n*(Harness success output truncated; see run trace / shadow recorder for full text.)*`;
}

function pushPluginDiagnostic(
  ctx: HarnessContext,
  plugin: string,
  step: StepId | '',
  message: string
): void {
  const capped =
    message.length > MAX_PLUGIN_DIAGNOSTIC_CHARS
      ? `${message.slice(0, MAX_PLUGIN_DIAGNOSTIC_CHARS)}…`
      : message;
  ctx.diagnostics.push({ plugin, step, message: capped });
}

type StepLoopResult = { success: boolean; output: string; outcome: TierOutcome } | null;

function defaultOutcome(success: boolean): TierOutcome {
  return {
    status: success ? 'completed' : 'failed',
    reasonCode: success ? 'start_ok' : 'unhandled_error',
    nextAction: success ? 'Done.' : 'See trace for failing step.',
  };
}

/** Create minimal harness context for a run. */
function createContext(spec: WorkflowSpec, traceHandle: RunTraceHandle): HarnessContext {
  return {
    spec,
    traceHandle,
    tierState: { scope: {}, status: null, branchName: null },
    contextPack: null,
    output: [],
    stepResults: {},
    diagnostics: [],
  };
}

async function runPluginBeforeStep(
  ctx: HarnessContext,
  stepId: StepId,
  activePlugins: PolicyPlugin[]
): Promise<{ lastResult: StepLoopResult; breakStepLoop: boolean }> {
  let lastResult: StepLoopResult = null;
  let breakStepLoop = false;
  for (const plugin of activePlugins) {
    if (!plugin.beforeStep) continue;
    try {
      const res: PluginStepResult = await plugin.beforeStep(ctx, stepId);
      if (res.action === 'abort_run') {
        if (res.diagnostic) {
          pushPluginDiagnostic(ctx, plugin.name, stepId, res.diagnostic);
        }
        lastResult = {
          success: false,
          output: ctx.output.join('\n\n'),
          outcome: { status: 'failed', reasonCode: 'preflight_failed', nextAction: res.diagnostic ?? 'Plugin aborted run.' },
        };
        breakStepLoop = true;
        break;
      }
      if (res.diagnostic) {
        pushPluginDiagnostic(ctx, plugin.name, stepId, res.diagnostic);
      }
      if (res.action === 'skip_step') continue;
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      pushPluginDiagnostic(ctx, plugin.name, stepId, `beforeStep threw: ${detail}`);
    }
  }
  return { lastResult, breakStepLoop };
}

async function recordStepFailure(
  handle: RunTraceHandle,
  stepId: StepId,
  stepStart: number,
  deps: HarnessDeps,
  stepPath: string[],
  ctx: HarnessContext,
  activePlugins: PolicyPlugin[],
  err: unknown
): Promise<{ stepResult: null; lastResult: StepLoopResult }> {
  for (const plugin of activePlugins) {
    if (!plugin.onFailure) continue;
    try {
      await plugin.onFailure(ctx, stepId, err);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      pushPluginDiagnostic(ctx, plugin.name, stepId, `onFailure threw: ${detail}`);
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  await deps.recorder.step(handle, {
    step: stepId,
    phase: 'exit_failure',
    ts: new Date().toISOString(),
    reasonCode: 'unhandled_error',
    details: { error: message },
  });
  stepPath.push(stepId);
  ctx.stepResults[stepId] = { success: false, output: message, durationMs: (deps.clock?.() ?? clock()) - stepStart };
  const lastResult: StepLoopResult = {
    success: false,
    output: ctx.output.join('\n\n'),
    outcome: {
      status: 'failed',
      reasonCode: 'unhandled_error',
      nextAction: `Step ${stepId} failed: ${message}`,
    },
  };
  return { stepResult: null, lastResult };
}

async function runStepWithAdapter(
  ctx: HarnessContext,
  stepId: StepId,
  stepStart: number,
  deps: HarnessDeps,
  stepPath: string[],
  activePlugins: PolicyPlugin[]
): Promise<{ stepResult: StepRunResult | null; lastResult: StepLoopResult }> {
  try {
    const stepResult = await deps.adapter.runStep(ctx, stepId);
    return { stepResult, lastResult: null };
  } catch (err) {
    return recordStepFailure(ctx.traceHandle!, stepId, stepStart, deps, stepPath, ctx, activePlugins, err);
  }
}

async function recordStepCompletion(
  handle: RunTraceHandle,
  stepId: StepId,
  stepResult: StepRunResult | null,
  stepStart: number,
  deps: HarnessDeps,
  stepPath: string[],
  ctx: HarnessContext
): Promise<{ lastResult: StepLoopResult; exitEarly: boolean }> {
  const durationMs = (deps.clock?.() ?? clock()) - stepStart;
  if (stepResult !== null) {
    const success = stepResult.success;
    await deps.recorder.step(handle, {
      step: stepId,
      phase: success ? 'exit_success' : 'exit_failure',
      ts: new Date().toISOString(),
      durationMs,
      reasonCode: stepResult.outcome.reasonCode,
    });
    stepPath.push(stepId);
    ctx.stepResults[stepId] = {
      success,
      output: stepResult.output,
      durationMs,
    };
    if (stepResult.output) ctx.output.push(stepResult.output);
    const lastResult: StepLoopResult = {
      success: stepResult.success,
      output: ctx.output.join('\n\n'),
      outcome: stepResult.outcome,
    };
    return { lastResult, exitEarly: stepResult.exitEarly === true };
  }
  await deps.recorder.step(handle, {
    step: stepId,
    phase: 'exit_success',
    ts: new Date().toISOString(),
    durationMs,
  });
  stepPath.push(stepId);
  return { lastResult: null, exitEarly: false };
}

async function runPluginAfterStep(
  ctx: HarnessContext,
  stepId: StepId,
  activePlugins: PolicyPlugin[],
  lastResult: StepLoopResult
): Promise<{ lastResult: StepLoopResult; breakStepLoop: boolean }> {
  let breakStepLoop = false;
  for (const plugin of activePlugins) {
    if (!plugin.afterStep) continue;
    try {
      const res: PluginStepResult = await plugin.afterStep(ctx, stepId);
      if (res.diagnostic) {
        pushPluginDiagnostic(ctx, plugin.name, stepId, res.diagnostic);
      }
      if (res.action === 'abort_run' && lastResult == null) {
        lastResult = {
          success: false,
          output: ctx.output.join('\n\n'),
          outcome: { status: 'failed', reasonCode: 'preflight_failed', nextAction: res.diagnostic ?? 'Plugin aborted run.' },
        };
        breakStepLoop = true;
        break;
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      pushPluginDiagnostic(ctx, plugin.name, stepId, `afterStep threw: ${detail}`);
    }
  }
  return { lastResult, breakStepLoop };
}

function applyPluginOutcomeContributions(
  ctx: HarnessContext,
  activePlugins: PolicyPlugin[],
  finalResult: { success: boolean; output: string; outcome: TierOutcome }
): { success: boolean; output: string; outcome: TierOutcome } {
  let result = finalResult;
  for (const plugin of activePlugins) {
    if (!plugin.contributeOutcome) continue;
    try {
      const partial = plugin.contributeOutcome(ctx);
      if (partial && typeof partial === 'object') {
        const { pluginAdvisory: partialAdvisory, ...restPartial } = partial;
        const mergedAdvisory = [result.outcome.pluginAdvisory, partialAdvisory].filter(Boolean).join('\n\n');
        result = {
          ...result,
          outcome: {
            ...result.outcome,
            ...restPartial,
            ...(mergedAdvisory ? { pluginAdvisory: mergedAdvisory } : {}),
          },
        };
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      pushPluginDiagnostic(ctx, plugin.name, '', `contributeOutcome threw: ${detail}`);
    }
  }
  return result;
}

async function buildAndRecordDecision(
  handle: RunTraceHandle,
  finalResult: { success: boolean; output: string; outcome: TierOutcome },
  deps: HarnessDeps,
  stepPath: string[],
  spec: WorkflowSpec
): Promise<HarnessRunResult> {
  const forRouting: CommandResultForRouting = {
    success: finalResult.success,
    output: finalResult.output,
    outcome: {
      reasonCode: finalResult.outcome.reasonCode,
      nextAction: finalResult.outcome.nextAction,
      ...(finalResult.outcome.deliverables !== undefined && { deliverables: finalResult.outcome.deliverables }),
      ...(finalResult.outcome.cascade !== undefined && { cascade: finalResult.outcome.cascade }),
    },
  };
  let controlPlaneDecision: ControlPlaneDecision = deps.routingContext
    ? routeByOutcome(forRouting, deps.routingContext as ControlPlaneContext)
    : {
        requiredMode: 'plan' as const,
        stop: !finalResult.success,
        message: finalResult.outcome.nextAction,
      } as ControlPlaneDecision;

  const pluginAdvisoryTrimmed = finalResult.outcome.pluginAdvisory?.trim();
  if (pluginAdvisoryTrimmed) {
    recordHarnessPluginAdvisoryFriction({
      advisoryMarkdown: pluginAdvisoryTrimmed,
      tier: spec.tier,
      identifier: spec.identifier,
      featureName: spec.featureContext.featureName,
      runId: spec.runId,
      harnessAction: spec.action,
      harnessSuccess: finalResult.success,
    });
    controlPlaneDecision = {
      ...controlPlaneDecision,
      message: `${controlPlaneDecision.message}\n\n${pluginAdvisoryTrimmed}`,
    };
  }

  await deps.recorder.decision(handle, {
    requiredMode: controlPlaneDecision.requiredMode,
    stop: controlPlaneDecision.stop,
    message: controlPlaneDecision.message,
    questionKey: controlPlaneDecision.questionKey,
    cascadeCommand: controlPlaneDecision.cascadeCommand,
  });
  await deps.recorder.end(handle, {
    success: finalResult.success,
    output: finalResult.output,
    outcome: finalResult.outcome,
    controlPlaneDecision,
    traceId: handle.traceId,
    stepPath: stepPath as StepId[],
  });

  return {
    success: finalResult.success,
    output: finalResult.output,
    outcome: finalResult.outcome,
    controlPlaneDecision,
    traceId: handle.traceId,
    stepPath: stepPath as StepId[],
  };
}

/** Default kernel implementation: getStepGraph + run loop. */
export const defaultKernel: HarnessKernel = {
  getStepGraph(spec: WorkflowSpec): StepDefinition[] {
    return getStepGraph(spec);
  },

  async run(spec: WorkflowSpec, deps: HarnessDeps): Promise<HarnessRunResult> {
    const handle = await deps.recorder.begin({
      runId: spec.runId,
      tier: spec.tier,
      action: spec.action,
      identifier: spec.identifier,
    });
    const ctx = createContext(spec, handle);
    const graph = getStepGraph(spec);
    const stepPath: string[] = [];
    let lastResult: StepLoopResult = null;
    const activePlugins = deps.plugins ? deps.plugins.getForSpec(spec).filter((p) => spec.constraints.allowWrites || !p.capabilities.includes('write_context')) : [];

    stepLoop: for (const stepDef of graph) {
      const stepId = stepDef.id;
      const stepStart = deps.clock?.() ?? clock();
      await deps.recorder.step(handle, {
        step: stepId,
        phase: 'enter',
        ts: new Date().toISOString(),
      });

      const before = await runPluginBeforeStep(ctx, stepId, activePlugins);
      if (before.breakStepLoop) break stepLoop;
      lastResult = before.lastResult;
      if (lastResult !== null) break;

      const stepOut = await runStepWithAdapter(ctx, stepId, stepStart, deps, stepPath, activePlugins);
      lastResult = stepOut.lastResult;
      if (lastResult !== null) break;

      const after = await runPluginAfterStep(ctx, stepId, activePlugins, lastResult);
      lastResult = after.lastResult;
      if (after.breakStepLoop) break stepLoop;
      if (lastResult !== null && !lastResult.success) break;

      const stepResult = stepOut.stepResult;
      const completion = await recordStepCompletion(handle, stepId, stepResult, stepStart, deps, stepPath, ctx);
      if (completion.lastResult !== null) lastResult = completion.lastResult;
      if (completion.exitEarly) break;
    }

    let finalResult: StepLoopResult = lastResult ?? {
      success: false,
      output: ctx.output.join('\n\n'),
      outcome: defaultOutcome(false),
    };
    finalResult = applyPluginOutcomeContributions(ctx, activePlugins, finalResult);
    if (ctx.diagnostics.length > 0) {
      const diagBlock = ctx.diagnostics.map((d) => `- [${d.plugin}] ${d.message}`).join('\n');
      finalResult = {
        ...finalResult,
        output: `${finalResult.output}\n\n---\nPlugin diagnostics:\n${diagBlock}`,
      };
    }
    const reason = String(finalResult.outcome.reasonCode ?? '');
    finalResult = {
      ...finalResult,
      output: capSuccessKernelOutput(finalResult.output, finalResult.success, reason),
    };
    return buildAndRecordDecision(handle, finalResult, deps, stepPath, spec);
  },
};
