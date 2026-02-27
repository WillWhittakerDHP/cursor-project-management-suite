/**
 * Control-plane routing: given a command result and context, return the decision
 * (required mode, message, question key, optional nextInvoke/cascadeCommand).
 * Delegates to shared handlers per reasonCode.
 */

import type {
  ControlPlaneContext,
  ControlPlaneDecision,
  CommandResultForRouting,
} from './control-plane-types';
import { REASON_CODE } from './control-plane-types';
import {
  handlePlanMode,
  handleContextGathering,
  handlePendingPushConfirmation,
  handleVerificationWorkSuggested,
  handleTaskComplete,
  handleFailure,
  handleMissingOutcome,
  handleSuccessWithOptionalCascade,
  handleReopenOk,
  handleUncommittedChanges,
} from './control-plane-handlers';

/**
 * Route by outcome. Use result.outcome.reasonCode and result.success only.
 * Does not perform mode switch or AskQuestion; it returns what the agent should do.
 */
export function routeByOutcome(
  result: CommandResultForRouting,
  ctx: ControlPlaneContext
): ControlPlaneDecision {
  const outcome = result.outcome;
  const success = result.success;

  if (outcome == null) {
    return handleMissingOutcome(result.output);
  }

  if (!success) {
    return handleFailure(outcome, result.output);
  }

  switch (outcome.reasonCode) {
    case REASON_CODE.PLAN_MODE:
      return handlePlanMode(outcome, ctx);
    case REASON_CODE.CONTEXT_GATHERING:
      return handleContextGathering(outcome, ctx);
    case REASON_CODE.PENDING_PUSH_CONFIRMATION:
      return handlePendingPushConfirmation(outcome);
    case REASON_CODE.VERIFICATION_WORK_SUGGESTED:
      return handleVerificationWorkSuggested(outcome);
    case REASON_CODE.TASK_COMPLETE:
      return handleTaskComplete(outcome);
    case REASON_CODE.REOPEN_OK:
      return handleReopenOk(outcome);
    case REASON_CODE.UNCOMMITTED_CHANGES_BLOCKING:
      return handleUncommittedChanges(outcome, ctx);
    default:
      return handleSuccessWithOptionalCascade(outcome);
  }
}
