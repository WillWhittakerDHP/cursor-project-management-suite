/**
 * /accepted-push: user confirms push after tier-end returned `pending_push` / pending_push_confirmation.
 * Reads `.tier-end-pending.json`, runs push via git-manager, clears pending on success.
 */

import { gitPush } from '../../git/shared/git-manager';
import {
  readEndPending,
  deleteEndPending,
  type EndPendingState,
} from './pending-state';
import type { ControlPlaneDecision } from './control-plane-types';
import { routeByOutcome } from './control-plane-route';
import type { CommandResultForRouting } from './control-plane-types';

export interface AcceptedPushResult {
  success: boolean;
  output: string;
  outcome: {
    status: 'completed' | 'failed';
    reasonCode: string;
    nextAction: string;
    cascade?: EndPendingState['cascade'];
  };
  controlPlaneDecision: ControlPlaneDecision;
}

const NO_PENDING_MESSAGE =
  'No pending push. Run a tier-end that completes with push pending first, then run **/accepted-push** when you are ready to push.';

function wrap(
  result: CommandResultForRouting,
  pending: EndPendingState | null
): AcceptedPushResult {
  const o = result.outcome ?? {
    reasonCode: 'unhandled_error',
    nextAction: result.output,
  };
  const decision = routeByOutcome(result, {
    tier: pending?.tier ?? 'task',
    action: 'end',
    originalParams: pending != null ? { identifier: pending.identifier } : {},
  });
  return {
    success: result.success,
    output: result.output,
    outcome: {
      status: result.success ? 'completed' : 'failed',
      reasonCode: String(o.reasonCode),
      nextAction: o.nextAction,
      ...(o.cascade !== undefined && { cascade: o.cascade }),
    },
    controlPlaneDecision: decision,
  };
}

/**
 * Push current branch to origin for pending tier-end. User runs in Cursor.
 */
export async function acceptedPush(): Promise<AcceptedPushResult> {
  const pending = await readEndPending();
  if (!pending) {
    return wrap(
      {
        success: false,
        output: NO_PENDING_MESSAGE,
        outcome: {
          reasonCode: 'no_pending_push',
          nextAction: NO_PENDING_MESSAGE,
        },
      },
      null
    );
  }

  const pushResult = await gitPush();
  if (!pushResult.success) {
    return wrap(
      {
        success: false,
        output: `**Push failed:**\n\n\`\`\`\n${pushResult.output}\n\`\`\``,
        outcome: {
          reasonCode: 'git_failed',
          nextAction: 'Fix the git error (auth, remote, branch), then run **/accepted-push** again.',
        },
      },
      pending
    );
  }

  await deleteEndPending();

  const cascade = pending.cascade;
  const nextAction =
    cascade != null
      ? `Push succeeded. **Cascade:** ${cascade.command} (${cascade.tier} ${cascade.identifier}). See playbook for confirmation.`
      : 'Push succeeded. No cascade in pending state.';

  return wrap(
    {
      success: true,
      output: `${pushResult.output}\n\n${nextAction}`,
      outcome: {
        reasonCode: 'end_ok',
        nextAction,
        ...(cascade !== undefined && { cascade }),
      },
    },
    pending
  );
}
