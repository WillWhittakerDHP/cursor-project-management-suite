/**
 * Shared tier reopen: flips a completed tier back to Reopened so additional child work can be added.
 * Dispatches to tier-specific impls (feature, phase, session). Task reopen not supported.
 * Control-plane routing runs after the command; result includes controlPlaneDecision.
 */

import type { TierConfig } from './types';
import type { TierReopenParams, TierReopenResult } from './tier-reopen-workflow';
import { featureReopenImpl } from '../feature/composite/feature-reopen-impl';
import { phaseReopenImpl } from '../phase/composite/phase-reopen-impl';
import { sessionReopenImpl } from '../session/composite/session-reopen-impl';
import { routeByOutcome } from './control-plane-route';
import { REASON_CODE } from './control-plane-types';
import type { ControlPlaneDecision, CommandResultForRouting } from './control-plane-types';
import { formatChoiceForChat } from './control-plane-choice-display';

export type { TierReopenParams, TierReopenResult };

/** Result of runTierReopen including control-plane decision. */
export type TierReopenResultWithControlPlane = TierReopenResult & {
  controlPlaneDecision: ControlPlaneDecision;
};

const GATE_PLACEHOLDER = '';

export async function runTierReopen(
  config: TierConfig,
  params: TierReopenParams
): Promise<TierReopenResultWithControlPlane> {
  let result: TierReopenResult;
  try {
    switch (config.name) {
      case 'feature':
        result = await featureReopenImpl(params, GATE_PLACEHOLDER);
        break;
      case 'phase':
        result = await phaseReopenImpl(params, GATE_PLACEHOLDER);
        break;
      case 'session':
        result = await sessionReopenImpl(params, GATE_PLACEHOLDER);
        break;
      case 'task':
        result = {
          success: false,
          output: 'Task reopen is not supported. Reopen the session to add or change tasks.',
          previousStatus: '',
          newStatus: '',
          modeGate: GATE_PLACEHOLDER,
        };
        break;
      default:
        result = {
          success: false,
          output: `Unknown tier: ${config.name}`,
          previousStatus: '',
          newStatus: '',
          modeGate: GATE_PLACEHOLDER,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result = {
      success: false,
      output: `Reopen failed: ${message}`,
      previousStatus: '',
      newStatus: '',
      modeGate: GATE_PLACEHOLDER,
    };
  }

  const forRouting: CommandResultForRouting = result.success
    ? {
        success: true,
        output: result.output,
        outcome: {
          reasonCode: REASON_CODE.REOPEN_OK,
          nextAction: result.output || 'Reopen complete. Plan next step or quick fix.',
        },
      }
    : {
        success: false,
        output: result.output,
        outcome: {
          reasonCode: 'unhandled_error',
          nextAction: result.output || 'Reopen failed.',
        },
      };
  const ctx = {
    tier: config.name,
    action: 'reopen' as const,
    originalParams: params,
  };
  const controlPlaneDecision = routeByOutcome(forRouting, ctx);

  let finalOutput = result.output;
  if (controlPlaneDecision.stop && controlPlaneDecision.questionKey) {
    const choiceBlock = formatChoiceForChat(controlPlaneDecision);
    if (choiceBlock) finalOutput = finalOutput + '\n\n---\n\n' + choiceBlock;
  }

  return {
    ...result,
    output: finalOutput,
    controlPlaneDecision,
  };
}
