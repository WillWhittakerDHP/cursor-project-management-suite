/**
 * WorkProfile context overlay: maps WorkProfile to extra context artifacts.
 * Layer 1: tier overlay (required ownership docs) — owned by context-injector.
 * Layer 2: workProfile overlay — extra context from executionIntent, scopeShape, governanceDomains.
 * See: work-profile-classifier-rollout plan Phase 3.
 */

import type { Tier } from './contracts';
import type { WorkProfile, ContextPackKind } from './work-profile';
import type { ArtifactRequest } from './contracts';
import { getPlaybooksForTier } from '../utils/tier-context-config';
import { getPlaybooksForGovernanceDomains } from './governance-domain-map';
import type { TierName } from '../tiers/shared/types';

export interface WorkProfileContextInput {
  workProfile: WorkProfile;
  tier: Tier;
  identifier: string;
  featureName: string;
}

/**
 * Resolve extra scored candidates from WorkProfile.
 * Returns artifacts to add to scoredCandidates; caller dedupes by artifactId.
 * When workProfile is absent, caller skips this overlay.
 */
export function getWorkProfileContextArtifacts(input: WorkProfileContextInput): ArtifactRequest[] {
  const { workProfile, tier, identifier, featureName } = input;
  const candidates: ArtifactRequest[] = [];

  // Governance-domain playbooks (Phase 7: canonical mapping from governance-domain-map)
  const playbookPaths = getPlaybooksForGovernanceDomains(workProfile.governanceDomains);
  for (const path of playbookPaths) {
    const base = path.replace(/^.*\//, '').replace(/\.[^.]+$/, '') || path;
    candidates.push({
      artifactId: `governance_${base.replace(/[^a-z0-9]/gi, '_')}`,
      path,
      kind: 'governance_rule',
      priority: 'high',
      estimatedTokens: 600,
    });
  }

  // Context-pack–specific artifacts (from contextPack or derived from executionIntent + actionType)
  const pack = workProfile.contextPack ?? inferContextPack(workProfile);
  const packArtifacts = getArtifactsForContextPack(pack, { tier, identifier, featureName });
  candidates.push(...packArtifacts);

  return candidates;
}

function inferContextPack(profile: WorkProfile): ContextPackKind {
  const { executionIntent, actionType } = profile;
  if (executionIntent === 'audit_fix') return 'audit_remediation_pack';
  if (executionIntent === 'document') return 'continuity_pack';
  if (executionIntent === 'verify') return 'verification_pack';
  if (actionType === 'workflow_bug_fix') return 'workflow_bug_fix_pack';
  if (actionType === 'contract_alignment') return 'contract_alignment_pack';
  if (actionType === 'localized_change') return 'local_implementation_pack';
  if (actionType === 'architecture_decision' || actionType === 'boundary_design') return 'architecture_decision_pack';
  if (actionType === 'decomposition') return 'decomposition_pack';
  return 'local_implementation_pack';
}

function getArtifactsForContextPack(
  pack: ContextPackKind,
  ctx: { tier: Tier; identifier: string; featureName: string }
): ArtifactRequest[] {
  const { tier, identifier, featureName } = ctx;
  const artifacts: ArtifactRequest[] = [];

  switch (pack) {
    case 'architecture_decision_pack':
      artifacts.push(
        { artifactId: 'wp_feature_handoff', path: `.project-manager/${featureName}-handoff.md`, kind: 'tier_handoff', priority: 'high', estimatedTokens: 800 },
        { artifactId: 'wp_project_plan', path: '.project-manager/PROJECT_PLAN.md', kind: 'tier_guide', priority: 'medium', estimatedTokens: 500 }
      );
      break;
    case 'decomposition_pack':
      artifacts.push(
        { artifactId: 'wp_feature_handoff', path: `.project-manager/${featureName}-handoff.md`, kind: 'tier_handoff', priority: 'high', estimatedTokens: 800 },
        { artifactId: 'wp_project_plan', path: '.project-manager/PROJECT_PLAN.md', kind: 'tier_guide', priority: 'medium', estimatedTokens: 500 }
      );
      break;
    case 'workflow_bug_fix_pack':
      artifacts.push(
        { artifactId: 'wp_harness_contracts', path: '.cursor/commands/harness/contracts.ts', kind: 'code_file', priority: 'high', estimatedTokens: 800 },
        { artifactId: 'wp_pending_state', path: '.cursor/commands/tiers/shared/pending-state.ts', kind: 'code_file', priority: 'high', estimatedTokens: 600 },
        { artifactId: 'wp_harness_charter', path: '.project-manager/HARNESS_CHARTER.md', kind: 'governance_rule', priority: 'medium', estimatedTokens: 500 }
      );
      break;
    case 'contract_alignment_pack':
      artifacts.push(
        { artifactId: 'wp_type_playbook', path: '.project-manager/TYPE_AUTHORING_PLAYBOOK.md', kind: 'governance_rule', priority: 'high', estimatedTokens: 600 },
        { artifactId: 'wp_audit_config', path: 'client/.audit-reports/audit-global-config.json', kind: 'audit_baseline', priority: 'medium', estimatedTokens: 400 }
      );
      break;
    case 'local_implementation_pack':
      if (tier === 'task') {
        const parts = identifier.split('.');
        const sessionId = parts.slice(0, 3).join('.');
        artifacts.push({
          artifactId: 'wp_session_guide',
          path: `.project-manager/phase-guides/${sessionId}/session-guide.md`,
          kind: 'tier_guide',
          priority: 'high',
          estimatedTokens: 1000,
        });
      }
      break;
    case 'audit_remediation_pack':
      artifacts.push(
        { artifactId: 'wp_audit_config', path: 'client/.audit-reports/audit-global-config.json', kind: 'audit_baseline', priority: 'high', estimatedTokens: 400 }
      );
      // Add tier-relevant playbooks (Phase 7 governance-domain-map will refine)
      for (const p of getPlaybooksForTier(tier as TierName)) {
        const base = p.replace(/^.*\//, '').replace(/\.[^.]+$/, '') || p;
        artifacts.push({
          artifactId: `wp_audit_playbook_${base.replace(/[^a-z0-9]/gi, '_')}`,
          path: p,
          kind: 'governance_rule',
          priority: 'high',
          estimatedTokens: 500,
        });
      }
      break;
    case 'verification_pack':
      artifacts.push(
        { artifactId: 'wp_handoff', path: `.project-manager/${featureName}-handoff.md`, kind: 'tier_handoff', priority: 'medium', estimatedTokens: 600 }
      );
      break;
    case 'continuity_pack':
      artifacts.push(
        { artifactId: 'wp_handoff', path: `.project-manager/${featureName}-handoff.md`, kind: 'tier_handoff', priority: 'high', estimatedTokens: 800 }
      );
      if (tier === 'session') {
        artifacts.push({
          artifactId: `wp_log_${identifier}`,
          path: `.project-manager/session-logs/${identifier}.md`,
          kind: 'tier_log',
          priority: 'medium',
          estimatedTokens: 600,
        });
      }
      break;
    case 'boundary_design_pack':
      artifacts.push(
        { artifactId: 'wp_feature_handoff', path: `.project-manager/${featureName}-handoff.md`, kind: 'tier_handoff', priority: 'high', estimatedTokens: 800 }
      );
      break;
    default:
      break;
  }

  return artifacts;
}
