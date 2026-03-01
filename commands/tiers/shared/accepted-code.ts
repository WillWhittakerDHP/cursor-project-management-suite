/**
 * /accepted-code: run task start with execute (Begin Coding) for the pending task (chat-first flow).
 * Reads .task-start-pending.json written by task-start on plan_mode; reinvokes with mode: 'execute'.
 */

import { runTierStart, type TierStartResultWithControlPlane } from './tier-start';
import { TASK_CONFIG } from '../configs';
import { readTaskStartPending, deleteTaskStartPending } from './pending-state';
import type { ControlPlaneDecision } from './control-plane-types';

const NO_PENDING_MESSAGE =
  'No pending task start. Run a task-start first (e.g. after session-start cascade), discuss the task design in chat, then run **/accepted-code** when ready to begin coding.';

/**
 * Run task start with execute for the pending task. Returns result with controlPlaneDecision for the agent to present.
 */
export async function acceptedCode(): Promise<TierStartResultWithControlPlane> {
  const state = await readTaskStartPending();
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
        reasonCode: 'no_pending_code',
        nextAction: NO_PENDING_MESSAGE,
      },
      controlPlaneDecision: decision,
    };
  }

  const result = await runTierStart(
    TASK_CONFIG,
    { taskId: state.taskId, featureId: state.featureId },
    { mode: 'execute' }
  );

  await deleteTaskStartPending();

  return result;
}
