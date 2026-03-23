/**
 * Pure branch-chain resolution from tier config (no git shell-outs).
 */

import type { TierConfig, TierName } from '../../tiers/shared/types';
import type { WorkflowCommandContext } from '../../utils/command-context';
import { tierUp } from '../../utils/tier-navigation';
import { getConfigForTier } from '../../tiers/configs/index';
import type { BranchChainLink } from './git-contract';

const ROOT_BRANCH_NAMES = ['develop', 'main', 'master'];

export function isRootBranch(branchName: string): boolean {
  return ROOT_BRANCH_NAMES.includes(branchName);
}

/**
 * Resolve the identifier the parent tier needs for getBranchName.
 */
export function resolveParentId(
  parentTier: TierName,
  childId: string,
  context: WorkflowCommandContext
): string {
  switch (parentTier) {
    case 'feature':
      return context.feature.name;
    case 'phase': {
      const parts = childId.split('.');
      return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : childId;
    }
    case 'session': {
      const parts = childId.split('.');
      return parts.length >= 3 ? `${parts[0]}.${parts[1]}.${parts[2]}` : childId;
    }
    default:
      return childId;
  }
}

/**
 * Build branch chain from root to target. Tiers with getBranchName() === null are skipped.
 * Under feature-only branching, the chain is typically a single feature link.
 */
export function buildBranchChain(
  config: TierConfig,
  tierId: string,
  context: WorkflowCommandContext
): BranchChainLink[] {
  const chain: BranchChainLink[] = [];
  let currentTier: TierName | null = config.name;
  let currentId = tierId;

  while (currentTier) {
    const tierConfig = getConfigForTier(currentTier);
    const branchName = tierConfig.getBranchName(context, currentId);
    const parentBranchName = tierConfig.getParentBranchName(context, currentId);

    if (branchName) {
      chain.unshift({
        tier: currentTier,
        branchName,
        parentBranchName,
        isRoot: parentBranchName !== null && isRootBranch(parentBranchName),
      });
    }

    const parentTier = tierUp(currentTier);
    if (parentTier) {
      currentId = resolveParentId(parentTier, currentId, context);
    }
    currentTier = parentTier;
  }

  return chain;
}

/**
 * Tier that owns the leaf git branch for this workflow. With feature-only branches, this is almost always `feature` when any branch exists.
 */
export function getLeafBranchTierFromChain(
  config: TierConfig,
  tierId: string,
  context: WorkflowCommandContext
): TierName | null {
  const chain = buildBranchChain(config, tierId, context);
  if (chain.length === 0) return null;
  return chain[chain.length - 1].tier;
}
