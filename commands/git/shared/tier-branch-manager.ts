/**
 * Feature-centric git branch orchestration for tier workflows.
 * Phase/session/task tiers do not own branches; all work uses `feature/<name>`.
 */

import type { TierConfig } from '../../tiers/shared/types';
import type { WorkflowCommandContext } from '../../utils/command-context';
import {
  getCurrentBranch,
  branchExists,
  isBranchBasedOn,
  runGitCommand,
  warnGitOp,
  compareBranchToRemote,
} from './git-logger';
import { createBranch } from '../atomic/create-branch';
import { gitMerge } from '../atomic/merge';
import { gitPush } from '../atomic/push';
import {
  buildBranchChain,
  getLeafBranchTierFromChain,
  isRootBranch,
  resolveParentId,
} from './branch-planner';
import type {
  EnsureTierBranchResult,
  EnsureTierBranchOptions,
  MergeTierBranchResult,
  MergeChildBranchesResult,
  ScopeCoherenceResult,
  SubmoduleCursorMode,
} from './git-contract';
import {
  parsePortcelainEntries,
  isUnmergedStatus,
  isNeverCommitPath,
  commitUncommittedNonCursor,
  resolveUncommittedForCheckout,
  recoverFromFailedStashPop,
} from './working-tree-policy';
import { shouldAutoPushNewFeatureBranch } from './publish-policy';
import { recordGitFriction } from './git-friction-log';

export type {
  BranchChainLink,
  EnsureTierBranchResult,
  EnsureTierBranchOptions,
  MergeTierBranchResult,
  MergeChildBranchesResult,
  CommitUncommittedOptions,
  ScopeCoherenceResult,
  SubmoduleCursorMode,
} from './git-contract';

export {
  isAutoCommittable,
  isNeverCommitPath,
  DEFAULT_ALLOWED_COMMIT_PREFIXES,
} from './working-tree-policy';

export { buildBranchChain, getLeafBranchTierFromChain, resolveParentId };

async function branchNameSnapshot(): Promise<string> {
  return (await getCurrentBranch()) ?? '';
}

async function listBranchesByPrefix(prefix: string): Promise<string[]> {
  const pattern = `${prefix}*`;
  const result = await runGitCommand(`git branch --list "${pattern}"`, 'listBranchesByPrefix');
  if (!result.success || !result.output.trim()) return [];
  return result.output
    .split('\n')
    .map((line) => line.replace(/^\*\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Sync the `.cursor` git submodule from the git layer only (tier-start).
 * `parent`: match parent-recorded gitlink; `remote`: may advance submodule HEAD and dirty the parent.
 */
export async function syncCursorSubmodule(
  mode: SubmoduleCursorMode,
  frictionContext: { tier: string; tierId: string; featureName: string }
): Promise<{ success: boolean; messages: string[] }> {
  if (mode === 'off') {
    return { success: true, messages: [] };
  }

  const syncResult = await runGitCommand('git submodule sync .cursor', 'syncCursorSubmodule-sync');
  if (!syncResult.success) {
    const msg = `git submodule sync .cursor failed: ${syncResult.error || syncResult.output}`;
    recordGitFriction({
      step: 'syncCursorSubmodule-sync',
      tier: frictionContext.tier,
      tierId: frictionContext.tierId,
      featureName: frictionContext.featureName,
      reasonCode: 'submodule_sync_failed',
      stderrExcerpt: (syncResult.error || syncResult.output).slice(0, 500),
      disposition: 'blocked',
      notes: msg,
    });
    return { success: false, messages: [msg] };
  }

  const updateCmd =
    mode === 'parent' ? 'git submodule update --init .cursor' : 'git submodule update --init --remote .cursor';
  const opLabel =
    mode === 'parent' ? 'syncCursorSubmodule-update-parent' : 'syncCursorSubmodule-update-remote';
  const updateResult = await runGitCommand(updateCmd, opLabel);
  if (!updateResult.success) {
    const msg = `${updateCmd} failed: ${updateResult.error || updateResult.output}`;
    recordGitFriction({
      step: opLabel,
      tier: frictionContext.tier,
      tierId: frictionContext.tierId,
      featureName: frictionContext.featureName,
      reasonCode: 'submodule_update_failed',
      stderrExcerpt: (updateResult.error || updateResult.output).slice(0, 500),
      disposition: 'blocked',
      notes: msg,
    });
    return { success: false, messages: [msg] };
  }

  const ok =
    mode === 'parent'
      ? 'Synced .cursor submodule to parent gitlink (submodule sync + update --init).'
      : 'Updated .cursor submodule with --init --remote (submodule HEAD may have advanced; parent repo may show a gitlink change — review `git status`).';
  return { success: true, messages: [ok] };
}

export async function checkScopeCoherence(context: WorkflowCommandContext): Promise<ScopeCoherenceResult> {
  const commandFeature = context.feature.name;
  return {
    coherent: true,
    configFeature: commandFeature,
    branchFeature: null,
    message: `Scope derived from context: ${commandFeature}`,
  };
}

export async function getExpectedBranchForTier(
  config: TierConfig,
  tierId: string,
  context: WorkflowCommandContext
): Promise<string | null> {
  const chain = buildBranchChain(config, tierId, context);
  if (chain.length === 0) return null;
  let branchName = chain[chain.length - 1].branchName;
  if (!(await branchExists(branchName))) {
    const prefixMatches = await listBranchesByPrefix(branchName);
    if (prefixMatches.length > 1) {
      return null;
    }
    if (prefixMatches.length === 1) {
      branchName = prefixMatches[0];
    }
  }
  return branchName;
}

/**
 * Ensure the feature branch exists and is checked out. Phase/session/task resolves to the same feature branch.
 * No automatic rebases; no push on branch creation (local-first).
 */
export async function ensureTierBranch(
  config: TierConfig,
  tierId: string,
  context: WorkflowCommandContext,
  options?: EnsureTierBranchOptions
): Promise<EnsureTierBranchResult> {
  const messages: string[] = [];
  const createIfMissing = options?.createIfMissing ?? true;
  const pullRoot = options?.pullRoot ?? false;
  const syncRemote = options?.syncRemote ?? false;

  const branchUnknown = await getCurrentBranch();
  if (branchUnknown === null) {
    const msg = 'Cannot determine current git branch (detached HEAD or not a git repository).';
    recordGitFriction({
      step: 'ensureTierBranch',
      tier: config.name,
      tierId,
      featureName: context.feature.name,
      currentBranch: null,
      reasonCode: 'current_branch_unknown',
      disposition: 'blocked',
      notes: msg,
    });
    return { success: false, messages: [msg], finalBranch: '', chain: [] };
  }

  const coherence = await checkScopeCoherence(context);
  if (!coherence.coherent) {
    return {
      success: false,
      messages: [coherence.message],
      finalBranch: branchUnknown,
      chain: [],
    };
  }

  const chain = buildBranchChain(config, tierId, context);
  if (chain.length === 0) {
    return {
      success: true,
      messages: ['Tier has no dedicated branch; continuing on current branch.'],
      finalBranch: branchUnknown,
      chain,
    };
  }

  const targetLink = chain[chain.length - 1];
  if (!(await branchExists(targetLink.branchName))) {
    const prefixMatches = await listBranchesByPrefix(targetLink.branchName);
    if (prefixMatches.length === 1) {
      targetLink.branchName = prefixMatches[0];
    } else if (prefixMatches.length > 1) {
      messages.push(
        `Ambiguous target branches for ${targetLink.branchName}: ${prefixMatches.join(', ')}. Resolve to one local branch before tier-start.`
      );
      recordGitFriction({
        step: 'ensureTierBranch',
        tier: config.name,
        tierId,
        featureName: context.feature.name,
        currentBranch: branchUnknown,
        reasonCode: 'ambiguous_branch_prefix',
        disposition: 'blocked',
        notes: messages[0],
      });
      return { success: false, messages, finalBranch: branchUnknown, chain };
    }
  }
  const targetBranch = targetLink.branchName;

  const uncommitted = await resolveUncommittedForCheckout(targetBranch);
  const autoCommittedPaths = uncommitted.autoCommittedPaths;
  const needStashPop = uncommitted.clean && uncommitted.stashedWorkflowArtifacts === true;
  if (needStashPop && uncommitted.message) {
    messages.push(uncommitted.message);
  }
  if (!uncommitted.clean) {
    return {
      success: false,
      messages: [
        ...messages,
        uncommitted.message,
        'Branch checkout blocked by uncommitted changes on this branch.',
      ],
      finalBranch: (await getCurrentBranch()) ?? branchUnknown,
      chain: [],
      blockedByUncommitted: true,
      uncommittedFiles: uncommitted.blockingFiles,
    };
  }

  for (let i = 0; i < chain.length - 1; i++) {
    const link = chain[i];
    const parentBranch = link.parentBranchName;

    if (link.isRoot && parentBranch) {
      if (!(await branchExists(parentBranch))) {
        messages.push(
          `Root branch ${parentBranch} does not exist locally. Fetch it or align tier config with your default branch.`
        );
        return { success: false, messages, finalBranch: await branchNameSnapshot(), chain };
      }
      if (pullRoot) {
        const pullResult = await runGitCommand(
          `git checkout ${parentBranch} && git pull origin ${parentBranch}`,
          'ensureTierBranch-pullRoot'
        );
        if (!pullResult.success) {
          messages.push(`Failed to pull root ${parentBranch}: ${pullResult.error || pullResult.output}`);
          recordGitFriction({
            step: 'ensureTierBranch-pullRoot',
            tier: config.name,
            tierId,
            featureName: context.feature.name,
            reasonCode: 'pull_root_failed',
            stderrExcerpt: pullResult.error || pullResult.output,
            disposition: 'blocked',
          });
          return { success: false, messages, finalBranch: await branchNameSnapshot(), chain };
        }
        messages.push(`Pulled latest ${parentBranch}.`);
      }
    }

    let ancestorBranch = link.branchName;
    if (!(await branchExists(ancestorBranch))) {
      const prefixMatches = await listBranchesByPrefix(link.branchName);
      if (prefixMatches.length === 1) {
        ancestorBranch = prefixMatches[0];
        link.branchName = ancestorBranch;
      } else if (prefixMatches.length > 1) {
        messages.push(
          `Ambiguous ancestor branches for ${link.branchName}: ${prefixMatches.join(', ')}. Resolve before tier-start.`
        );
        return { success: false, messages, finalBranch: await branchNameSnapshot(), chain };
      } else {
        messages.push(
          `Ancestor branch ${link.branchName} (${link.tier}) does not exist. Start the feature tier first.`
        );
        return { success: false, messages, finalBranch: await branchNameSnapshot(), chain };
      }
    }

    const resolvedParent = i > 0 ? chain[i - 1].branchName : parentBranch;
    if (resolvedParent && !isRootBranch(resolvedParent) && (await branchExists(resolvedParent))) {
      const based = await isBranchBasedOn(link.branchName, resolvedParent);
      if (!based) {
        const hint = `Branch ${link.branchName} is not based on ${resolvedParent}. Rebase or merge onto the parent, then retry (e.g. git checkout ${link.branchName} && git rebase ${resolvedParent}).`;
        messages.push(hint);
        recordGitFriction({
          step: 'ensureTierBranch-ancestry',
          tier: config.name,
          tierId,
          featureName: context.feature.name,
          reasonCode: 'branch_not_based_on_parent',
          disposition: 'blocked',
          notes: hint,
        });
        return { success: false, messages, finalBranch: await branchNameSnapshot(), chain };
      }
    }

    const cur = await getCurrentBranch();
    if (cur !== link.branchName) {
      const checkoutResult = await runGitCommand(`git checkout ${link.branchName}`, 'ensureTierBranch-checkout-ancestor');
      if (!checkoutResult.success) {
        messages.push(
          `Could not checkout ${link.tier} branch ${link.branchName}: ${checkoutResult.error || checkoutResult.output}`
        );
        return { success: false, messages, finalBranch: cur ?? '', chain };
      }
      messages.push(`Checked out ${link.tier} branch: ${link.branchName}`);
    }
    if (syncRemote && !link.isRoot) {
      const relation = await compareBranchToRemote(link.branchName);
      if (relation === 'no-remote') {
        messages.push(`No remote ref origin/${link.branchName} (or local branch missing); skipped sync.`);
      } else if (relation === 'behind') {
        const pullResult = await runGitCommand(
          `git merge --ff-only origin/${link.branchName}`,
          'ensureTierBranch-pullAncestor-ffonly'
        );
        if (!pullResult.success) {
          messages.push(`Failed to fast-forward ${link.branchName}: ${pullResult.error || pullResult.output}`);
          return { success: false, messages, finalBranch: await branchNameSnapshot(), chain };
        }
        messages.push(`Fast-forwarded ${link.branchName} from origin.`);
      } else if (relation === 'ahead') {
        messages.push(`${link.branchName} is ahead of origin; skipped pull (push when ready).`);
      } else if (relation === 'up-to-date') {
        messages.push(`${link.branchName} is up to date with origin.`);
      } else {
        const hint = `Local ${link.branchName} and origin/${link.branchName} have diverged. Resolve manually, then retry.`;
        messages.push(hint);
        recordGitFriction({
          step: 'ensureTierBranch-remote',
          tier: config.name,
          tierId,
          reasonCode: 'diverged_from_remote',
          disposition: 'blocked',
          notes: hint,
        });
        return { success: false, messages, finalBranch: await branchNameSnapshot(), chain };
      }
    }
  }

  const parentOfTarget = chain.length >= 2 ? chain[chain.length - 2].branchName : targetLink.parentBranchName;

  if (parentOfTarget) {
    const cur = await getCurrentBranch();
    if (cur !== parentOfTarget) {
      const checkoutParent = await runGitCommand(`git checkout ${parentOfTarget}`, 'ensureTierBranch-checkout-parent');
      if (!checkoutParent.success) {
        messages.push(
          `Could not checkout parent branch ${parentOfTarget} before creating target: ${checkoutParent.error || checkoutParent.output}`
        );
        return { success: false, messages, finalBranch: cur ?? '', chain };
      }
    }
    if (pullRoot && isRootBranch(parentOfTarget)) {
      const pullResult = await runGitCommand(`git pull origin ${parentOfTarget}`, 'ensureTierBranch-pull');
      if (!pullResult.success) {
        messages.push(`Failed to pull ${parentOfTarget}: ${pullResult.error || pullResult.output}`);
        return { success: false, messages, finalBranch: await branchNameSnapshot(), chain };
      }
      messages.push(`Pulled latest ${parentOfTarget}.`);
    }
    if (syncRemote && !isRootBranch(parentOfTarget) && (await branchExists(parentOfTarget))) {
      const rel = await compareBranchToRemote(parentOfTarget);
      if (rel === 'behind') {
        const pullResult = await runGitCommand(
          `git merge --ff-only origin/${parentOfTarget}`,
          'ensureTierBranch-pullParentBeforeLeaf-ffonly'
        );
        if (!pullResult.success) {
          messages.push(`Failed to fast-forward tier-up ${parentOfTarget}: ${pullResult.error || pullResult.output}`);
          return { success: false, messages, finalBranch: await branchNameSnapshot(), chain };
        }
        messages.push(`Fast-forwarded tier-up branch ${parentOfTarget} from origin.`);
      } else if (rel === 'no-remote') {
        messages.push(`No origin/${parentOfTarget}; skipped tier-up sync.`);
      } else {
        messages.push(`Skipped pull for tier-up ${parentOfTarget} (${rel} vs origin).`);
      }
    }
  }

  if (await branchExists(targetLink.branchName)) {
    const checkoutTarget = await runGitCommand(`git checkout ${targetLink.branchName}`, 'ensureTierBranch-checkout-target');
    if (!checkoutTarget.success) {
      messages.push(
        `Could not switch to existing branch ${targetLink.branchName}: ${checkoutTarget.error || checkoutTarget.output}`
      );
      return { success: false, messages, finalBranch: await branchNameSnapshot(), chain };
    }
    messages.push(`Switched to existing ${targetLink.tier} branch: ${targetLink.branchName}`);

    if (syncRemote) {
      const rel = await compareBranchToRemote(targetLink.branchName);
      if (rel === 'no-remote') {
        messages.push(`No remote ref for ${targetLink.branchName} yet; continuing locally only (push when you publish).`);
      } else if (rel === 'behind') {
        const pullTarget = await runGitCommand(
          `git merge --ff-only origin/${targetLink.branchName}`,
          'ensureTierBranch-pullTarget-ffonly'
        );
        if (!pullTarget.success) {
          messages.push(`Failed to fast-forward ${targetLink.branchName}: ${pullTarget.error || pullTarget.output}`);
          return { success: false, messages, finalBranch: await branchNameSnapshot(), chain };
        }
        messages.push(`Fast-forwarded ${targetLink.branchName} from origin.`);
      } else {
        messages.push(`Skipped origin sync for leaf ${targetLink.branchName} (${rel} vs origin).`);
      }
    }

    if (parentOfTarget && (await branchExists(parentOfTarget)) && !isRootBranch(parentOfTarget)) {
      const isBasedOn = await isBranchBasedOn(targetLink.branchName, parentOfTarget);
      if (!isBasedOn) {
        const hint = `Branch ${targetLink.branchName} is not based on ${parentOfTarget}. Rebase onto parent locally, then retry tier-start.`;
        messages.push(hint);
        recordGitFriction({
          step: 'ensureTierBranch-target-ancestry',
          tier: config.name,
          tierId,
          reasonCode: 'branch_not_based_on_parent',
          disposition: 'blocked',
          notes: hint,
        });
        return { success: false, messages, finalBranch: await branchNameSnapshot(), chain };
      }
    }
  } else if (createIfMissing) {
    const result = await createBranch(targetLink.branchName);
    if (!result.success) {
      messages.push(`Could not create ${targetLink.tier} branch ${targetLink.branchName}: ${result.output}`);
      return { success: false, messages, finalBranch: await branchNameSnapshot(), chain };
    }
    messages.push(`Created ${targetLink.tier} branch: ${targetLink.branchName} (local only; push when you publish).`);

    if (shouldAutoPushNewFeatureBranch()) {
      const pushNew = await runGitCommand(`git push -u origin ${targetLink.branchName}`, 'ensureTierBranch-pushNewBranch');
      if (!pushNew.success) {
        messages.push(`Failed to push new branch to remote: ${pushNew.error || pushNew.output}`);
        return { success: false, messages, finalBranch: await branchNameSnapshot(), chain };
      }
      messages.push(`Pushed new branch ${targetLink.branchName} to remote.`);
    }

    if (parentOfTarget && (await branchExists(parentOfTarget)) && !isRootBranch(parentOfTarget)) {
      const isBasedOn = await isBranchBasedOn(targetLink.branchName, parentOfTarget);
      if (!isBasedOn) {
        messages.push(
          `${targetLink.branchName} was created but is not based on ${parentOfTarget}. Fix branch base and retry tier-start.`
        );
        return { success: false, messages, finalBranch: await branchNameSnapshot(), chain };
      }
    }
  } else {
    messages.push(`Target branch ${targetLink.branchName} does not exist and createIfMissing is false.`);
    return { success: false, messages, finalBranch: await branchNameSnapshot(), chain };
  }

  if (needStashPop) {
    const popResult = await runGitCommand('git stash pop', 'ensureTierBranch-stash-pop');
    if (popResult.success) {
      messages.push(
        'Restored stashed workflow artifacts (.cursor, .project-manager, audit reports) on current branch.'
      );
    } else {
      const recovery = await recoverFromFailedStashPop('ensureTierBranch');
      messages.push(`Stash pop conflicted after branch switch. ${recovery.detail}`);
      recordGitFriction({
        step: 'ensureTierBranch-stash-pop',
        tier: config.name,
        tierId,
        disposition: 'recovered',
        stderrExcerpt: popResult.error || popResult.output,
        notes: recovery.detail,
      });
    }
  }

  const submoduleMode = options?.submoduleCursor ?? 'off';
  if (submoduleMode !== 'off') {
    const sub = await syncCursorSubmodule(submoduleMode, {
      tier: config.name,
      tierId,
      featureName: context.feature.name,
    });
    messages.push(...sub.messages);
    if (!sub.success) {
      return {
        success: false,
        messages,
        finalBranch: targetLink.branchName,
        chain,
        autoCommittedPaths,
      };
    }
  }

  return {
    success: true,
    messages,
    finalBranch: targetLink.branchName,
    chain,
    autoCommittedPaths,
  };
}

export async function mergeTierBranch(
  config: TierConfig,
  tierId: string,
  context: WorkflowCommandContext,
  options?: {
    deleteBranch?: boolean;
    push?: boolean;
    auditPrewarmPromise?: Promise<void>;
    syncRemote?: boolean;
  }
): Promise<MergeTierBranchResult> {
  const messages: string[] = [];
  const deleteBranch = options?.deleteBranch ?? false;
  const shouldPush = options?.push ?? false;

  let tierBranch = config.getBranchName(context, tierId);
  let parentBranch = config.getParentBranchName(context, tierId);

  if (!tierBranch) {
    return { success: true, messages: ['Tier has no branch; skip merge.'], mergedInto: '', deletedBranch: false };
  }
  if (!parentBranch) {
    return {
      success: false,
      messages: [`No parent branch defined for ${config.name} tier.`],
      mergedInto: '',
      deletedBranch: false,
      reasonCode: 'no_parent_branch',
    };
  }

  if (deleteBranch && !shouldPush) {
    return {
      success: false,
      messages: [
        'deleteBranch requires push: true so the merged parent is on the remote before removing the child branch.',
      ],
      mergedInto: '',
      deletedBranch: false,
      reasonCode: 'invalid_merge_options',
    };
  }

  if (!(await branchExists(tierBranch))) {
    const tierMatches = await listBranchesByPrefix(tierBranch);
    if (tierMatches.length === 0) {
      recordGitFriction({
        step: 'mergeTierBranch',
        tier: config.name,
        tierId,
        reasonCode: 'tier_branch_not_found',
        disposition: 'blocked',
      });
      return {
        success: false,
        messages: [`No local branch matches tier branch prefix ${tierBranch}.`],
        mergedInto: '',
        deletedBranch: false,
        reasonCode: 'tier_branch_not_found',
      };
    }
    if (tierMatches.length > 1) {
      return {
        success: false,
        messages: [
          `Ambiguous tier branches for ${tierBranch}: ${tierMatches.join(', ')}. Resolve to a single branch before merge.`,
        ],
        mergedInto: '',
        deletedBranch: false,
        reasonCode: 'ambiguous_branch_prefix',
      };
    }
    tierBranch = tierMatches[0];
  }
  if (!isRootBranch(parentBranch) && !(await branchExists(parentBranch))) {
    const parentMatches = await listBranchesByPrefix(parentBranch);
    if (parentMatches.length === 0) {
      return {
        success: false,
        messages: [`Parent branch ${parentBranch} does not exist locally.`],
        mergedInto: '',
        deletedBranch: false,
        reasonCode: 'parent_branch_not_found',
      };
    }
    if (parentMatches.length > 1) {
      return {
        success: false,
        messages: [
          `Ambiguous parent branches for ${parentBranch}: ${parentMatches.join(', ')}. Resolve before merge.`,
        ],
        mergedInto: '',
        deletedBranch: false,
        reasonCode: 'ambiguous_branch_prefix',
      };
    }
    parentBranch = parentMatches[0];
  }

  const currentBranch = await getCurrentBranch();
  if (currentBranch !== tierBranch && !currentBranch?.startsWith(tierBranch + '-')) {
    messages.push(
      `Not on ${config.name} tier branch (expected ${tierBranch}, current: ${currentBranch ?? '(unknown)'}). Checkout the feature branch and re-run tier-end.`
    );
    recordGitFriction({
      step: 'mergeTierBranch',
      tier: config.name,
      tierId,
      currentBranch,
      expectedBranch: tierBranch,
      reasonCode: 'wrong_branch_before_merge',
      disposition: 'blocked',
    });
    return {
      success: false,
      messages,
      mergedInto: '',
      deletedBranch: false,
      reasonCode: 'wrong_branch_before_merge',
    };
  }

  if (options?.auditPrewarmPromise) {
    try {
      await options.auditPrewarmPromise;
      messages.push('Awaited audit prewarm before merge.');
    } catch (err) {
      messages.push(`Audit prewarm failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const preMergeStatus = await runGitCommand('git status --porcelain --ignore-submodules=dirty', 'mergeTierBranch-preStatus');
  if (preMergeStatus.success && preMergeStatus.output.trim()) {
    const preMergeEntries = parsePortcelainEntries(preMergeStatus.output);
    const unmergedPreMerge = preMergeEntries.filter((e) => isUnmergedStatus(e.xy));
    if (unmergedPreMerge.length > 0) {
      warnGitOp({
        timestamp: new Date().toISOString(),
        operation: 'mergeTierBranch-unmerged',
        command: 'git status --porcelain',
        success: true,
        output: `Skipping ${unmergedPreMerge.length} unmerged file(s) in pre-merge commit: ${unmergedPreMerge.map((e) => e.path).join(', ')}`,
      });
    }
    const pathsToStage = preMergeEntries
      .filter((e) => !isUnmergedStatus(e.xy))
      .map((e) => e.path)
      .filter((p) => !isNeverCommitPath(p));

    if (pathsToStage.length > 0) {
      for (const p of pathsToStage) {
        const safePath = p.replace(/'/g, "'\\''");
        await runGitCommand(`git add -- '${safePath}'`, 'mergeTierBranch-preAdd');
      }
      const safeMsg = `[${config.name} ${tierId}] pre-merge: all remaining artifacts`.replace(/'/g, "'\\''");
      const preMergeCommit = await runGitCommand(`git commit -m '${safeMsg}'`, 'mergeTierBranch-preCommit');
      if (preMergeCommit.success) {
        messages.push('Committed all remaining artifacts on tier branch before merge.');
      } else {
        messages.push(`Pre-merge commit failed: ${preMergeCommit.error || preMergeCommit.output}`);
        recordGitFriction({
          step: 'mergeTierBranch-preCommit',
          tier: config.name,
          tierId,
          reasonCode: 'pre_merge_commit_failed',
          stderrExcerpt: preMergeCommit.error || preMergeCommit.output,
          disposition: 'blocked',
        });
        return {
          success: false,
          messages,
          mergedInto: parentBranch,
          deletedBranch: false,
          reasonCode: 'pre_merge_commit_failed',
        };
      }
    }
  }

  const assertStatus = await runGitCommand('git status --porcelain --ignore-submodules=dirty', 'mergeTierBranch-assertClean');
  if (assertStatus.success && assertStatus.output.trim()) {
    warnGitOp({
      timestamp: new Date().toISOString(),
      operation: 'mergeTierBranch',
      command: 'assert clean',
      success: false,
      output: assertStatus.output.trim(),
      error: 'DIRTY_TREE_BEFORE_MERGE',
      context: `tier=${config.name} id=${tierId} branch=${tierBranch}`,
    });
    messages.push(`Working tree not clean before merge:\n${assertStatus.output.trim()}`);
    recordGitFriction({
      step: 'mergeTierBranch-dirty',
      tier: config.name,
      tierId,
      reasonCode: 'dirty_tree_before_merge',
      disposition: 'blocked',
    });
    return {
      success: false,
      messages,
      mergedInto: parentBranch,
      deletedBranch: false,
      reasonCode: 'dirty_tree_before_merge',
    };
  }

  const syncRemote = options?.syncRemote ?? true;
  const mergeResult = await gitMerge({
    sourceBranch: tierBranch,
    targetBranch: parentBranch,
    skipStash: true,
    pullBeforeMerge: syncRemote,
    strictPull: syncRemote,
    preferSource: true,
    autoResolveSubmodule: true,
  });
  if (!mergeResult.success) {
    messages.push(`Merge ${tierBranch} into ${parentBranch} failed: ${mergeResult.output}`);
    messages.push(`Manual recovery: git checkout ${parentBranch} && git merge ${tierBranch}`);
    warnGitOp({
      timestamp: new Date().toISOString(),
      operation: 'mergeTierBranch',
      command: `git merge ${tierBranch}`,
      success: false,
      output: mergeResult.output,
      error: 'MERGE_FAILED',
      context: `tier=${config.name} id=${tierId} from=${tierBranch} into=${parentBranch}`,
    });
    recordGitFriction({
      step: 'mergeTierBranch-merge',
      tier: config.name,
      tierId,
      reasonCode: 'merge_failed',
      stderrExcerpt: mergeResult.output.slice(0, 500),
      disposition: 'blocked',
    });
    return {
      success: false,
      messages,
      mergedInto: parentBranch,
      deletedBranch: false,
      reasonCode: 'merge_failed',
    };
  }
  messages.push(`Merged ${tierBranch} into ${parentBranch}.`);

  if (shouldPush) {
    const pushResult = await gitPush();
    if (!pushResult.success) {
      messages.push(`Push failed after merge; child branch not deleted: ${pushResult.output}`);
      recordGitFriction({
        step: 'mergeTierBranch-push',
        tier: config.name,
        tierId,
        reasonCode: 'push_failed_after_merge',
        disposition: 'blocked',
      });
      return {
        success: false,
        messages,
        mergedInto: parentBranch,
        deletedBranch: false,
        reasonCode: 'push_failed_after_merge',
      };
    }
    messages.push(`Pushed ${parentBranch} to remote.`);
  }

  let deleted = false;
  if (deleteBranch) {
    const safeTierBranch = tierBranch.replace(/'/g, "'\\''");
    const deleteResult = await runGitCommand(`git branch -D '${safeTierBranch}'`, 'mergeTierBranch-delete');
    if (!deleteResult.success) {
      messages.push(`Local branch delete failed: ${deleteResult.error || deleteResult.output}`);
      return {
        success: false,
        messages,
        mergedInto: parentBranch,
        deletedBranch: false,
        reasonCode: 'delete_local_branch_failed',
      };
    }
    deleted = true;
    messages.push(`Deleted branch: ${tierBranch}`);
    const remoteDel = await runGitCommand(`git push origin --delete '${safeTierBranch}'`, 'mergeTierBranch-delete-remote');
    if (!remoteDel.success) {
      messages.push(`Remote branch delete failed: ${remoteDel.error || remoteDel.output}`);
      return {
        success: false,
        messages,
        mergedInto: parentBranch,
        deletedBranch: true,
        reasonCode: 'delete_remote_branch_failed',
      };
    }
    messages.push(`Deleted remote branch: ${tierBranch}`);
  }

  return { success: true, messages, mergedInto: parentBranch, deletedBranch: deleted };
}

export async function mergeChildBranches(
  pattern: string,
  targetBranch: string,
  options?: { deleteMerged?: boolean; pullBeforeMerge?: boolean }
): Promise<MergeChildBranchesResult> {
  const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
  const pullBeforeMerge = options?.pullBeforeMerge ?? true;
  const branches = await listBranchesByPrefix(prefix);
  const merged: string[] = [];
  const failed: string[] = [];
  const messages: string[] = [];

  for (const branch of branches) {
    const mergeResult = await gitMerge({
      sourceBranch: branch,
      targetBranch,
      skipStash: true,
      pullBeforeMerge,
      strictPull: pullBeforeMerge,
      preferSource: true,
      autoResolveSubmodule: true,
    });
    if (mergeResult.success) {
      merged.push(branch);
      if (options?.deleteMerged) {
        const delResult = await runGitCommand(`git branch -d ${branch}`, 'mergeChildBranches-delete');
        messages.push(delResult.success ? `Merged and deleted: ${branch}` : `Merged ${branch} (delete failed: ${delResult.output})`);
      } else {
        messages.push(`Merged: ${branch}`);
      }
    } else {
      failed.push(branch);
      messages.push(`Merge failed: ${branch} — ${mergeResult.output}`);
    }
  }

  return { merged, failed, messages };
}

export async function deleteMergedChildBranchesAfterPush(
  branches: string[]
): Promise<{ success: boolean; messages: string[] }> {
  const messages: string[] = [];
  for (const branch of branches) {
    const safe = branch.replace(/'/g, "'\\''");
    const delLocal = await runGitCommand(`git branch -d '${safe}'`, 'deleteMergedChild-local');
    if (!delLocal.success) {
      messages.push(`Failed to delete local branch ${branch}: ${delLocal.error || delLocal.output}`);
      return { success: false, messages };
    }
    messages.push(`Deleted local branch ${branch}`);
    const delRemote = await runGitCommand(`git push origin --delete '${safe}'`, 'deleteMergedChild-remote');
    if (!delRemote.success) {
      messages.push(`Failed to delete remote branch ${branch}: ${delRemote.error || delRemote.output}`);
      return { success: false, messages };
    }
    messages.push(`Deleted remote branch ${branch}`);
  }
  return { success: true, messages };
}

export async function formatBranchHierarchyFromConfig(
  config: TierConfig,
  tierId: string,
  context: WorkflowCommandContext
): Promise<string> {
  const chain = buildBranchChain(config, tierId, context);
  const currentBranch = await getCurrentBranch();

  const lines: string[] = ['## Branch hierarchy (feature-only)\n', '```'];

  const rootBranch =
    chain.length > 0 && chain[0].parentBranchName
      ? chain[0].parentBranchName
      : (await branchExists('develop'))
        ? 'develop'
        : 'main';
  lines.push(rootBranch);

  chain.forEach((link, idx) => {
    const indent = '  '.repeat(idx + 1) + '└── ';
    const target = idx === chain.length - 1 ? ' (feature worktree)' : '';
    lines.push(`${indent}${link.branchName}${target}`);
  });

  lines.push('```');
  lines.push(`\n**Current branch:** \`${currentBranch ?? '(unknown)'}\``);

  if (chain.length > 0) {
    const target = chain[chain.length - 1];
    lines.push(`\n**Expected feature branch:** \`${target.branchName}\``);
    lines.push(
      '\n_Phase and session tiers do not create separate branches; all work stays on the feature branch._'
    );
  }

  return lines.join('\n');
}

export { commitUncommittedNonCursor };
