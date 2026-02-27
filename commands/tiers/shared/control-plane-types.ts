/**
 * Shared control-plane contract for tier workflows.
 * Single routing contract consumed by start, end, and reopen flows.
 * Behavioral rules (mode switch, AskQuestion, re-invoke) are keyed by reasonCode.
 */

import type { TierName } from './types';
import type { CascadeInfo } from '../../utils/tier-outcome';

/** Action verb for tier commands. */
export type TierAction = 'start' | 'end' | 'reopen';

/** Normalized outcome shape for routing; start and end results both expose this. */
export interface ControlPlaneOutcome {
  reasonCode: string;
  nextAction: string;
  /** User-facing deliverables summary for plan-mode approval (shown in AskQuestion). */
  deliverables?: string;
  cascade?: CascadeInfo;
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
}

/**
 * Decision produced by a reasonCode handler.
 * stop: true = do not proceed to execute/cascade; show message and wait for user.
 * nextInvoke: when user approves, run this command (e.g. same tier start with mode: 'execute').
 */
export interface ControlPlaneDecision {
  stop: boolean;
  message: string;
  /** Required mode for the agent before showing message / AskQuestion. */
  requiredMode: 'plan' | 'agent';
  /**
   * When present, agent should AskQuestion; key identifies the question template.
   * Templates: 'approve_execute' | 'cascade' | 'push_confirmation' | 'verification_options' | 'failure_options'
   */
  questionKey?: string;
  /** For cascade: exact command string to run on "Yes". */
  cascadeCommand?: string;
  /** For approve_execute: re-invoke same command with these params (includes mode: 'execute'). */
  nextInvoke?: {
    tier: TierName;
    action: TierAction;
    params: unknown;
  };
}

/** Known reasonCodes that have explicit behavioral rules in the playbook. */
export const REASON_CODE = {
  PLAN_MODE: 'plan_mode',
  PENDING_PUSH_CONFIRMATION: 'pending_push_confirmation',
  VERIFICATION_WORK_SUGGESTED: 'verification_work_suggested',
  TASK_COMPLETE: 'task_complete',
  UNHANDLED_ERROR: 'unhandled_error',
  REOPEN_OK: 'reopen_ok',
  UNCOMMITTED_CHANGES_BLOCKING: 'uncommitted_changes_blocking',
} as const;

/** Question template keys used by the agent to render AskQuestion. */
export const QUESTION_KEYS = {
  APPROVE_EXECUTE: 'approve_execute',
  CASCADE: 'cascade',
  PUSH_CONFIRMATION: 'push_confirmation',
  VERIFICATION_OPTIONS: 'verification_options',
  FAILURE_OPTIONS: 'failure_options',
  REOPEN_OPTIONS: 'reopen_options',
  UNCOMMITTED_CHANGES: 'uncommitted_changes',
} as const;
