/**
 * Step adapter: Pattern A — TierAdapter.runStep runs full tier start/end orchestration on validate_identifier.
 * Outcome normalization lives here (formerly harness/adapters.ts).
 */

import type {
  TierAdapter as ITierAdapter,
  HarnessContext,
  StepId,
  StepRunResult,
  TierOutcome,
  TierStatus,
} from './contracts';
import { parseReasonCode } from './reason-code';
import type { TierConfig } from '../tiers/shared/types';
import type { TierStartParams } from '../tiers/shared/tier-start';
import type { TierEndParams } from '../tiers/shared/tier-end';
import type { CommandExecutionOptions } from '../utils/command-execution-mode';
import type { WorkflowCommandContext } from '../utils/command-context';
import type { TierStartOutcome, TierEndOutcome, TierEndStatus } from '../utils/tier-outcome';
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

function mapEndStatusToTierStatus(s: TierEndStatus): TierStatus {
  switch (s) {
    case 'completed':
      return 'completed';
    case 'blocked_needs_input':
      return 'needs_input';
    case 'blocked_fix_required':
      return 'blocked';
    case 'failed':
      return 'failed';
  }
}

function adaptTierStartOutcomeToHarness(outcome: TierStartOutcome): TierOutcome {
  return {
    ...outcome,
    reasonCode: parseReasonCode(outcome.reasonCode),
  };
}

function adaptTierEndOutcomeToHarness(outcome: TierEndOutcome): TierOutcome {
  return {
    status: mapEndStatusToTierStatus(outcome.status),
    reasonCode: parseReasonCode(outcome.reasonCode),
    nextAction: outcome.nextAction,
    ...(outcome.deliverables !== undefined && outcome.deliverables !== '' && { deliverables: outcome.deliverables }),
    ...(outcome.cascade !== undefined && { cascade: { ...outcome.cascade, tier: outcome.cascade.tier } }),
  };
}

export interface StepAdapterOptions {
  config: TierConfig;
  params: TierStartParams | TierEndParams;
  options?: CommandExecutionOptions;
  context?: WorkflowCommandContext;
}

export function createStepAdapter(opts: StepAdapterOptions): ITierAdapter {
  const { config, params, options, context } = opts;
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
        const resolvedCtx = context ?? undefined;
        let result: {
          success: boolean;
          output: string;
          outcome: {
            reasonCode: string;
            nextAction: string;
            deliverables?: string;
            cascade?: import('./contracts').CascadeInfo;
          };
        };
        switch (config.name) {
          case 'feature':
            result = await featureStartImpl(
              (startParams as { featureId: string }).featureId,
              options,
              shadowContext,
              resolvedCtx
            );
            break;
          case 'phase': {
            const p = startParams as {
              phaseId: string;
              featureId?: string;
              featureName?: string;
            };
            result = await phaseStartImpl(
              p.phaseId,
              options,
              shadowContext,
              resolvedCtx,
              { featureId: p.featureId, featureName: p.featureName }
            );
            break;
          }
          case 'session': {
            const p = startParams as {
              sessionId: string;
              description?: string;
              featureId?: string;
              featureName?: string;
            };
            result = await sessionStartImpl(
              p.sessionId,
              p.description,
              options,
              shadowContext,
              resolvedCtx,
              { featureId: p.featureId, featureName: p.featureName }
            );
            break;
          }
          case 'task':
            result = await taskStartImpl(context!, options, shadowContext);
            break;
          default:
            result = {
              success: false,
              output: '',
              outcome: { reasonCode: 'unknown_tier', nextAction: 'Unknown tier.' },
            };
        }
        const outcome = adaptTierStartOutcomeToHarness(result.outcome as TierStartOutcome);
        return { success: result.success, output: result.output, outcome, exitEarly: true };
      }

      if (spec.action === 'end') {
        const endParams = params as TierEndParams;
        const resolvedCtx = context ?? undefined;
        let result: {
          success: boolean;
          output: string;
          outcome: {
            reasonCode: string;
            nextAction: string;
            deliverables?: string;
            cascade?: import('./contracts').CascadeInfo;
          };
        };
        switch (config.name) {
          case 'feature':
            result = await featureEndImpl(
              endParams as import('../tiers/feature/composite/feature-end-impl').FeatureEndParams,
              shadowContext,
              resolvedCtx
            );
            break;
          case 'phase':
            result = await phaseEndImpl(
              endParams as import('../tiers/phase/composite/phase-end-impl').PhaseEndParams,
              shadowContext,
              resolvedCtx
            );
            break;
          case 'session':
            result = await sessionEndImpl(
              endParams as import('../tiers/session/composite/session-end-impl').SessionEndParams,
              shadowContext,
              resolvedCtx
            );
            break;
          case 'task':
            result = await taskEndImpl(
              endParams as import('../tiers/task/composite/task-end-impl').TaskEndParams,
              shadowContext,
              resolvedCtx
            );
            break;
          default:
            result = {
              success: false,
              output: '',
              outcome: { reasonCode: 'unknown_tier', nextAction: 'Unknown tier.' },
            };
        }
        const outcome = adaptTierEndOutcomeToHarness(result.outcome as TierEndOutcome);
        return { success: result.success, output: result.output, outcome, exitEarly: true };
      }

      return null;
    },
  };
}
