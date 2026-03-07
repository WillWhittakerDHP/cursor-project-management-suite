/**
 * WorkProfile classifier: deterministic rules engine for work kind.
 * Accepts tier, action, optional overrides; returns normalized WorkProfile with derived decompositionMode.
 * See: work-profile-classifier-rollout plan Phase 6.
 */

import type { Tier } from './contracts';
import type { WorkProfile } from './work-profile';
import { getDefaultWorkProfile } from './work-profile-defaults';
import { deriveDecompositionMode } from './work-profile-rules';

type TierAction = 'start' | 'end';

export interface ClassifierInput {
  tier: Tier;
  action: TierAction;
  /** Optional override; when present, merged over defaults. */
  workProfileOverride?: Partial<WorkProfile>;
  /** Known command family or reason code (future: audit_fix, workflow_bug_fix). */
  reasonCode?: string;
}

/**
 * Classify work and return a normalized WorkProfile with derived decompositionMode.
 * Uses tier+action defaults, applies override, then derives decompositionMode from rules.
 */
export function classifyWorkProfile(input: ClassifierInput): WorkProfile {
  const { tier, action, workProfileOverride, reasonCode } = input;
  let profile = getDefaultWorkProfile(tier, action);

  // Reason-code overrides (Phase 9 pilot cases)
  if (reasonCode === 'audit_failed' || reasonCode === 'audit_fix') {
    profile = {
      ...profile,
      executionIntent: 'audit_fix',
      actionType: 'governance_remediation',
      scopeShape: 'contract_level',
      governanceDomains: [...new Set([...profile.governanceDomains, 'component', 'composable', 'function', 'type'])],
      contextPack: 'audit_remediation_pack',
      decompositionMode: 'moderate',
    };
  }
  if (reasonCode === 'workflow_bug_fix') {
    profile = {
      ...profile,
      executionIntent: 'refactor',
      actionType: 'workflow_bug_fix',
      scopeShape: 'cross_cutting',
      governanceDomains: [...new Set([...profile.governanceDomains, 'workflow', 'docs'])],
      contextPack: 'workflow_bug_fix_pack',
      decompositionMode: 'moderate',
    };
  }

  // Merge explicit override
  if (workProfileOverride) {
    profile = { ...profile, ...workProfileOverride };
  }

  // Derive decompositionMode from rules (overrides profile.decompositionMode when rules apply)
  const derivedMode = deriveDecompositionMode(profile);
  return { ...profile, decompositionMode: derivedMode };
}
