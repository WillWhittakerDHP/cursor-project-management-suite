/**
 * WorkProfile: orthogonal classifier for work kind, distinct from tier orchestration.
 * WorkflowCommandContext owns scope; WorkProfile classifies work.
 * See: work-profile-classifier-rollout plan.
 */

export type ExecutionIntent =
  | 'plan'
  | 'design'
  | 'implement'
  | 'refactor'
  | 'audit_fix'
  | 'verify'
  | 'document';

export type ActionType =
  | 'architecture_decision'
  | 'decomposition'
  | 'boundary_design'
  | 'logic_extraction'
  | 'contract_alignment'
  | 'reuse_genericization'
  | 'governance_remediation'
  | 'workflow_bug_fix'
  | 'localized_change'
  | 'verification_strategy'
  | 'continuity_handoff';

export type ScopeShape =
  | 'architectural'
  | 'cross_cutting'
  | 'contract_level'
  | 'file_local'
  | 'snippet_level'
  | 'tier_document';

export type GovernanceDomain =
  | 'component'
  | 'composable'
  | 'function'
  | 'type'
  | 'docs'
  | 'testing'
  | 'security'
  | 'data_flow'
  | 'workflow';

export type ContextPackKind =
  | 'architecture_decision_pack'
  | 'decomposition_pack'
  | 'boundary_design_pack'
  | 'contract_alignment_pack'
  | 'workflow_bug_fix_pack'
  | 'local_implementation_pack'
  | 'audit_remediation_pack'
  | 'verification_pack'
  | 'continuity_pack';

export type PlanningArtifactAction = 'none' | 'create' | 'update';

/** Derived from executionIntent + actionType + scopeShape; controls decomposition intensity. */
export type DecompositionMode = 'light' | 'moderate' | 'explicit';

export interface WorkProfile {
  executionIntent: ExecutionIntent;
  actionType: ActionType;
  scopeShape: ScopeShape;
  governanceDomains: GovernanceDomain[];
  contextPack?: ContextPackKind;
  planningArtifactAction?: PlanningArtifactAction;
  decompositionMode?: DecompositionMode;
}
