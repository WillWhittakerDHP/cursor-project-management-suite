/**
 * WorkProfile derivation rules: decompositionMode from executionIntent + actionType + scopeShape.
 * Tier alone must never determine decompositionMode. Prefer light/moderate over explicit when ambiguous.
 * See: work-profile-classifier-rollout plan Phase 6.
 */

import type { WorkProfile, DecompositionMode } from './work-profile';

/**
 * Derive decompositionMode from WorkProfile fields.
 * Guardrails: task tier does not imply explicit; explicit requires bounded scope + high confidence.
 */
export function deriveDecompositionMode(profile: WorkProfile): DecompositionMode {
  const { executionIntent, actionType, scopeShape } = profile;

  // Light: plan/design/document/verify with architectural or high-level scope
  if (executionIntent === 'plan' && actionType === 'decomposition' && scopeShape === 'architectural') return 'light';
  if (executionIntent === 'design' && actionType === 'architecture_decision') return 'light';
  if (executionIntent === 'document' && actionType === 'continuity_handoff') return 'light';
  if (executionIntent === 'verify' && actionType === 'verification_strategy') return 'light';
  if (executionIntent === 'plan' && scopeShape === 'architectural') return 'light';

  // Moderate: refactor, audit_fix, cross_cutting
  if (executionIntent === 'refactor' && actionType === 'reuse_genericization' && scopeShape === 'cross_cutting') return 'moderate';
  if (executionIntent === 'refactor' && actionType === 'contract_alignment' && scopeShape === 'contract_level') return 'moderate';
  if (executionIntent === 'audit_fix' && actionType === 'governance_remediation') return 'moderate';
  if (scopeShape === 'cross_cutting') return 'moderate';

  // Explicit: only when tightly bounded and stable; prefer moderate when unsure
  if (executionIntent === 'implement' && actionType === 'localized_change' && scopeShape === 'file_local') {
    // Guardrail: explicit only when scope is tightly bounded; default to moderate
    return 'moderate';
  }

  return 'moderate';
}
