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
import { getWorkProfileMessageSuffix } from './control-plane-work-profile-prompt';

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

/** planning_doc_incomplete: BLOCKED until agent fills the planning doc. Show message; no proceed until doc is filled. */
export function handlePlanningDocIncomplete(outcome: ControlPlaneOutcome, ctx?: ControlPlaneContext): ControlPlaneDecision {
  const defaultNext =
    ctx?.tier === 'task'
      ? 'Planning doc must be filled before proceeding. The agent must fill the planning doc (replace Goal/Files/Approach/Checkpoint with a concrete draft from context). Then **the user** runs **/accepted-code** again.'
      : 'Planning doc must be filled before proceeding. The agent must fill the planning doc (replace Goal/Files/Approach/Checkpoint with a concrete draft from context). Then **the user** runs /accepted-proceed again.';
  const base = outcome.nextAction ?? defaultNext;
  const suffix = ctx ? getWorkProfileMessageSuffix(ctx.workProfile) : '';
  return {
    stop: true,
    requiredMode: 'plan',
    message: base + suffix,
  };
}

/** context_gathering: show planning doc path and deliverables. Agent fills doc; user runs /accepted-proceed (feature/phase/session) or /accepted-code (task only — task output must not suggest /accepted-proceed). */
export function handleContextGathering(outcome: ControlPlaneOutcome, ctx: ControlPlaneContext): ControlPlaneDecision {
  const base = outcome.deliverables ?? outcome.nextAction;
  const suffix = getWorkProfileMessageSuffix(ctx.workProfile);
  return {
    stop: true,
    requiredMode: 'plan',
    message: base + suffix,
  };
}

/** pending_push_confirmation: end complete; user runs /accepted-push to push or /skip-push to skip. */
export function handlePendingPushConfirmation(outcome: ControlPlaneOutcome): ControlPlaneDecision {
  const cascadeHint =
    outcome.cascade?.command != null
      ? ` Then run **${outcome.cascade.command}** to continue.`
      : '';
  return {
    stop: true,
    requiredMode: 'plan',
    message: `${outcome.nextAction ?? 'End complete.'} Run **/accepted-push** to push to remote, or **/skip-push** to skip.${cascadeHint}`,
  };
}

/** verification_work_suggested: show verification checklist (deliverables), present choices in chat (add follow-up / do manually / skip). */
export function handleVerificationWorkSuggested(outcome: ControlPlaneOutcome): ControlPlaneDecision {
  return {
    stop: true,
    requiredMode: 'plan',
    message: outcome.deliverables ?? outcome.nextAction,
    questionKey: QUESTION_KEYS.VERIFICATION_OPTIONS,
  };
}

/** task_complete: if cascade present, present choices in chat; else continue. */
export function handleTaskComplete(outcome: ControlPlaneOutcome): ControlPlaneDecision {
  return baseCascadeDecision(outcome, 'agent');
}

/** audit_failed: show full audit report (deliverables) and STOP — fix per governance, then re-run. */
export function handleAuditFailed(outcome: ControlPlaneOutcome, outputFallback: string, ctx?: ControlPlaneContext): ControlPlaneDecision {
  const base = outcome.deliverables ?? (outcome.nextAction?.trim() ? outcome.nextAction : outputFallback);
  const suffix = ctx ? getWorkProfileMessageSuffix(ctx.workProfile) : '';
  return {
    stop: true,
    requiredMode: 'plan',
    message: base + suffix,
    questionKey: QUESTION_KEYS.AUDIT_FAILED_OPTIONS,
  };
}

/** Generic failure: Plan mode hard-stop, present choices in chat (retry/audit-fix/skip). No cascade. */
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

/** Success with optional cascade: if cascade, present choices in chat; else continue. */
export function handleSuccessWithOptionalCascade(outcome: ControlPlaneOutcome): ControlPlaneDecision {
  return baseCascadeDecision(outcome, 'agent');
}

/** reopen_ok: Plan mode, present choices in chat (plan file / plan from scratch / quick fix). */
export function handleReopenOk(outcome: ControlPlaneOutcome): ControlPlaneDecision {
  return {
    stop: true,
    requiredMode: 'plan',
    message: outcome.nextAction,
    questionKey: QUESTION_KEYS.REOPEN_OPTIONS,
  };
}

/**
 * uncommitted_changes_blocking: present choices in chat (commit / stash).
 * Agent should:
 *   "Commit" → git add -A && git commit -m "chore: commit changes before branch switch" → re-invoke command
 *   "Skip"   → git stash --include-untracked → re-invoke command (agent should git stash pop after command completes)
 * For start: re-invoke params include options so workflow continues from the gate (resumeAfterStep), not from the top.
 */
export function handleUncommittedChanges(
  outcome: ControlPlaneOutcome,
  ctx: ControlPlaneContext
): ControlPlaneDecision {
  const params =
    ctx.action === 'start'
      ? buildStartReinvokeParams(ctx.originalParams as Record<string, unknown>, {
          mode: 'execute',
          resumeAfterStep: 'ensure_branch',
        })
      : ctx.originalParams;
  return {
    stop: true,
    requiredMode: 'plan',
    message: outcome.deliverables ?? outcome.nextAction,
    questionKey: QUESTION_KEYS.UNCOMMITTED_CHANGES,
    nextInvoke: {
      tier: ctx.tier,
      action: ctx.action,
      params,
    },
  };
}

/** wrong_branch_before_commit: tier-end aborted because current git branch does not match the tier. User must checkout correct branch and re-run. */
export function handleWrongBranchBeforeCommit(outcome: ControlPlaneOutcome): ControlPlaneDecision {
  return {
    stop: true,
    requiredMode: 'plan',
    message: outcome.deliverables ?? outcome.nextAction ?? 'Wrong branch. Checkout the correct tier branch and re-run tier-end.',
  };
}

/** expected_branch_missing_run_tier_start: resolved expected branch (from tier chain) does not exist locally; tier-start creates branches — same UX as wrong_branch (plan stop, message only). */
export function handleExpectedBranchMissingRunTierStart(outcome: ControlPlaneOutcome): ControlPlaneDecision {
  return {
    stop: true,
    requiredMode: 'plan',
    message:
      outcome.deliverables ??
      outcome.nextAction ??
      'Expected tier branch missing locally. Run the matching tier-start (see harness message), then re-run tier-end.',
  };
}
