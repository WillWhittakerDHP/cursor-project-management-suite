/**
 * Step adapter: Pattern A — TierAdapter.runStep runs full tier start/end/reopen orchestration on validate_identifier.
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
import type { TierReopenParams, TierReopenResult } from '../tiers/shared/tier-reopen-workflow';
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
import { featureReopenImpl } from '../tiers/feature/composite/feature-reopen-impl';
import { phaseReopenImpl } from '../tiers/phase/composite/phase-reopen-impl';
import { sessionReopenImpl } from '../tiers/session/composite/session-reopen-impl';
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

export function adaptTierStartOutcomeToHarness(outcome: TierStartOutcome): TierOutcome {
  return {
    ...outcome,
    reasonCode: parseReasonCode(outcome.reasonCode),
  };
}

export function adaptTierEndOutcomeToHarness(outcome: TierEndOutcome): TierOutcome {
  return {
    status: mapEndStatusToTierStatus(outcome.status),
    reasonCode: parseReasonCode(outcome.reasonCode),
    nextAction: outcome.nextAction,
    ...(outcome.deliverables !== undefined && outcome.deliverables !== '' && { deliverables: outcome.deliverables }),
    ...(outcome.cascade !== undefined && { cascade: { ...outcome.cascade, tier: outcome.cascade.tier } }),
  };
}

/** Map tier reopen workflow result to kernel TierOutcome (shape differs from start/end). */
export function adaptTierReopenOutcomeToHarness(result: TierReopenResult): TierOutcome {
  if (result.success) {
    const hint =
      result.output?.trim() !== ''
        ? result.output.trim().slice(0, 500)
        : 'Reopen complete. Plan next step or quick fix.';
    return {
      status: 'completed',
      reasonCode: parseReasonCode('reopen_ok'),
      nextAction: hint,
    };
  }
  const next =
    result.output?.trim() !== ''
      ? result.output.trim().slice(0, 1500)
      : 'Reopen failed. Check guide status, branch, and identifiers.';
  return {
    status: 'failed',
    reasonCode: parseReasonCode('unhandled_error'),
    nextAction: next,
  };
}

export type TierActionParams =
  | { action: 'start'; params: TierStartParams }
  | { action: 'end'; params: TierEndParams }
  | { action: 'reopen'; params: TierReopenParams };

export interface StepAdapterOptions {
  config: TierConfig;
  actionParams: TierActionParams;
  options?: CommandExecutionOptions;
  context?: WorkflowCommandContext;
}

export function createStepAdapter(opts: StepAdapterOptions): ITierAdapter {
  const { config, actionParams, options, context } = opts;
  const recorder = getDefaultShadowRecorder();
  let ran = false;

  return {
    async runStep(ctx: HarnessContext, stepId: StepId): Promise<StepRunResult | null> {
      if (stepId !== FIRST_STEP) return null;
      if (ran) return null;
      ran = true;

      const shadowContext = { recorder, handle: ctx.traceHandle };
      const spec = ctx.spec;

      if (spec.action === 'reopen') {
        if (actionParams.action !== 'reopen') {
          const outcome = adaptTierReopenOutcomeToHarness({
            success: false,
            output: 'Internal error: step adapter actionParams mismatch for reopen.',
            previousStatus: '',
            newStatus: '',
            modeGate: '',
          });
          return { success: false, output: outcome.nextAction, outcome, exitEarly: true };
        }
        const reopenParams = actionParams.params;
        const resolvedCtx = context;
        if (!resolvedCtx) {
          const outcome = adaptTierReopenOutcomeToHarness({
            success: false,
            output: 'Reopen requires resolved WorkflowCommandContext (kernel path).',
            previousStatus: '',
            newStatus: '',
            modeGate: '',
          });
          return { success: false, output: outcome.nextAction, outcome, exitEarly: true };
        }
        const modeGate = '';
        let tierResult: TierReopenResult;
        switch (config.name) {
          case 'feature':
            tierResult = await featureReopenImpl(reopenParams, modeGate, resolvedCtx);
            break;
          case 'phase':
            tierResult = await phaseReopenImpl(reopenParams, modeGate, resolvedCtx);
            break;
          case 'session':
            tierResult = await sessionReopenImpl(reopenParams, modeGate, resolvedCtx);
            break;
          case 'task':
            tierResult = {
              success: false,
              output: 'Task reopen is not supported. Reopen the session to add or change tasks.',
              previousStatus: '',
              newStatus: '',
              modeGate: '',
            };
            break;
          default:
            tierResult = {
              success: false,
              output: `Unknown tier: ${config.name}`,
              previousStatus: '',
              newStatus: '',
              modeGate: '',
            };
        }
        const outcome = adaptTierReopenOutcomeToHarness(tierResult);
        return {
          success: tierResult.success,
          output: tierResult.output,
          outcome,
          exitEarly: true,
        };
      }

      if (spec.action === 'start') {
        if (actionParams.action !== 'start') {
          return {
            success: false,
            output: 'Internal error: step adapter actionParams mismatch for start.',
            outcome: {
              status: 'failed',
              reasonCode: parseReasonCode('unhandled_error'),
              nextAction: 'Adapter configuration error.',
            },
            exitEarly: true,
          };
        }
        const startParams = actionParams.params;
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
        if (actionParams.action !== 'end') {
          return {
            success: false,
            output: 'Internal error: step adapter actionParams mismatch for end.',
            outcome: {
              status: 'failed',
              reasonCode: parseReasonCode('unhandled_error'),
              nextAction: 'Adapter configuration error.',
            },
            exitEarly: true,
          };
        }
        const endParams = actionParams.params;
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
