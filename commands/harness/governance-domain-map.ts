/**
 * Governance domain mapping: converts WorkProfile governanceDomains into
 * playbooks, audit reports, and soft review prompts. Connects classifier to existing governance model.
 * See: work-profile-classifier-rollout plan Phase 7.
 */

import type { GovernanceDomain } from './work-profile';

// ─── Domain → playbooks (repo-relative paths) ───────────────────────────────

const COMPONENT_PLAYBOOK = '.project-manager/COMPONENT_AUTHORING_PLAYBOOK.md';
const COMPOSABLE_PLAYBOOK = '.project-manager/COMPOSABLE_AUTHORING_PLAYBOOK.md';
const FUNCTION_PLAYBOOK = '.project-manager/FUNCTION_AUTHORING_PLAYBOOK.md';
const TYPE_PLAYBOOK = '.project-manager/TYPE_AUTHORING_PLAYBOOK.md';
const REQUIRED_DOC_SECTIONS = '.project-manager/REQUIRED_DOC_SECTIONS.md';
const HARNESS_CHARTER = '.project-manager/HARNESS_CHARTER.md';
const LAUNCH_CHECKLIST = '.project-manager/LAUNCH_CHECKLIST.md';
const ARCHITECTURE_DOC = '.project-manager/ARCHITECTURE.md';
export const AUDIT_GLOBAL_CONFIG = 'client/.audit-reports/audit-global-config.json';

const DOMAIN_TO_PLAYBOOKS: Record<GovernanceDomain, string[]> = {
  component: [COMPONENT_PLAYBOOK],
  composable: [COMPOSABLE_PLAYBOOK],
  function: [FUNCTION_PLAYBOOK],
  type: [TYPE_PLAYBOOK],
  docs: [REQUIRED_DOC_SECTIONS],
  testing: [LAUNCH_CHECKLIST],
  security: [FUNCTION_PLAYBOOK],
  data_flow: [TYPE_PLAYBOOK],
  workflow: [HARNESS_CHARTER],
  architecture: [ARCHITECTURE_DOC],
};

// ─── Domain → audit report names (baseline categories) ───────────────────────

const DOMAIN_TO_AUDITS: Record<GovernanceDomain, string[]> = {
  component: ['component-health', 'component-logic'],
  composable: ['composable-health', 'composables-logic'],
  function: ['function-complexity', 'constants-consolidation', 'todo-aging'],
  type: ['type-escape', 'type-constant-inventory', 'type-health'],
  docs: [],
  testing: ['test'],
  security: ['security'],
  data_flow: ['data-flow', 'data-flow-health'],
  workflow: [],
  architecture: ['architecture-alignment'],
};

// ─── Domain → soft review prompts for planning docs ──────────────────────────

const DOMAIN_TO_REVIEW_PROMPTS: Record<GovernanceDomain, string> = {
  component: 'Check component-health and component-logic; ensure prop/emit/coupling thresholds.',
  composable: 'Check composable-health and composables-logic; ensure flat contracts and action-based mutation.',
  function: 'Check function-complexity; ensure explicit return types and no silent error swallowing.',
  type: 'Check type-escape and type-constant-inventory; ensure Ref/ComputedRef boundaries.',
  docs: 'Ensure required doc sections (REQUIRED_DOC_SECTIONS.md) and handoff expectations.',
  testing: 'Consider verification strategy and test coverage per LAUNCH_CHECKLIST.',
  security: 'Review security-related patterns per function playbook.',
  data_flow: 'Check data-flow and type playbook for shared constant alignment.',
  workflow: 'Review harness charter for workflow ownership and control-doc behavior.',
  architecture:
    'Check ARCHITECTURE.md domain map and data flow for alignment; review architecture-alignment audit if present.',
};

export interface GovernanceDomainMapping {
  playbooks: string[];
  auditNames: string[];
  reviewPrompt: string;
}

/**
 * Get playbooks, audit names, and review prompt for a governance domain.
 */
export function getMappingForGovernanceDomain(domain: GovernanceDomain): GovernanceDomainMapping {
  return {
    playbooks: DOMAIN_TO_PLAYBOOKS[domain] ?? [],
    auditNames: DOMAIN_TO_AUDITS[domain] ?? [],
    reviewPrompt: DOMAIN_TO_REVIEW_PROMPTS[domain] ?? '',
  };
}

/**
 * Get all playbook paths for a list of governance domains. Deduplicated.
 */
export function getPlaybooksForGovernanceDomains(domains: GovernanceDomain[]): string[] {
  const set = new Set<string>();
  for (const d of domains) {
    for (const p of DOMAIN_TO_PLAYBOOKS[d] ?? []) set.add(p);
  }
  return [...set];
}

/**
 * Get all audit names for a list of governance domains. Deduplicated.
 */
export function getAuditNamesForGovernanceDomains(domains: GovernanceDomain[]): string[] {
  const set = new Set<string>();
  for (const d of domains) {
    for (const a of DOMAIN_TO_AUDITS[d] ?? []) set.add(a);
  }
  return [...set];
}
