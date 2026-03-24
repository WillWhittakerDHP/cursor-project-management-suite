/**
 * /skip-push: clear end-pending without pushing; surfaces cascade from `.tier-end-pending.json` for playbook handling.
 */

import {
  readEndPending,
  deleteEndPending,
  type EndPendingState,
} from './pending-state';
import type { ControlPlaneDecision } from './control-plane-types';
import { routeByOutcome } from './control-plane-route';
import type { CommandResultForRouting } from './control-plane-types';

export interface SkipPushResult {
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
  'No pending push to skip. If you already pushed or cleared state, nothing to do.';

function wrap(
  result: CommandResultForRouting,
  pending: EndPendingState | null
): SkipPushResult {
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
 * Skip push and clear end-pending. User runs in Cursor.
 */
export async function skipPush(): Promise<SkipPushResult> {
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

  await deleteEndPending();

  const cascade = pending.cascade;
  const nextAction =
    cascade != null
      ? `Push skipped. **Cascade (optional):** ${cascade.command} (${cascade.tier} ${cascade.identifier}).`
      : 'Push skipped. End-pending cleared.';

  return wrap(
    {
      success: true,
      output: nextAction,
      outcome: {
        reasonCode: 'end_ok',
        nextAction,
        ...(cascade !== undefined && { cascade }),
      },
    },
    pending
  );
}
