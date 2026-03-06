/**
 * Tier context config: single place for tier → playbooks, audit → playbooks,
 * and tier+action doc candidate keys. Re-exports tier navigation (tierUp, tierDown).
 * Consumed by audit-fix for governance refs; (future) harness context injection uses it.
 */

export { tierUp, tierDown, getTierLevel } from './tier-navigation';
import type { TierName } from '../tiers/shared/types';
import { getAuditNamesForTier } from '../audit/atomic/audit-tier-quality';
import type { AuditTier } from '../audit/types';

// ─── Playbook path constants (repo-relative, no leading @) ───────────────────

const COMPONENT_PLAYBOOK = '.project-manager/COMPONENT_AUTHORING_PLAYBOOK.md';
const COMPOSABLE_PLAYBOOK = '.project-manager/COMPOSABLE_AUTHORING_PLAYBOOK.md';
const FUNCTION_PLAYBOOK = '.project-manager/FUNCTION_AUTHORING_PLAYBOOK.md';
const TYPE_PLAYBOOK = '.project-manager/TYPE_AUTHORING_PLAYBOOK.md';
export const AUDIT_GLOBAL_CONFIG = 'client/.audit-reports/audit-global-config.json';

// ─── Audit → playbooks mapping ─────────────────────────────────────────────

const AUDIT_TO_PLAYBOOKS: Record<string, string[]> = {
  // Session-tier (component, composable, function, type)
  'component-health': [COMPONENT_PLAYBOOK],
  'component-logic': [COMPONENT_PLAYBOOK],
  'composable-health': [COMPOSABLE_PLAYBOOK],
  'composables-logic': [COMPOSABLE_PLAYBOOK],
  'function-complexity': [FUNCTION_PLAYBOOK],
  'constants-consolidation': [FUNCTION_PLAYBOOK],
  'todo-aging': [FUNCTION_PLAYBOOK],
  'type-escape': [TYPE_PLAYBOOK],
  'type-constant-inventory': [TYPE_PLAYBOOK],
  // Phase-tier
  'typecheck': [TYPE_PLAYBOOK],
  'type-similarity': [TYPE_PLAYBOOK],
  'type-health': [TYPE_PLAYBOOK],
  'duplication': [FUNCTION_PLAYBOOK],
  'unused-code': [FUNCTION_PLAYBOOK],
  'pattern-detection': [FUNCTION_PLAYBOOK],
  'import-graph': [COMPOSABLE_PLAYBOOK],
  'file-cohesion': [COMPONENT_PLAYBOOK],
  'deprecation': [FUNCTION_PLAYBOOK],
  'api-contract': [TYPE_PLAYBOOK],
  'data-flow': [TYPE_PLAYBOOK],
  'data-flow-health': [TYPE_PLAYBOOK],
  // Task-tier
  'loop-mutations': [FUNCTION_PLAYBOOK],
  'hardcoding': [FUNCTION_PLAYBOOK],
  'error-handling': [FUNCTION_PLAYBOOK],
  'naming-convention': [FUNCTION_PLAYBOOK],
  'security': [FUNCTION_PLAYBOOK],
  // Feature-tier (minimal; fallback to all when tier is feature)
  'test': [],
  'coverage-risk-crossref': [],
  'bundle-size-budget': [],
  'api-versioning': [],
  'dep-freshness': [],
  'meta': [],
};

/** Playbook paths (repo-relative) for a given audit name. Always includes AUDIT_GLOBAL_CONFIG when any path is returned. */
export function getPlaybooksForAudit(auditName: string): string[] {
  const paths = AUDIT_TO_PLAYBOOKS[auditName] ?? [];
  if (paths.length === 0) return [];
  const dedup = new Set(paths);
  dedup.add(AUDIT_GLOBAL_CONFIG);
  return [...dedup];
}

/** Playbook paths (repo-relative) for all audits that run at the given tier. Deduplicated, includes AUDIT_GLOBAL_CONFIG. */
export function getPlaybooksForTier(tier: TierName): string[] {
  const names = getAuditNamesForTier(tier as AuditTier);
  const set = new Set<string>();
  for (const name of names) {
    for (const p of getPlaybooksForAudit(name)) set.add(p);
  }
  set.add(AUDIT_GLOBAL_CONFIG);
  return [...set];
}

/** Extract audit name from report path (e.g. component-health-audit.md → component-health). Returns null if not recognizable. */
export function reportPathToAuditName(reportPath: string): string | null {
  const base = reportPath.replace(/^.*\//, '').trim();
  const withoutExt = base.replace(/\.(json|md)$/, '');
  const name = withoutExt.replace(/-audit$/, '') || withoutExt;
  if (!name) return null;
  return name in AUDIT_TO_PLAYBOOKS ? name : null;
}

// ─── Tier + action → doc candidate keys (Charter Candidate manifest) ───────

export type TierAction = 'start' | 'end';

export interface TierActionCandidates {
  required: string[];
  highSignal: string[];
  optional: string[];
}

/** Symbolic doc candidate keys per tier+action. Harness resolves keys to paths when implementing context injection. */
export const TIER_ACTION_CANDIDATES: Record<
  TierName,
  Record<TierAction, TierActionCandidates>
> = {
  session: {
    start: {
      required: ['phase_guide_session_entry', 'phase_handoff'],
      highSignal: [],
      optional: ['audit_baseline', 'governance_rules'],
    },
    end: {
      required: ['session_guide', 'modified_files_list'],
      highSignal: ['test_results', 'handoff'],
      optional: ['audit_baseline', 'feature_guide'],
    },
  },
  task: {
    start: {
      required: ['session_guide_task_section', 'session_handoff_excerpt'],
      highSignal: [],
      optional: ['governance_rules_task_files'],
    },
    end: {
      required: ['session_guide_task_section', 'modified_files'],
      highSignal: ['test_results'],
      optional: ['audit_baseline'],
    },
  },
  phase: {
    start: {
      required: ['feature_guide_phase_descriptor', 'feature_handoff'],
      highSignal: [],
      optional: ['audit_baseline'],
    },
    end: {
      required: ['phase_guide', 'completed_sessions_list'],
      highSignal: ['test_results'],
      optional: ['audit_baseline', 'feature_guide'],
    },
  },
  feature: {
    start: {
      required: ['feature_guide', 'project_plan_entry'],
      highSignal: [],
      optional: ['audit_baseline'],
    },
    end: {
      required: ['feature_guide', 'completed_phases_list'],
      highSignal: ['test_results'],
      optional: ['audit_baseline'],
    },
  },
};
