/**
 * /accepted-push: run git push for the pending tier end and return cascade info.
 * Reads .tier-end-pending.json written by tier-end on pending_push_confirmation;
 * runs git push, clears end-pending state, returns result with controlPlaneDecision.
 */

import { readEndPending, deleteEndPending } from './pending-state';
import type { ControlPlaneDecision } from './control-plane-types';
import { QUESTION_KEYS } from './control-plane-types';
import { gitPush } from '../../git/shared/git-manager';

const NO_PENDING_MESSAGE =
  'No pending push. Run a tier end (feature-end, phase-end, session-end, or task-end) first. When it returns pending push, run **/accepted-push** to push or **/skip-push** to skip.';

export type AcceptedPushResult = {
  success: boolean;
  output: string;
  outcome: {
    reasonCode: 'push_done' | 'no_pending_push' | 'push_failed';
    nextAction: string;
    cascade?: import('../../utils/tier-outcome').CascadeInfo;
  };
  controlPlaneDecision: ControlPlaneDecision;
};

/**
 * Run git push for the pending tier end. Clears end-pending state and returns cascade info if any.
 */
export async function acceptedPush(): Promise<AcceptedPushResult> {
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

  const pushResult = await gitPush();

  if (!pushResult.success) {
    const message = `Push failed. ${pushResult.output}

Pending push state was kept. After fixing (credentials, network, or branch protection), run **/accepted-push** again. Check \`.project-manager/.git-ops-log\` for the exact git command. Or run **/skip-push** to clear without pushing.`;
    const decision: ControlPlaneDecision = {
      stop: true,
      requiredMode: 'plan',
      message,
    };
    return {
      success: false,
      output: message,
      outcome: {
        reasonCode: 'push_failed',
        nextAction:
          'Fix push (see .project-manager/.git-ops-log), then /accepted-push again, or /skip-push to abandon push.',
      },
      controlPlaneDecision: decision,
    };
  }

  await deleteEndPending();

  const cascadeHint =
    state.cascade?.command != null
      ? ` Then run **${state.cascade.command}** to continue.`
      : '';
  const bugbotHint =
    state.tier !== 'task'
      ? '\n\nTo run a Bugbot review, create a PR from this branch or comment `cursor review` on an existing PR.'
      : '';
  const message = `Push complete.${cascadeHint}${bugbotHint}`.trim();
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
    output: pushResult.output || message,
    outcome: {
      reasonCode: 'push_done',
      nextAction: message,
      ...(state.cascade != null && { cascade: state.cascade }),
    },
    controlPlaneDecision: decision,
  };
}
