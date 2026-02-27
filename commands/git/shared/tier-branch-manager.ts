/**
 * Tier Branch Manager
 *
 * Generic git branch operations for any tier, using tierUp/tierDown
 * and the config registry to walk the branch hierarchy.
 *
 * Replaces ~400 lines of duplicated inline branch logic across
 * feature-start, phase-start, session-start, session-end, phase-end, and tier-reopen.
 */

import type { TierConfig, TierName } from '../../tiers/shared/types';
import type { WorkflowCommandContext } from '../../utils/command-context';
import { tierUp } from '../../utils/tier-navigation';
import { getConfigForTier } from '../../tiers/configs/index';
import { getCurrentBranch, branchExists, isBranchBasedOn, runCommand } from '../../utils/utils';
import { createBranch } from '../atomic/create-branch';
import { gitMerge } from '../atomic/merge';
import { gitPush } from '../atomic/push';
import { readTierScope } from '../../utils/tier-scope';

// ─── Types ───────────────────────────────────────────────────────────

export interface BranchChainLink {
  tier: TierName;
  branchName: string;
  parentBranchName: string | null;
  isRoot: boolean;
}

export interface EnsureTierBranchResult {
  success: boolean;
  messages: string[];
  finalBranch: string;
  chain: BranchChainLink[];
}

export interface MergeTierBranchResult {
  success: boolean;
  messages: string[];
  mergedInto: string;
  deletedBranch: boolean;
}

export interface ScopeCoherenceResult {
  coherent: boolean;
  configFeature: string;
  branchFeature: string | null;
  message: string;
}

/** @deprecated Use checkScopeCoherence and ScopeCoherenceResult. */
export type FeatureCoherenceResult = ScopeCoherenceResult;

// ─── Internals ───────────────────────────────────────────────────────

const ROOT_BRANCH_NAMES = ['develop', 'main', 'master'];

function isRootBranch(branchName: string): boolean {
  return ROOT_BRANCH_NAMES.includes(branchName);
}

/**
 * Resolve the identifier the parent tier needs for getBranchName.
 *
 * Session (3.6.1) -> parent is phase -> needs phase id "3.6"
 * Phase (3.6) -> parent is feature -> needs feature name "calendar-appointment-availability"
 * Feature -> parent is root -> needs nothing
 */
function resolveParentId(
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
 * Build the full branch ancestry chain from root (develop) down to the target tier.
 * Walks tierUp() recursively, collecting each tier's branch name.
 * Tiers with getBranchName() = null (task) are skipped.
 */
export function buildBranchChain(
  config: TierConfig,
  tierId: string,
  context: WorkflowCommandContext
): BranchChainLink[] {
  const chain: BranchChainLink[] = [];

  // Collect from target up to root
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

    // Walk up
    const parentTier = tierUp(currentTier);
    if (parentTier) {
      currentId = resolveParentId(parentTier, currentId, context);
    }
    currentTier = parentTier;
  }

  return chain;
}

// ─── Scope Coherence ──────────────────────────────────────────────────

/**
 * Verify .tier-scope feature matches the feature the command is operating on.
 * Call before any branch operations to catch mismatches early.
 */
export async function checkScopeCoherence(
  context: WorkflowCommandContext
): Promise<ScopeCoherenceResult> {
  const commandFeature = context.feature.name;
  try {
    const scopeConfig = await readTierScope();
    const detectedFeature = scopeConfig.feature?.id ?? null;

    if (detectedFeature !== null && detectedFeature !== commandFeature) {
      return {
        coherent: false,
        configFeature: commandFeature,
        branchFeature: detectedFeature,
        message:
          `Feature mismatch: .tier-scope indicates "${detectedFeature}" ` +
          `but this command is operating on "${commandFeature}". ` +
          `Update .project-manager/.tier-scope or switch branches before proceeding.`,
      };
    }

    return {
      coherent: true,
      configFeature: commandFeature,
      branchFeature: detectedFeature,
      message: `Scope coherence verified: ${commandFeature}`,
    };
  } catch {
    return {
      coherent: true,
      configFeature: commandFeature,
      branchFeature: null,
      message: 'Could not read tier scope; proceeding with command feature.',
    };
  }
}

// ─── ensureTierBranch (for start commands) ───────────────────────────

/**
 * Ensure the correct branch exists and is checked out for a tier-start.
 *
 * Algorithm:
 * 1. Check feature coherence (.current-feature vs command feature)
 * 2. Build the branch chain from root to target
 * 3. Walk top-down:
 *    a. For root branch (develop/main): verify exists, optionally pull
 *    b. For each ancestor: verify exists, verify based-on parent, checkout
 *    c. For target (leaf): create if missing, or switch if exists
 * 4. Return result with messages for output
 *
 * Feature-start is special: root branch gets pulled, then feature branch is created.
 * Phase/session/task start: ancestors are verified and checked out, target is created/switched.
 */
export async function ensureTierBranch(
  config: TierConfig,
  tierId: string,
  context: WorkflowCommandContext,
  options?: {
    pullRoot?: boolean;        // pull latest from root branch (feature-start only)
    createIfMissing?: boolean; // create target branch if it doesn't exist (default: true)
  }
): Promise<EnsureTierBranchResult> {
  const messages: string[] = [];
  const createIfMissing = options?.createIfMissing ?? true;
  const pullRoot = options?.pullRoot ?? false;

  // Step 0: Feature coherence
  const coherence = await checkScopeCoherence(context);
  if (!coherence.coherent) {
    return {
      success: false,
      messages: [coherence.message],
      finalBranch: await getCurrentBranch(),
      chain: [],
    };
  }

  // Step 1: Build chain
  const chain = buildBranchChain(config, tierId, context);
  if (chain.length === 0) {
    // Tier has no branch (e.g. task) - nothing to do
    return {
      success: true,
      messages: ['Tier has no branch; inheriting current branch.'],
      finalBranch: await getCurrentBranch(),
      chain,
    };
  }

  const targetLink = chain[chain.length - 1];

  // Step 2: Walk ancestors (everything except the last = target)
  for (let i = 0; i < chain.length - 1; i++) {
    const link = chain[i];
    const parentBranch = link.parentBranchName;

    // Root branch handling (develop/main)
    if (link.isRoot && parentBranch) {
      const rootExists = await branchExists(parentBranch);
      if (!rootExists) {
        const altRoot = parentBranch === 'develop'
          ? ((await branchExists('main')) ? 'main' : 'master')
          : parentBranch;
        if (!(await branchExists(altRoot))) {
          messages.push(`Root branch ${parentBranch} does not exist.`);
          return { success: false, messages, finalBranch: await getCurrentBranch(), chain };
        }
        messages.push(`Root branch ${parentBranch} not found; using ${altRoot}.`);
      }
      if (pullRoot) {
        const pullResult = await runCommand(`git checkout ${parentBranch} && git pull origin ${parentBranch}`);
        if (pullResult.success) {
          messages.push(`Pulled latest ${parentBranch}.`);
        } else {
          messages.push(`Warning: could not pull ${parentBranch}: ${pullResult.error || pullResult.output}`);
        }
      }
    }

    // Verify ancestor branch exists
    if (!(await branchExists(link.branchName))) {
      messages.push(
        `Ancestor branch ${link.branchName} (${link.tier}) does not exist. ` +
        `Run /${link.tier}-start to create it first.`
      );
      return { success: false, messages, finalBranch: await getCurrentBranch(), chain };
    }

    // Verify ancestor is based on its parent (if parent is known and exists)
    if (parentBranch && !isRootBranch(parentBranch) && (await branchExists(parentBranch))) {
      const isBasedOn = await isBranchBasedOn(link.branchName, parentBranch);
      if (!isBasedOn) {
        messages.push(
          `Branch ${link.branchName} (${link.tier}) is not based on ${parentBranch}. ` +
          `You may need to rebase: git rebase ${parentBranch}`
        );
        return { success: false, messages, finalBranch: await getCurrentBranch(), chain };
      }
    }

    // Checkout ancestor (needed so we can create/verify next level from correct base)
    const currentBranch = await getCurrentBranch();
    if (currentBranch !== link.branchName) {
      const checkoutResult = await runCommand(`git checkout ${link.branchName}`);
      if (!checkoutResult.success) {
        messages.push(`Could not checkout ${link.tier} branch ${link.branchName}: ${checkoutResult.error || checkoutResult.output}`);
        return { success: false, messages, finalBranch: currentBranch, chain };
      }
      messages.push(`Checked out ${link.tier} branch: ${link.branchName}`);
    }
  }

  // Step 3: Handle target branch (the leaf)
  const parentOfTarget = chain.length >= 2 ? chain[chain.length - 2].branchName : targetLink.parentBranchName;

  // Ensure we're on the parent before create/switch
  if (parentOfTarget) {
    const currentBranch = await getCurrentBranch();
    if (currentBranch !== parentOfTarget) {
      const checkoutParent = await runCommand(`git checkout ${parentOfTarget}`);
      if (!checkoutParent.success) {
        messages.push(`Could not checkout parent branch ${parentOfTarget} before creating target: ${checkoutParent.error || checkoutParent.output}`);
        return { success: false, messages, finalBranch: currentBranch, chain };
      }
    }
    // Feature-start: pull latest from root before creating feature branch
    if (pullRoot && isRootBranch(parentOfTarget)) {
      const pullResult = await runCommand(`git pull origin ${parentOfTarget}`);
      if (pullResult.success) {
        messages.push(`Pulled latest ${parentOfTarget}.`);
      } else {
        messages.push(`Warning: could not pull ${parentOfTarget}: ${pullResult.error || pullResult.output}`);
      }
    }
  }

  if (await branchExists(targetLink.branchName)) {
    // Target exists - verify based-on parent, then switch
    if (parentOfTarget && (await branchExists(parentOfTarget)) && !isRootBranch(parentOfTarget)) {
      const isBasedOn = await isBranchBasedOn(targetLink.branchName, parentOfTarget);
      if (!isBasedOn) {
        messages.push(
          `Target branch ${targetLink.branchName} exists but is not based on ${parentOfTarget}. ` +
          `Delete and recreate, or rebase: git rebase ${parentOfTarget}`
        );
        return { success: false, messages, finalBranch: await getCurrentBranch(), chain };
      }
    }
    const checkoutTarget = await runCommand(`git checkout ${targetLink.branchName}`);
    if (!checkoutTarget.success) {
      messages.push(`Could not switch to existing branch ${targetLink.branchName}: ${checkoutTarget.error || checkoutTarget.output}`);
      return { success: false, messages, finalBranch: await getCurrentBranch(), chain };
    }
    messages.push(`Switched to existing ${targetLink.tier} branch: ${targetLink.branchName}`);
  } else if (createIfMissing) {
    // Target does not exist - create from current (parent) branch
    const result = await createBranch(targetLink.branchName);
    if (!result.success) {
      messages.push(`Could not create ${targetLink.tier} branch ${targetLink.branchName}: ${result.output}`);
      return { success: false, messages, finalBranch: await getCurrentBranch(), chain };
    }
    messages.push(`Created ${targetLink.tier} branch: ${targetLink.branchName}`);

    // Post-create verification
    if (parentOfTarget && (await branchExists(parentOfTarget)) && !isRootBranch(parentOfTarget)) {
      const isBasedOn = await isBranchBasedOn(targetLink.branchName, parentOfTarget);
      if (!isBasedOn) {
        messages.push(`Warning: ${targetLink.branchName} created but based-on verification failed. Verify branch hierarchy manually.`);
      }
    }
  } else {
    messages.push(`Target branch ${targetLink.branchName} does not exist and createIfMissing is false.`);
    return { success: false, messages, finalBranch: await getCurrentBranch(), chain };
  }

  return {
    success: true,
    messages,
    finalBranch: targetLink.branchName,
    chain,
  };
}

// ─── mergeTierBranch (for end commands) ──────────────────────────────

/**
 * Merge a tier's branch into its parent branch.
 * Used by session-end (merge session -> phase) and phase-end (merge phase -> feature).
 *
 * Algorithm:
 * 1. Resolve tier branch and parent branch from config
 * 2. Verify we're on the tier branch (or can checkout to it)
 * 3. Merge tier branch into parent via gitMerge
 * 4. Optionally delete the tier branch after merge
 * 5. Optionally push the parent branch
 */
export async function mergeTierBranch(
  config: TierConfig,
  tierId: string,
  context: WorkflowCommandContext,
  options?: {
    deleteBranch?: boolean; // delete tier branch after merge (default: true)
    push?: boolean;         // push parent branch after merge (default: false)
  }
): Promise<MergeTierBranchResult> {
  const messages: string[] = [];
  const deleteBranch = options?.deleteBranch ?? true;
  const shouldPush = options?.push ?? false;

  const tierBranch = config.getBranchName(context, tierId);
  const parentBranch = config.getParentBranchName(context, tierId);

  if (!tierBranch) {
    return { success: true, messages: ['Tier has no branch; skip merge.'], mergedInto: '', deletedBranch: false };
  }
  if (!parentBranch) {
    return { success: false, messages: [`No parent branch defined for ${config.name} tier.`], mergedInto: '', deletedBranch: false };
  }

  // Verify on correct branch
  const currentBranch = await getCurrentBranch();
  if (currentBranch !== tierBranch && !currentBranch.endsWith(tierBranch)) {
    messages.push(`Not on ${config.name} branch (current: ${currentBranch}). Skipping merge.`);
    return { success: true, messages, mergedInto: '', deletedBranch: false };
  }

  // Merge
  const mergeResult = await gitMerge({ sourceBranch: tierBranch, targetBranch: parentBranch });
  if (!mergeResult.success) {
    messages.push(`Merge ${tierBranch} into ${parentBranch} failed: ${mergeResult.output}`);
    messages.push(`Manual recovery: git checkout ${parentBranch} && git merge ${tierBranch}`);
    return { success: false, messages, mergedInto: parentBranch, deletedBranch: false };
  }
  messages.push(`Merged ${tierBranch} into ${parentBranch}.`);

  // Delete
  let deleted = false;
  if (deleteBranch) {
    const deleteResult = await runCommand(`git branch -d ${tierBranch}`);
    deleted = deleteResult.success;
    messages.push(deleted
      ? `Deleted branch: ${tierBranch}`
      : `Could not delete branch (non-critical): ${deleteResult.error || deleteResult.output}`
    );
  }

  // Push
  if (shouldPush) {
    const pushResult = await gitPush();
    messages.push(pushResult.success
      ? `Pushed ${parentBranch} to remote.`
      : `Push failed (non-critical): ${pushResult.output}`
    );
  }

  return { success: true, messages, mergedInto: parentBranch, deletedBranch: deleted };
}

// ─── formatBranchHierarchyFromConfig ─────────────────────────────────

/**
 * Build the branch hierarchy display string using the config chain
 * instead of hardcoded branch name patterns.
 * Replaces formatBranchHierarchy in tier-start-utils.ts.
 */
export async function formatBranchHierarchyFromConfig(
  config: TierConfig,
  tierId: string,
  context: WorkflowCommandContext
): Promise<string> {
  const chain = buildBranchChain(config, tierId, context);
  const currentBranch = await getCurrentBranch();

  const lines: string[] = ['## Branch Hierarchy Verification\n', '```'];

  // Root
  const rootBranch = chain.length > 0 && chain[0].parentBranchName
    ? chain[0].parentBranchName
    : ((await branchExists('develop')) ? 'develop' : 'main');
  lines.push(rootBranch);

  // Chain
  chain.forEach((link, idx) => {
    const indent = '  '.repeat(idx + 1) + '└── ';
    const target = idx === chain.length - 1 ? ' (target)' : '';
    lines.push(`${indent}${link.branchName}${target}`);
  });

  lines.push('```');
  lines.push(`\n**Current Branch:** \`${currentBranch}\``);

  if (chain.length > 0) {
    const target = chain[chain.length - 1];
    lines.push(`\n**Target ${target.tier} Branch:** \`${target.branchName}\``);
  }

  return lines.join('\n');
}
