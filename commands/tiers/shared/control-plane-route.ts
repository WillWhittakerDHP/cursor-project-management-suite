/**
 * Control-plane routing: given a command result and context, return the decision
 * (required mode, message, question key, optional nextInvoke/cascadeCommand).
 * Delegates to shared handlers per reasonCode.
 * Exhaustive over charter ReasonCode union — no permissive string fallback.
 */

import type {
  ControlPlaneContext,
  ControlPlaneDecision,
  CommandResultForRouting,
} from './control-plane-types';
import { parseReasonCode } from '../../harness/reason-code';
import type { ReasonCode } from '../../harness/contracts';
import {
  handleContextGathering,
  handlePlanningDocIncomplete,
  handlePendingPushConfirmation,
  handleVerificationWorkSuggested,
  handleTaskComplete,
  handleFailure,
  handleAuditFailed,
  handleMissingOutcome,
  handleSuccessWithOptionalCascade,
  handleReopenOk,
  handleUncommittedChanges,
  handleWrongBranchBeforeCommit,
} from './control-plane-handlers';

/**
 * Route by outcome. Use result.outcome.reasonCode and result.success only.
 * reasonCode is parsed to charter ReasonCode; switch is exhaustive (no default).
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

  const reasonCode: ReasonCode = parseReasonCode(outcome.reasonCode);

  if (!success) {
    switch (reasonCode) {
      case 'planning_doc_incomplete':
        return handlePlanningDocIncomplete(outcome);
      case 'validation_failed':
        return handleFailure(outcome, result.output);
      case 'audit_failed':
        return handleAuditFailed(outcome, result.output);
      case 'test_failed':
      case 'preflight_failed':
      case 'git_failed':
        return handleFailure(outcome, result.output);
      case 'wrong_branch_before_commit':
        return handleWrongBranchBeforeCommit(outcome);
      case 'unhandled_error':
        return handleFailure(outcome, result.output);
      default:
        return handleFailure(outcome, result.output);
    }
  }

  switch (reasonCode) {
    case 'context_gathering':
      return handleContextGathering(outcome, ctx);
    case 'pending_push':
      return handlePendingPushConfirmation(outcome);
    case 'verification_suggested':
      return handleVerificationWorkSuggested(outcome);
    case 'task_complete':
      return handleTaskComplete(outcome);
    case 'reopen_ok':
      return handleReopenOk(outcome);
    case 'uncommitted_blocking':
      return handleUncommittedChanges(outcome, ctx);
    case 'guide_fill_pending':
      return handlePlanningDocIncomplete(outcome);
    case 'start_ok':
    case 'end_ok':
      return handleSuccessWithOptionalCascade(outcome);
    default:
      return handleFailure(outcome, result.output);
  }
}
