/**
 * Shared control-plane routing context and command result shapes.
 * ControlPlaneDecision and QuestionKey are defined in harness/contracts.ts (single source of truth).
 */

import type { TierName } from './types';
import type { CascadeInfo } from '../../utils/tier-outcome';
import type { CommandExecutionOptions } from '../../utils/command-execution-mode';
import type { ControlPlaneDecision, QuestionKey } from '../../harness/contracts';

export type { ControlPlaneDecision, QuestionKey };

/** Action verb for tier commands in routing context. */
export type TierAction = 'start' | 'end' | 'reopen';

/**
 * Canonical shape for tier-start re-invoke params.
 * Tier identifiers at top level; execution toggles ONLY in options.
 * Use buildStartReinvokeParams() so flat option keys are never added.
 */
export type StartReinvokeParams = Record<string, unknown> & {
  options?: CommandExecutionOptions;
};

/** Normalized outcome shape for routing; start and end results both expose this. */
export interface ControlPlaneOutcome {
  reasonCode: string;
  nextAction: string;
  /** User-facing deliverables summary for plan-mode display in chat. */
  deliverables?: string;
  cascade?: CascadeInfo;
  /** Tier-end git step failure: allows control-plane resume at `git`. */
  tierEndGitResumable?: boolean;
}

/** Result shape that control-plane can route on (start or end). */
export interface CommandResultForRouting {
  success: boolean;
  output: string;
  outcome?: ControlPlaneOutcome;
  modeGate?: string;
}

/** Context passed into control-plane when handling a command result. */
export interface ControlPlaneContext {
  tier: TierName;
  action: TierAction;
  /** Original params used to invoke the command (for re-invoke with execute options). */
  originalParams: unknown;
  /** Work classifier; used to refine messages (Phase 8). */
  workProfile?: import('../../harness/work-profile').WorkProfile;
}

/** Known reasonCodes that have explicit behavioral rules in the playbook. */
export const REASON_CODE = {
  PLAN_MODE: 'plan_mode',
  CONTEXT_GATHERING: 'context_gathering',
  PENDING_PUSH_CONFIRMATION: 'pending_push_confirmation',
  VERIFICATION_WORK_SUGGESTED: 'verification_work_suggested',
  GAP_ANALYSIS_PENDING: 'gap_analysis_pending',
  TASK_COMPLETE: 'task_complete',
  UNHANDLED_ERROR: 'unhandled_error',
  REOPEN_OK: 'reopen_ok',
  UNCOMMITTED_CHANGES_BLOCKING: 'uncommitted_changes_blocking',
  WRONG_BRANCH_BEFORE_COMMIT: 'wrong_branch_before_commit',
} as const;

/** Choice-set keys for message + options (presented in chat). Values must match harness QuestionKey. */
export const QUESTION_KEYS = {
  APPROVE_EXECUTE: 'approve_execute' as const satisfies QuestionKey,
  APPROVE_EXECUTE_TASK: 'approve_execute_task' as const satisfies QuestionKey,
  CONTEXT_GATHERING: 'context_gathering' as const satisfies QuestionKey,
  CASCADE: 'cascade_confirmation' as const satisfies QuestionKey,
  PUSH_CONFIRMATION: 'push_confirmation' as const satisfies QuestionKey,
  VERIFICATION_OPTIONS: 'verification_options' as const satisfies QuestionKey,
  GAP_ANALYSIS_OPTIONS: 'gap_analysis_options' as const satisfies QuestionKey,
  FAILURE_OPTIONS: 'failure_options' as const satisfies QuestionKey,
  AUDIT_FAILED_OPTIONS: 'audit_failed_options' as const satisfies QuestionKey,
  REOPEN_OPTIONS: 'reopen_options' as const satisfies QuestionKey,
  UNCOMMITTED_CHANGES: 'uncommitted_changes' as const satisfies QuestionKey,
} as const;
