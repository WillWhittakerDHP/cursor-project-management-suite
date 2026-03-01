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
} from './contracts';
import { getStepGraph } from './step-graph';
import { routeByOutcome } from '../tiers/shared/control-plane-route';
import type { CommandResultForRouting, ControlPlaneContext } from '../tiers/shared/control-plane-types';

const clock = (): number => (typeof Date.now === 'function' ? Date.now() : 0);

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

/** Default kernel implementation: getStepGraph + run loop. */
export const defaultKernel: HarnessKernel = {
  getStepGraph(spec: WorkflowSpec): StepDefinition[] {
    return getStepGraph(spec);
  },

  async run(spec: WorkflowSpec, deps: HarnessDeps): Promise<HarnessRunResult> {
    const startMs = deps.clock?.() ?? clock();
    const handle = await deps.recorder.begin({
      runId: spec.runId,
      tier: spec.tier,
      action: spec.action,
      identifier: spec.identifier,
    });
    const ctx = createContext(spec, handle);
    const graph = getStepGraph(spec);
    const stepPath: string[] = [];
    let lastResult: { success: boolean; output: string; outcome: TierOutcome } | null = null;
    const activePlugins = deps.plugins ? deps.plugins.getForSpec(spec).filter((p) => spec.constraints.allowWrites || !p.capabilities.includes('write_context')) : [];

    stepLoop: for (const stepDef of graph) {
        const stepId = stepDef.id;
        const stepStart = deps.clock?.() ?? clock();
        await deps.recorder.step(handle, {
          step: stepId,
          phase: 'enter',
          ts: new Date().toISOString(),
        });

        for (const plugin of activePlugins) {
          if (!plugin.beforeStep) continue;
          try {
            const res: PluginStepResult = await plugin.beforeStep(ctx, stepId);
            if (res.action === 'abort_run') {
              lastResult = {
                success: false,
                output: ctx.output.join('\n\n'),
                outcome: { status: 'failed', reasonCode: 'preflight_failed', nextAction: res.diagnostic ?? 'Plugin aborted run.' },
              };
              break stepLoop;
            }
            if (res.action === 'skip_step') continue;
          } catch (_e) {
            ctx.diagnostics.push({ plugin: plugin.name, step: stepId, message: 'beforeStep threw (ignored)' });
          }
        }
        if (lastResult !== null) break;

        let stepResult: import('./contracts').StepRunResult | null = null;
        try {
          stepResult = await deps.adapter.runStep(ctx, stepId);
        } catch (err) {
          for (const plugin of activePlugins) {
            if (plugin.onFailure) {
              try {
                await plugin.onFailure(ctx, stepId, err);
              } catch (_e) {
                ctx.diagnostics.push({ plugin: plugin.name, step: stepId, message: 'onFailure threw (ignored)' });
              }
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
          lastResult = {
            success: false,
            output: ctx.output.join('\n\n'),
            outcome: {
              status: 'failed',
              reasonCode: 'unhandled_error',
              nextAction: `Step ${stepId} failed: ${message}`,
            },
          };
          break;
        }

        for (const plugin of activePlugins) {
          if (!plugin.afterStep) continue;
          try {
            const res: PluginStepResult = await plugin.afterStep(ctx, stepId);
            if (res.action === 'abort_run' && lastResult == null) {
              lastResult = {
                success: false,
                output: ctx.output.join('\n\n'),
                outcome: { status: 'failed', reasonCode: 'preflight_failed', nextAction: res.diagnostic ?? 'Plugin aborted run.' },
              };
              break stepLoop;
            }
          } catch (_e) {
            ctx.diagnostics.push({ plugin: plugin.name, step: stepId, message: 'afterStep threw (ignored)' });
          }
        }
        if (lastResult !== null && !lastResult.success) break;

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
          lastResult = {
            success: stepResult.success,
            output: ctx.output.join('\n\n'),
            outcome: stepResult.outcome,
          };
          if (stepResult.exitEarly) break;
        } else {
          await deps.recorder.step(handle, {
            step: stepId,
            phase: 'exit_success',
            ts: new Date().toISOString(),
            durationMs,
          });
          stepPath.push(stepId);
        }
      }

    let finalResult = lastResult ?? {
      success: false,
      output: ctx.output.join('\n\n'),
      outcome: defaultOutcome(false),
    };
    for (const plugin of activePlugins) {
      if (!plugin.contributeOutcome) continue;
      try {
        const partial = plugin.contributeOutcome(ctx);
        if (partial && typeof partial === 'object') {
          finalResult = {
            ...finalResult,
            outcome: { ...finalResult.outcome, ...partial },
          };
        }
      } catch (_e) {
        ctx.diagnostics.push({ plugin: plugin.name, step: '', message: 'contributeOutcome threw (ignored)' });
      }
    }
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
    const controlPlaneDecision: ControlPlaneDecision = deps.routingContext
      ? (routeByOutcome(forRouting, deps.routingContext as ControlPlaneContext) as unknown as ControlPlaneDecision)
      : {
          requiredMode: 'plan' as const,
          stop: !finalResult.success,
          message: finalResult.outcome.nextAction,
        } as ControlPlaneDecision;

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
  },
};
