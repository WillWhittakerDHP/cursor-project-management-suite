/**
 * Tier adapter: maps kernel step intents to existing tier start/end implementations.
 * Runs full legacy workflow on first step for parity; step-by-step refinement can follow.
 * Uses ctx.traceHandle from the kernel so a single trace is recorded.
 */

import type { TierAdapter as ITierAdapter, HarnessContext, StepId, StepRunResult } from './contracts';
import { adaptTierStartOutcomeToHarness, adaptTierEndOutcomeToHarness } from './adapters';
import type { TierConfig } from '../tiers/shared/types';
import type { TierStartParams } from '../tiers/shared/tier-start';
import type { TierEndParams } from '../tiers/shared/tier-end';
import type { CommandExecutionOptions } from '../utils/command-execution-mode';
import { featureStartImpl } from '../tiers/feature/composite/feature-start-impl';
import { phaseStartImpl } from '../tiers/phase/composite/phase-start-impl';
import { sessionStartImpl } from '../tiers/session/composite/session-start-impl';
import { taskStartImpl } from '../tiers/task/composite/task-start-impl';
import { featureEndImpl } from '../tiers/feature/composite/feature-end-impl';
import { phaseEndImpl } from '../tiers/phase/composite/phase-end-impl';
import { sessionEndImpl } from '../tiers/session/composite/session-end-impl';
import { taskEndImpl } from '../tiers/task/composite/task-end-impl';
import { getDefaultShadowRecorder } from './run-recorder-shadow';

const FIRST_STEP: StepId = 'validate_identifier';

export interface TierAdapterOptions {
  config: TierConfig;
  params: TierStartParams | TierEndParams;
  options?: CommandExecutionOptions;
}

/** Create a tier adapter that delegates to the legacy start/end impls. Runs full workflow on first step. */
export function createTierAdapter(opts: TierAdapterOptions): ITierAdapter {
  const { config, params, options } = opts;
  const recorder = getDefaultShadowRecorder();
  let ran = false;

  return {
    async runStep(ctx: HarnessContext, stepId: StepId): Promise<StepRunResult | null> {
      if (stepId !== FIRST_STEP) return null;
      if (ran) return null;
      ran = true;

      const shadowContext = { recorder, handle: ctx.traceHandle };

      const spec = ctx.spec;
      if (spec.action === 'start') {
        const startParams = params as TierStartParams;
        let result: { success: boolean; output: string; outcome: { reasonCode: string; nextAction: string; deliverables?: string; cascade?: import('./contracts').CascadeInfo } };
        switch (config.name) {
          case 'feature':
            result = await featureStartImpl((startParams as { featureId: string }).featureId, options, shadowContext);
            break;
          case 'phase':
            result = await phaseStartImpl((startParams as { phaseId: string }).phaseId, options, shadowContext);
            break;
          case 'session': {
            const p = startParams as { sessionId: string; description?: string };
            result = await sessionStartImpl(p.sessionId, p.description, options, shadowContext);
            break;
          }
          case 'task': {
            const p = startParams as { taskId: string; featureId?: string };
            result = await taskStartImpl(p.taskId, p.featureId, options, shadowContext);
            break;
          }
          default:
            result = { success: false, output: '', outcome: { reasonCode: 'unknown_tier', nextAction: 'Unknown tier.' } };
        }
        const outcome = adaptTierStartOutcomeToHarness(result.outcome as import('../utils/tier-outcome').TierStartOutcome);
        ctx.output.push(result.output);
        return { success: result.success, output: result.output, outcome, exitEarly: true };
      }

      if (spec.action === 'end') {
        const endParams = params as TierEndParams;
        let result: { success: boolean; output: string; outcome: { reasonCode: string; nextAction: string; deliverables?: string; cascade?: import('./contracts').CascadeInfo } };
        switch (config.name) {
          case 'feature':
            result = await featureEndImpl(endParams as import('../tiers/feature/composite/feature-end-impl').FeatureEndParams, shadowContext);
            break;
          case 'phase':
            result = await phaseEndImpl(endParams as import('../tiers/phase/composite/phase-end-impl').PhaseEndParams, shadowContext);
            break;
          case 'session':
            result = await sessionEndImpl(endParams as import('../tiers/session/composite/session-end-impl').SessionEndParams, shadowContext);
            break;
          case 'task':
            result = await taskEndImpl(endParams as import('../tiers/task/composite/task-end-impl').TaskEndParams, shadowContext);
            break;
          default:
            result = { success: false, output: '', outcome: { reasonCode: 'unknown_tier', nextAction: 'Unknown tier.' } };
        }
        const outcome = adaptTierEndOutcomeToHarness(result.outcome as import('../utils/tier-outcome').TierEndOutcome);
        ctx.output.push(result.output);
        return { success: result.success, output: result.output, outcome, exitEarly: true };
      }

      return null;
    },
  };
}
