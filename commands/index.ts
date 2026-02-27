/**
 * Main entry point for slash commands
 * Exports all commands organized by tier (Feature → Phase → Session → Task)
 */

// Tier configs and shared operations (config-driven pipeline)
export * from './tiers/shared/types';
export * from './tiers/shared/tier-change';
export * from './tiers/shared/tier-validate';
export * from './tiers/shared/tier-complete';
export * from './tiers/shared/tier-checkpoint';
export * from './tiers/shared/tier-plan';
export * from './tiers/shared/tier-start';
export * from './tiers/shared/tier-end';
export * from './tiers/shared/tier-reopen';
export * from './tiers/shared/control-plane-types';
export * from './tiers/shared/control-plane-route';
export * from './tiers/shared/control-plane-reinvoke';
export * from './tiers/configs/feature';
export * from './tiers/configs/phase';
export * from './tiers/configs/session';
export * from './tiers/configs/task';

// Feature tier (Tier 0 - Highest Level)
export * from './tiers/feature/atomic/feature-create';
export * from './tiers/feature/atomic/feature-research';
export * from './tiers/feature/atomic/feature-load';
export * from './tiers/feature/atomic/feature-checkpoint';
export * from './tiers/feature/atomic/feature-summarize';
export * from './tiers/feature/atomic/feature-close';
export * from './tiers/feature/composite/feature';

// Phase tier (Tier 1 - High-Level)
export * from './tiers/phase/composite/phase';

// Session tier (Tier 2 - Medium-Level)
export * from './tiers/session/atomic/create-session-label';
export * from './tiers/session/composite/session';

// Task tier (Tier 3 - Low-Level)
export * from './tiers/task/atomic/format-task-entry';
export * from './tiers/task/atomic/add-task-section';
export * from './tiers/task/atomic/mark-complete';
export { taskCheckpoint } from './tiers/task/atomic/checkpoint';
// Deprecated: format-subsession-entry and add-subsession-section are kept for backward compatibility but not exported
export * from './tiers/task/composite/task';

// Utils (Cross-tier utilities)
export { readHandoff, type HandoffTier as ReadHandoffTier } from './utils/read-handoff';
export * from './utils/read-guide';
export * from './utils/lint';
export * from './utils/type-check';
export * from './utils/test';
export * from './utils/verify-app';
export * from './utils/append-log';
export * from './utils/update-next-action';
export * from './utils/update-timestamp';
export * from './utils/generate-prompt';
// Git operations (Cross-tier utilities)
export * from './git/atomic/create-branch';
export * from './git/atomic/commit';
export * from './git/atomic/push';
export * from './git/atomic/merge';
export { checkDocs as checkDocsUtil } from './utils/check-docs';
export { checkReuse as checkReuseUtil } from './utils/check-reuse';
export * from './utils/update-guide';
export * from './utils/update-handoff-minimal';
export * from './utils/status';
export * from './utils/verify';
export * from './utils/check-before-implement';
export * from './utils/utils';
export * from './utils/tier-discriminator';
export * from './utils/tier-navigation';
export * from './utils/scope-and-summarize';
export * from './utils/scope-and-change';
export {
  runTier,
  type TierRunParams,
  type TierRunResult,
  type FeatureStartParams,
  type PhaseStartParams,
  type SessionStartParams,
  type TaskStartParams,
  type TaskEndResult,
} from './utils/tier-runner';

// Document operations (unified; formerly workflow/)
export * from './document/composite/read-guide';
export * from './document/composite/read-log';
export * from './document/composite/read-handoff';
export * from './document/composite/update-section';
export * from './document/composite/create-from-template';

// Planning tier (Cross-tier utilities)
export * from './planning/atomic/parse-plain-language';
export * from './planning/atomic/validate-planning';
export * from './planning/atomic/apply-template';
export { checkDocumentation, checkDocs } from './planning/atomic/check-documentation';
export { checkReuse } from './planning/atomic/check-reuse';
export * from './planning/atomic/check-critical-points';
export { analyzeAlternativesCommand as generateAlternatives } from './planning/atomic/generate-alternatives';
export { analyzeAlternativesCommand as analyzeAlternatives } from './planning/atomic/analyze-alternatives';
export * from './planning/atomic/enforce-decision-gate';
export { planWithChecks, type PlanWithChecksOptions, type DocCheckType } from './planning/composite/plan-with-checks';
export * from './planning/composite/plan-with-alternatives';
export * from './planning/composite/plan-complete';
export * from './planning/composite/plan-tier';
export * from './planning/utils/resolve-planning-description';
export { runPlanningWithChecks, type RunPlanningWithChecksParams } from './planning/utils/run-planning-pipeline';

// Document operations (Cross-tier utilities)
export * from './document/atomic/read-section';
export * from './document/atomic/extract-section';
export * from './document/atomic/list-sections';

// README management (Cross-tier utilities)
export * from './readme/atomic/readme-create';
export * from './readme/atomic/readme-audit';
export { validateReadme, type ValidationResult as ReadmeValidationResult } from './readme/atomic/readme-validate';
export * from './readme/atomic/readme-extract-section';
export * from './readme/atomic/readme-mark-temporary';
export * from './readme/atomic/readme-detect-temporary';
export * from './readme/atomic/readme-consolidate-findings';
export * from './readme/composite/readme-audit-all';
export * from './readme/composite/readme-consolidate';
export * from './readme/composite/readme-split';
export * from './readme/composite/readme-cleanup-temporary';
export { workflowCleanupReadmes, type WorkflowTier as ReadmeWorkflowTier } from './readme/composite/readme-workflow-cleanup';

// Checkpoint operations (Cross-tier utilities)
export * from './checkpoint/atomic/create-checkpoint';
export * from './checkpoint/composite/checkpoint';

// Status/Query operations (Cross-tier utilities)
export * from './status/atomic/get-status';
export * from './status/atomic/query-changes';
export * from './status/atomic/query-citations';
export * from './status/composite/status-detailed';
export * from './status/composite/status-cross-tier';

// Handoff operations (Cross-tier utilities)
export { generateHandoff, type HandoffTier, type GenerateHandoffParams } from './handoff/atomic/generate-handoff';
export { reviewHandoff, type HandoffTier as ReviewHandoffTier } from './handoff/atomic/review-handoff';
export * from './handoff/composite/handoff-complete';

// Code comments (Cross-tier utilities)
export * from './comments/atomic/format-comment';
export * from './comments/atomic/add-comment';
export * from './comments/atomic/review-file';
export {
  commentCleanup,
  featureCommentCleanup,
  phaseCommentCleanup,
  FEATURE_CLEANUP_CONFIG,
  PHASE_CLEANUP_CONFIG,
  type CleanupConfig,
  type CommentCleanupResult,
  type CommentCleanupParams as FeatureCommentCleanupParams,
  type CommentCleanupParams as PhaseCommentCleanupParams,
  type CommentCleanupResult as FeatureCommentCleanupResult,
  type CommentCleanupResult as PhaseCommentCleanupResult,
} from './comments/commentCleanup';
export * from './comments/composite/add-comments-batch';
export * from './comments/composite/review-and-add';

// Validation operations (Cross-tier utilities)
export { validateWorkflow, type ValidationResult as WorkflowValidationResult } from './validation/atomic/validate-workflow';
export * from './validation/atomic/security-check';
export * from './validation/atomic/verify-completeness';
export * from './validation/composite/audit-commands';
export * from './validation/composite/validate-complete';

// Testing operations (Cross-tier utilities)
// Atomic test commands
export * from './testing/atomic/test-run';
export * from './testing/atomic/test-watch';
export * from './testing/atomic/test-coverage';
export * from './testing/atomic/test-validate';
export * from './testing/atomic/test-check-immutable';
export * from './testing/atomic/test-lint';
export * from './testing/atomic/test-template';
export * from './testing/atomic/test-analyze-impact';
// Composite test commands
export * from './testing/composite/test-workflow';
export * from './testing/composite/test-before-commit';
export * from './testing/composite/test-on-change';
export { testEndWorkflow, type WorkflowTier as TestWorkflowTier } from './testing/composite/test-end-workflow';
export { testCatchup } from './testing/composite/test-catchup';
export * from './testing/composite/test-dev-workflow';
// Test utilities
export * from './testing/utils/test-immutability';
export * from './testing/utils/test-config';

// Audit commands (Cross-tier utilities)
export * from './audit/types';
export * from './audit/utils';
// Atomic audit commands
export * from './audit/atomic/audit-docs';
export * from './audit/atomic/audit-security';
export * from './audit/atomic/audit-vue-architecture';
export * from './audit/atomic/audit-code-quality';
// Composite audit commands
export * from './audit/composite/audit-feature-start';
export * from './audit/composite/audit-feature';
export * from './audit/composite/audit-phase-start';
export * from './audit/composite/audit-phase';
export * from './audit/composite/audit-session-start';
export * from './audit/composite/audit-session';
export * from './audit/composite/audit-task';

// Security commands (Cross-tier utilities)
export * from './security/atomic/check-auth';
export * from './security/atomic/check-config';
export * from './security/atomic/check-csrf';
export * from './security/atomic/check-dependencies';
export * from './security/atomic/check-idor';
export * from './security/atomic/check-secrets';
export * from './security/composite/security-audit';
