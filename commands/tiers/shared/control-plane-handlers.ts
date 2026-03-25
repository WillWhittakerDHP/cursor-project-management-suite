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
import { buildStartReinvokeParams, buildEndReinvokeParams } from './control-plane-reinvoke';
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
      ? 'Planning doc must be filled before proceeding. The agent must fill the planning doc (replace placeholders with a concrete draft from context). Then **the user** runs **/accepted-code** again.'
      : 'Planning doc must be filled before proceeding. The agent must fill the planning doc (Analysis, Decomposition, Goal, etc.). Then **the user** runs **/accepted-plan** again.';
  const base = outcome.nextAction ?? defaultNext;
  const suffix = ctx ? getWorkProfileMessageSuffix(ctx.workProfile) : '';
  return {
    stop: true,
    requiredMode: 'plan',
    message: base + suffix,
  };
}

/** context_gathering: show planning doc path and deliverables. Agent fills doc; user runs /accepted-plan (feature/phase/session) or /accepted-code (task). */
export function handleContextGathering(outcome: ControlPlaneOutcome, ctx: ControlPlaneContext): ControlPlaneDecision {
  const base = outcome.deliverables ?? outcome.nextAction;
  const suffix = getWorkProfileMessageSuffix(ctx.workProfile);
  return {
    stop: true,
    requiredMode: 'plan',
    message: base + suffix,
  };
}

/** guide_fill_pending: agent fills guide; user runs /accepted-build (Gate 2). */
export function handleGuideFillPending(outcome: ControlPlaneOutcome, ctx: ControlPlaneContext): ControlPlaneDecision {
  const base = outcome.deliverables ?? outcome.nextAction;
  const suffix = getWorkProfileMessageSuffix(ctx.workProfile);
  return {
    stop: true,
    requiredMode: 'plan',
    message: base + suffix,
  };
}

/** guide_incomplete: Gate 2 blocked — guide still has placeholders. */
export function handleGuideIncomplete(outcome: ControlPlaneOutcome, ctx: ControlPlaneContext): ControlPlaneDecision {
  const base =
    outcome.nextAction ??
    'Guide still has placeholders in tierDown blocks. Fill them, save, then **the user** runs **/accepted-build** again.';
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

/** gap_analysis_pending: show gap report; optional nextInvoke resumes tier-end at gap_analysis with bypass flag. */
export function handleGapAnalysisPending(
  outcome: ControlPlaneOutcome,
  ctx: ControlPlaneContext
): ControlPlaneDecision {
  const message = outcome.deliverables ?? outcome.nextAction;
  if (ctx.action !== 'end' || ctx.originalParams == null) {
    return {
      stop: true,
      requiredMode: 'plan',
      message,
      questionKey: QUESTION_KEYS.GAP_ANALYSIS_OPTIONS,
    };
  }
  const base = ctx.originalParams as Record<string, unknown>;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) {
    return {
      stop: true,
      requiredMode: 'plan',
      message,
      questionKey: QUESTION_KEYS.GAP_ANALYSIS_OPTIONS,
    };
  }
  const params = buildEndReinvokeParams(base, {
    resumeEndAfterStep: 'gap_analysis',
    continuePastGapAnalysis: true,
  });
  return {
    stop: true,
    requiredMode: 'plan',
    message,
    questionKey: QUESTION_KEYS.GAP_ANALYSIS_OPTIONS,
    nextInvoke: { tier: ctx.tier, action: 'end', params },
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

const VALIDATION_FAILED_FRICTION_HINT =
  '\n\n---\n**Workflow friction:** For harness **failure** outcomes, the run usually appends a row to `.project-manager/WORKFLOW_FRICTION_LOG.md` (unless `HARNESS_WORKFLOW_FRICTION` is off). Scan: `npx tsx .cursor/commands/utils/read-workflow-friction.ts --last 20`. For richer narrative, use `initiateWorkflowFrictionWrite` from `.cursor/commands/harness/workflow-friction-manager.ts` or **`/harness-repair`** plan mode.';

/** validation_failed: same as failure UX plus one-line visibility for auto-appended friction log. */
export function handleValidationFailed(outcome: ControlPlaneOutcome, outputFallback: string): ControlPlaneDecision {
  const base = outcome.nextAction || outputFallback;
  return {
    stop: true,
    requiredMode: 'plan',
    message: base + VALIDATION_FAILED_FRICTION_HINT,
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
export function handleWrongBranchBeforeCommit(
  outcome: ControlPlaneOutcome,
  ctx: ControlPlaneContext
): ControlPlaneDecision {
  const message =
    outcome.deliverables ??
    outcome.nextAction ??
    'Wrong branch. Checkout the correct tier branch and re-run tier-end.';
  if (ctx.action === 'end') {
    const params = buildEndReinvokeParams(ctx.originalParams as Record<string, unknown>, {
      resumeEndAfterStep: 'commit_remaining',
    });
    return {
      stop: true,
      requiredMode: 'plan',
      message,
      questionKey: QUESTION_KEYS.FAILURE_OPTIONS,
      nextInvoke: { tier: ctx.tier, action: 'end', params },
    };
  }
  return {
    stop: true,
    requiredMode: 'plan',
    message,
  };
}

/** audit_fix_commit_failed: autofix commit failed; after fixing git, re-run tier-end — harness resumes at end_audit. */
export function handleAuditFixCommitFailedEnd(
  outcome: ControlPlaneOutcome,
  ctx: ControlPlaneContext
): ControlPlaneDecision {
  const params = buildEndReinvokeParams(ctx.originalParams as Record<string, unknown>, {
    resumeEndAfterStep: 'end_audit',
  });
  return {
    stop: true,
    requiredMode: 'plan',
    message:
      outcome.deliverables ??
      outcome.nextAction ??
      'Autofix produced changes but committing them failed. Fix git state and re-run this tier-end (harness resumes at end_audit).',
    questionKey: QUESTION_KEYS.FAILURE_OPTIONS,
    nextInvoke: { tier: ctx.tier, action: 'end', params },
  };
}

/** git_failed with tierEndGitResumable: offer resume at shared `git` step after user fixes merge/push. */
export function handleGitFailedTierEnd(
  outcome: ControlPlaneOutcome,
  ctx: ControlPlaneContext,
  outputFallback: string
): ControlPlaneDecision {
  if (ctx.action !== 'end' || outcome.tierEndGitResumable !== true) {
    return handleFailure(outcome, outputFallback);
  }
  const params = buildEndReinvokeParams(ctx.originalParams as Record<string, unknown>, {
    resumeEndAfterStep: 'git',
  });
  return {
    stop: true,
    requiredMode: 'plan',
    message: outcome.nextAction || outputFallback,
    questionKey: QUESTION_KEYS.FAILURE_OPTIONS,
    nextInvoke: { tier: ctx.tier, action: 'end', params },
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
