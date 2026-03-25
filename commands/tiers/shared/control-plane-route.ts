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
  handleGuideFillPending,
  handleGuideIncomplete,
  handlePlanningDocIncomplete,
  handlePendingPushConfirmation,
  handleVerificationWorkSuggested,
  handleGapAnalysisPending,
  handleTaskComplete,
  handleFailure,
  handleAuditFailed,
  handleMissingOutcome,
  handleSuccessWithOptionalCascade,
  handleReopenOk,
  handleUncommittedChanges,
  handleWrongBranchBeforeCommit,
  handleExpectedBranchMissingRunTierStart,
  handleAuditFixCommitFailedEnd,
  handleGitFailedTierEnd,
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
        return handlePlanningDocIncomplete(outcome, ctx);
      case 'guide_incomplete':
        return handleGuideIncomplete(outcome, ctx);
      case 'validation_failed':
        return handleFailure(outcome, result.output);
      case 'audit_failed': {
        // Phase 9: use audit_fix profile for message refinement when handling audit_failed
        const auditCtx: ControlPlaneContext = {
          ...ctx,
          workProfile: ctx.workProfile ?? {
            executionIntent: 'audit_fix',
            actionType: 'governance_remediation',
            scopeShape: 'contract_level',
            governanceDomains: ['component', 'composable', 'function', 'type'],
          },
        };
        return handleAuditFailed(outcome, result.output, auditCtx);
      }
      case 'test_failed':
      case 'preflight_failed':
        return handleFailure(outcome, result.output);
      case 'git_failed':
        return handleGitFailedTierEnd(outcome, ctx, result.output);
      case 'conflict_markers_in_tree':
        return handleFailure(outcome, result.output);
      case 'audit_fix_commit_failed':
        return handleAuditFixCommitFailedEnd(outcome, ctx);
      case 'wrong_branch_before_commit':
        return handleWrongBranchBeforeCommit(outcome, ctx);
      case 'expected_branch_missing_run_tier_start':
        return handleExpectedBranchMissingRunTierStart(outcome);
      case 'app_not_running':
      case 'branch_failed':
      case 'guide_materialization_failed':
      case 'guide_materialization_requires_execute':
      case 'no_pending_plan':
      case 'no_pending_build':
      case 'no_pending_code':
      case 'no_pending_push':
      case 'wrong_accepted_command':
      case 'invalid_context':
      case 'invalid_task_id':
      case 'planning_rollup_failed':
      case 'doc_rollup_failed':
      case 'gap_analysis_failed':
      case 'fill_tier_down_failed':
      case 'planning_checks_failed':
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
    case 'gap_analysis_pending':
      return handleGapAnalysisPending(outcome, ctx);
    case 'task_complete':
      return handleTaskComplete(outcome);
    case 'reopen_ok':
      return handleReopenOk(outcome);
    case 'uncommitted_blocking':
      return handleUncommittedChanges(outcome, ctx);
    case 'guide_fill_pending':
      return handleGuideFillPending(outcome, ctx);
    case 'start_ok':
    case 'end_ok':
      return handleSuccessWithOptionalCascade(outcome);
    default:
      return handleFailure(outcome, result.output);
  }
}
