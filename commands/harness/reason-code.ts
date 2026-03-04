/**
 * Reason-code parsing: map legacy string reason codes to charter ReasonCode union.
 * Enables exhaustive routing with no permissive string fallback for known codes.
 */

import type { ReasonCode, FlowReasonCode, FailureReasonCode } from './contracts';

/** Legacy reason-code strings emitted by current start/end impls. */
const LEGACY_TO_CHARTER: Record<string, ReasonCode> = {
  plan_mode: 'plan_mode',
  context_gathering: 'context_gathering',
  planning_doc_incomplete: 'planning_doc_incomplete',
  pending_push_confirmation: 'pending_push',
  verification_work_suggested: 'verification_suggested',
  task_complete: 'task_complete',
  reopen_ok: 'reopen_ok',
  uncommitted_changes_blocking: 'uncommitted_blocking',
  guide_fill_pending: 'guide_fill_pending',
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
};

const FAILURE_CODES: FailureReasonCode[] = [
  'validation_failed',
  'audit_failed',
  'test_failed',
  'preflight_failed',
  'git_failed',
  'unhandled_error',
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
