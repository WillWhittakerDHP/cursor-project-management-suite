/**
 * WorkProfile-aware message refinement for control-plane handlers.
 * Appends brief guidance when workProfile matches known patterns (Phase 8).
 * Does not rewrite the control plane; refines only where too generic.
 */

import type { WorkProfile } from '../../harness/work-profile';

/**
 * Return work-profile-specific guidance to append to messages, or empty string.
 * Examples: design+architecture_decision -> prompt for options, ownership, trade-offs;
 * audit_fix -> foreground report, playbook, affected files, etc.
 */
export function getWorkProfileMessageSuffix(workProfile?: WorkProfile | null): string {
  if (!workProfile) return '';
  const { executionIntent, actionType } = workProfile;

  if (executionIntent === 'design' && actionType === 'architecture_decision') {
    return '\n\n**Planning focus:** Consider options, ownership, trade-offs, and where to record the decision.';
  }
  if (executionIntent === 'refactor' && actionType === 'reuse_genericization') {
    return '\n\n**Planning focus:** Consider shared abstraction boundary, consumers, and regression surface.';
  }
  if (executionIntent === 'audit_fix' && actionType === 'governance_remediation') {
    return '\n\n**Planning focus:** Foreground the report, playbook, and affected files.';
  }
  if (executionIntent === 'implement' && actionType === 'localized_change') {
    return '\n\n**Planning focus:** Reduce context to the task plan and directly touched files.';
  }

  return '';
}
