/**
 * /accepted-proceed: run the next pass for the pending session/phase/feature start (chat-first flow).
 * Reads .tier-start-pending.json written by tier-start on context_gathering/plan_mode; reinvokes with pass 2 or execute.
 */

import { runTierStart, type TierStartResultWithControlPlane } from './tier-start';
import { getConfigForTier } from '../configs';
import type { TierConfig } from './types';
import {
  readTierStartPending,
  writeTierStartPending,
  deleteTierStartPending,
} from './pending-state';
import type { ControlPlaneDecision } from './control-plane-types';

const NO_PENDING_MESSAGE =
  'No pending tier start. Run a session/phase/feature start first, then discuss the plan in chat. When ready, run **/accepted-proceed** again.';

/**
 * Run the next pass for the pending tier start. Returns result with controlPlaneDecision for the agent to present.
 */
export async function acceptedProceed(): Promise<TierStartResultWithControlPlane> {
  const state = await readTierStartPending();
  if (!state) {
    const decision: ControlPlaneDecision = {
      stop: true,
      requiredMode: 'plan',
      message: NO_PENDING_MESSAGE,
    };
    return {
      success: false,
      output: NO_PENDING_MESSAGE,
      outcome: {
        status: 'blocked',
        reasonCode: 'no_pending_proceed',
        nextAction: NO_PENDING_MESSAGE,
      },
      controlPlaneDecision: decision,
    };
  }

  const config = getConfigForTier(state.tier) as TierConfig;
  const options =
    state.pass === 1
      ? { contextGatheringComplete: true as const, mode: 'plan' as const }
      : { mode: 'execute' as const };

  const result = await runTierStart(config, state.params, options);

  const reasonCode = result.outcome?.reasonCode;
  if (reasonCode === 'plan_mode') {
    await writeTierStartPending({ ...state, pass: 2 });
  } else if (reasonCode === 'start_ok') {
    await deleteTierStartPending();
  }

  return result;
}
