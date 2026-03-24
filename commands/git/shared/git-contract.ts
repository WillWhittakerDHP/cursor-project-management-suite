/**
 * Stable public contract for harness git outcomes.
 *
 * Tier start/end workflows and the control plane depend on these shapes and
 * reason codes. When changing behavior, keep field names and reasonCode strings
 * backward-compatible or update callers in tier-end/start and playbooks together.
 */

import type { TierName } from '../../tiers/shared/types';

/** One link in the resolved branch chain (develop → feature/…); phase/session tiers no longer add links. */
export interface BranchChainLink {
  tier: TierName;
  branchName: string;
  parentBranchName: string | null;
  isRoot: boolean;
}

/** Options for ensureTierBranch (tier-start branch alignment + optional `.cursor` submodule sync). */
export type SubmoduleCursorMode = 'off' | 'parent' | 'remote';

export interface EnsureTierBranchOptions {
  pullRoot?: boolean;
  createIfMissing?: boolean;
  syncRemote?: boolean;
  /**
   * `.cursor` submodule: `off` = no submodule commands; `parent` = match parent gitlink;
   * `remote` = `submodule update --init --remote` (may advance submodule and dirty parent).
   */
  submoduleCursor?: SubmoduleCursorMode;
}

/** Result of ensureTierBranch / ensureFeatureBranch (tier-start). */
export interface EnsureTierBranchResult {
  success: boolean;
  messages: string[];
  finalBranch: string;
  chain: BranchChainLink[];
  /** When true, checkout was blocked by uncommitted changes that need user decision. */
  blockedByUncommitted?: boolean;
  /** File paths that blocked checkout (non-.cursor files needing user decision). */
  uncommittedFiles?: string[];
  /** Paths auto-committed on the source branch before checkout (workflow artifacts). */
  autoCommittedPaths?: string[];
}

/** Result of mergeTierBranch / mergeFeatureIntoTrunk (tier-end). */
export interface MergeTierBranchResult {
  success: boolean;
  messages: string[];
  mergedInto: string;
  deletedBranch: boolean;
  /** Stable machine reason when success is false. */
  reasonCode?: MergeTierFailureReasonCode;
}

/** Documented failure codes from mergeTierBranch (and related git steps). */
export const MERGE_TIER_REASON_CODES = [
  'no_parent_branch',
  'invalid_merge_options',
  'tier_branch_not_found',
  'ambiguous_branch_prefix',
  'parent_branch_not_found',
  'wrong_branch_before_merge',
  'pre_merge_commit_failed',
  'dirty_tree_before_merge',
  'merge_failed',
  'push_failed_after_merge',
  'delete_local_branch_failed',
  'delete_remote_branch_failed',
  'branch_not_based_on_parent',
  'ancestor_behind_parent',
  'diverged_from_remote',
  'current_branch_unknown',
  'pull_root_failed',
] as const;

export type MergeTierFailureReasonCode = (typeof MERGE_TIER_REASON_CODES)[number];

export function isMergeTierFailureReasonCode(s: string): s is MergeTierFailureReasonCode {
  return (MERGE_TIER_REASON_CODES as readonly string[]).includes(s);
}

export interface MergeChildBranchesResult {
  merged: string[];
  failed: string[];
  messages: string[];
}

export interface CommitUncommittedOptions {
  expectedBranch?: string;
  allowedPrefixes?: string[];
}

export interface ScopeCoherenceResult {
  coherent: boolean;
  configFeature: string;
  branchFeature: string | null;
  message: string;
}
