/**
 * Reason-code parsing: map legacy string reason codes to charter ReasonCode union.
 * Enables exhaustive routing with no permissive string fallback for known codes.
 */

import type { ReasonCode, FlowReasonCode, FailureReasonCode } from './contracts';

/** Legacy reason-code strings emitted by current start/end impls. plan_mode maps to context_gathering (retired). */
const LEGACY_TO_CHARTER: Record<string, ReasonCode> = {
  plan_mode: 'context_gathering',
  context_gathering: 'context_gathering',
  planning_doc_incomplete: 'planning_doc_incomplete',
  pending_push_confirmation: 'pending_push',
  verification_work_suggested: 'verification_suggested',
  task_complete: 'task_complete',
  reopen_ok: 'reopen_ok',
  uncommitted_changes_blocking: 'uncommitted_blocking',
  wrong_branch_before_commit: 'wrong_branch_before_commit',
  app_not_running: 'app_not_running',
  expected_branch_missing_run_tier_start: 'expected_branch_missing_run_tier_start',
  guide_fill_pending: 'guide_fill_pending',
  guide_incomplete: 'guide_incomplete',
  unhandled_error: 'unhandled_error',
  // Charter-only codes (impls may emit these in future)
  start_ok: 'start_ok',
  end_ok: 'end_ok',
  pending_push: 'pending_push',
  verification_suggested: 'verification_suggested',
  uncommitted_blocking: 'uncommitted_blocking',
  validation_failed: 'validation_failed',
  audit_failed: 'audit_failed',
  test_failed: 'test_failed',
  preflight_failed: 'preflight_failed',
  git_failed: 'git_failed',
  branch_failed: 'branch_failed',
  guide_materialization_failed: 'guide_materialization_failed',
  guide_materialization_requires_execute: 'guide_materialization_requires_execute',
  no_pending_plan: 'no_pending_plan',
  no_pending_build: 'no_pending_build',
  no_pending_code: 'no_pending_code',
  no_pending_push: 'no_pending_push',
  wrong_accepted_command: 'wrong_accepted_command',
  invalid_context: 'invalid_context',
  invalid_task_id: 'invalid_task_id',
  audit_fix_commit_failed: 'audit_fix_commit_failed',
  CONFLICT_MARKERS_IN_TREE: 'conflict_markers_in_tree',
  conflict_markers_in_tree: 'conflict_markers_in_tree',
  harness_step_warning: 'unhandled_error',
};

const FAILURE_CODES: FailureReasonCode[] = [
  'validation_failed',
  'audit_failed',
  'test_failed',
  'preflight_failed',
  'git_failed',
  'wrong_branch_before_commit',
  'app_not_running',
  'expected_branch_missing_run_tier_start',
  'branch_failed',
  'guide_materialization_failed',
  'guide_materialization_requires_execute',
  'no_pending_plan',
  'no_pending_build',
  'no_pending_code',
  'no_pending_push',
  'wrong_accepted_command',
  'invalid_context',
  'invalid_task_id',
  'audit_fix_commit_failed',
  'unhandled_error',
  'conflict_markers_in_tree',
];

/**
 * Parse legacy outcome.reasonCode (string) to charter ReasonCode.
 * Unknown strings map to 'unhandled_error' so the router never falls through with an untyped string.
 */
export function parseReasonCode(s: string): ReasonCode {
  const trimmed = (s ?? '').trim();
  const mapped = LEGACY_TO_CHARTER[trimmed];
  if (mapped !== undefined) return mapped;
  return 'unhandled_error';
}

/** Type guard: true if code is a failure reason (router should stop, no cascade). */
export function isFailureReasonCode(code: ReasonCode): code is FailureReasonCode {
  return FAILURE_CODES.includes(code as FailureReasonCode);
}

/** Type guard: true if code is a flow reason. */
export function isFlowReasonCode(code: ReasonCode): code is FlowReasonCode {
  return !isFailureReasonCode(code);
}
