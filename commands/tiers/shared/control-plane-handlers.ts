/**
 * Shared handlers for each reasonCode. Return ControlPlaneDecision only; no side effects.
 * Used by control-plane-route.ts so behavior is centralized and testable.
 */

import type {
  ControlPlaneContext,
  ControlPlaneDecision,
  ControlPlaneOutcome,
} from './control-plane-types';
import { QUESTION_KEYS } from './control-plane-types';
import { buildStartReinvokeParams } from './control-plane-reinvoke';

function baseCascadeDecision(outcome: ControlPlaneOutcome, _requiredMode: 'plan' | 'agent'): ControlPlaneDecision {
  if (outcome.cascade != null) {
    return {
      stop: true,
      requiredMode: 'plan',
      message: outcome.nextAction,
      questionKey: QUESTION_KEYS.CASCADE,
      cascadeCommand: outcome.cascade.command,
    };
  }
  return {
    stop: false,
    requiredMode: 'agent',
    message: outcome.nextAction,
  };
}

/** plan_mode: show deliverables (or fallback to nextAction), AskQuestion approve/revise; nextInvoke = same command with execute. Task uses explicit "Begin Coding" wording. */
export function handlePlanMode(outcome: ControlPlaneOutcome, ctx: ControlPlaneContext): ControlPlaneDecision {
  const baseParams =
    typeof ctx.originalParams === 'object' && ctx.originalParams !== null
      ? (ctx.originalParams as Record<string, unknown>)
      : {};
  const questionKey =
    ctx.tier === 'task' ? QUESTION_KEYS.APPROVE_EXECUTE_TASK : QUESTION_KEYS.APPROVE_EXECUTE;
  return {
    stop: true,
    requiredMode: 'plan',
    message: outcome.deliverables ?? outcome.nextAction,
    questionKey,
    nextInvoke: {
      tier: ctx.tier,
      action: ctx.action,
      params: buildStartReinvokeParams(baseParams, { mode: 'execute' }),
    },
  };
}

/** planning_doc_incomplete: BLOCKED until agent fills the planning doc. Show message; no proceed until doc is filled. */
export function handlePlanningDocIncomplete(outcome: ControlPlaneOutcome): ControlPlaneDecision {
  return {
    stop: true,
    requiredMode: 'plan',
    message: outcome.nextAction ?? 'Planning doc must be filled before proceeding. Open the doc, replace Goal/Files/Approach/Checkpoint with a concrete draft, save, then run /accepted-proceed again.',
  };
}

/** context_gathering: show questions + planning doc path; nextInvoke = same command with mode execute (skip plan_mode intermediate). */
export function handleContextGathering(outcome: ControlPlaneOutcome, ctx: ControlPlaneContext): ControlPlaneDecision {
  const baseParams =
    typeof ctx.originalParams === 'object' && ctx.originalParams !== null
      ? (ctx.originalParams as Record<string, unknown>)
      : {};
  return {
    stop: true,
    requiredMode: 'plan',
    message: outcome.deliverables ?? outcome.nextAction,
    questionKey: QUESTION_KEYS.CONTEXT_GATHERING,
    nextInvoke: {
      tier: ctx.tier,
      action: ctx.action,
      params: buildStartReinvokeParams(baseParams, { mode: 'execute' }),
    },
  };
}

/** pending_push_confirmation: AskQuestion push/skip; then cascade if present. */
export function handlePendingPushConfirmation(outcome: ControlPlaneOutcome): ControlPlaneDecision {
  return {
    stop: true,
    requiredMode: 'plan',
    message: outcome.nextAction,
    questionKey: QUESTION_KEYS.PUSH_CONFIRMATION,
    cascadeCommand: outcome.cascade?.command,
  };
}

/** verification_work_suggested: show verification checklist (deliverables), AskQuestion (add follow-up / do manually / skip). */
export function handleVerificationWorkSuggested(outcome: ControlPlaneOutcome): ControlPlaneDecision {
  return {
    stop: true,
    requiredMode: 'plan',
    message: outcome.deliverables ?? outcome.nextAction,
    questionKey: QUESTION_KEYS.VERIFICATION_OPTIONS,
  };
}

/** task_complete: if cascade present, AskQuestion cascade; else continue. */
export function handleTaskComplete(outcome: ControlPlaneOutcome): ControlPlaneDecision {
  return baseCascadeDecision(outcome, 'agent');
}

/** audit_failed: show full audit report (deliverables) and STOP — fix per governance, then re-run. */
export function handleAuditFailed(outcome: ControlPlaneOutcome, outputFallback: string): ControlPlaneDecision {
  const message =
    outcome.deliverables ?? (outcome.nextAction?.trim() ? outcome.nextAction : outputFallback);
  return {
    stop: true,
    requiredMode: 'plan',
    message,
    questionKey: QUESTION_KEYS.FAILURE_OPTIONS,
  };
}

/** Generic failure: Plan mode hard-stop, AskQuestion retry/investigate/skip. No cascade. */
export function handleFailure(outcome: ControlPlaneOutcome, outputFallback: string): ControlPlaneDecision {
  return {
    stop: true,
    requiredMode: 'plan',
    message: outcome.nextAction || outputFallback,
    questionKey: QUESTION_KEYS.FAILURE_OPTIONS,
  };
}

/** Missing outcome (crash / malformed result): same as failure. */
export function handleMissingOutcome(output: string): ControlPlaneDecision {
  return {
    stop: true,
    requiredMode: 'plan',
    message: output || 'Command completed without outcome. See playbook: "On command crash".',
    questionKey: QUESTION_KEYS.FAILURE_OPTIONS,
  };
}

/** Success with optional cascade: if cascade, AskQuestion; else continue. */
export function handleSuccessWithOptionalCascade(outcome: ControlPlaneOutcome): ControlPlaneDecision {
  return baseCascadeDecision(outcome, 'agent');
}

/** reopen_ok: Plan mode, AskQuestion (plan file / plan from scratch / quick fix). */
export function handleReopenOk(outcome: ControlPlaneOutcome): ControlPlaneDecision {
  return {
    stop: true,
    requiredMode: 'plan',
    message: outcome.nextAction,
    questionKey: QUESTION_KEYS.REOPEN_OPTIONS,
  };
}

/**
 * uncommitted_changes_blocking: AskQuestion commit / stash.
 * Agent should:
 *   "Commit" → git add -A && git commit -m "chore: commit changes before branch switch" → re-invoke command
 *   "Skip"   → git stash --include-untracked → re-invoke command (agent should git stash pop after command completes)
 */
export function handleUncommittedChanges(
  outcome: ControlPlaneOutcome,
  ctx: ControlPlaneContext
): ControlPlaneDecision {
  return {
    stop: true,
    requiredMode: 'plan',
    message: outcome.deliverables ?? outcome.nextAction,
    questionKey: QUESTION_KEYS.UNCOMMITTED_CHANGES,
    nextInvoke: {
      tier: ctx.tier,
      action: ctx.action,
      params: ctx.originalParams,
    },
  };
}
