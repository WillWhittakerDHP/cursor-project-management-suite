/**
 * /skip-push: skip git push, clear end-pending state, and return cascade info.
 * Reads .tier-end-pending.json; clears it without pushing; returns result with controlPlaneDecision.
 */

import { readEndPending, deleteEndPending } from './pending-state';
import type { ControlPlaneDecision } from './control-plane-types';
import { QUESTION_KEYS } from './control-plane-types';

const NO_PENDING_MESSAGE =
  'No pending push. Run a tier end first. When it returns pending push, run **/accepted-push** or **/skip-push**.';

export type SkipPushResult = {
  success: boolean;
  output: string;
  outcome: {
    reasonCode: 'push_skipped' | 'no_pending_push';
    nextAction: string;
    cascade?: import('../../utils/tier-outcome').CascadeInfo;
  };
  controlPlaneDecision: ControlPlaneDecision;
};

/**
 * Skip push and clear end-pending state. Returns cascade info if any.
 */
export async function skipPush(): Promise<SkipPushResult> {
  const state = await readEndPending();
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
        reasonCode: 'no_pending_push',
        nextAction: NO_PENDING_MESSAGE,
      },
      controlPlaneDecision: decision,
    };
  }

  await deleteEndPending();

  const cascadeHint =
    state.cascade?.command != null
      ? ` Then run **${state.cascade.command}** to continue.`
      : '';
  const message = `Push skipped.${cascadeHint}`.trim();
  const decision: ControlPlaneDecision = {
    stop: state.cascade != null,
    requiredMode: 'plan',
    message,
    ...(state.cascade != null && {
      questionKey: QUESTION_KEYS.CASCADE,
      cascadeCommand: state.cascade.command,
    }),
  };

  return {
    success: true,
    output: message,
    outcome: {
      reasonCode: 'push_skipped',
      nextAction: message,
      ...(state.cascade != null && { cascade: state.cascade }),
    },
    controlPlaneDecision: decision,
  };
}
