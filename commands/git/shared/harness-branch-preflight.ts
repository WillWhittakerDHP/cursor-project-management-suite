/**
 * Harness branch preflight: fetch, recreate local tracking branch from origin when missing,
 * ensure HEAD matches expected feature branch, compare to origin per policy.
 */

import type { TierConfig } from '../../tiers/shared/types';
import type { WorkflowCommandContext } from '../../utils/command-context';
import {
  runGitCommand,
  getCurrentBranch,
  branchExists,
  compareBranchToRemote,
} from './git-logger';
import { getExpectedBranchForTier, buildBranchChain } from './tier-branch-manager';
import type { PreflightFeatureBranchResult, HarnessBranchRemoteState } from './git-contract';
import { recordGitFriction } from './git-friction-log';
import { FEATURE_CONFIG } from '../../tiers/configs/feature';

export type PreflightFeatureBranchOptions = {
  /** When false, skip fetch and remote comparison (local-only). Default true. */
  syncRemote?: boolean;
  tier?: string;
  tierId?: string;
  featureName?: string;
};

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function divergedWarnOnly(): boolean {
  const a = process.env.SOLO_GIT_COHERENCE?.trim().toLowerCase();
  const b = process.env.HARNESS_GIT_DIVERGED_POLICY?.trim().toLowerCase();
  return a === 'warn' || b === 'warn';
}

function behindFfPullEnabled(): boolean {
  const v = process.env.HARNESS_GIT_BEHIND_FF_PULL?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

async function ensureCheckedOut(expected: string, messages: string[]): Promise<boolean> {
  const cur = await getCurrentBranch();
  if (cur === expected) return true;
  const co = await runGitCommand(`git checkout ${shellQuoteSingle(expected)}`, 'preflight-checkout-expected');
  if (!co.success) {
    messages.push(`Could not checkout ${expected}: ${co.error || co.output}`);
    return false;
  }
  messages.push(`Checked out ${expected}.`);
  return true;
}

async function applyRemoteRelation(
  branch: string,
  relation: HarnessBranchRemoteState,
  messages: string[],
  frictionCtx: { tier?: string; tierId?: string; featureName?: string }
): Promise<{ ok: boolean; reasonCode?: string }> {
  if (relation === 'no-remote') {
    messages.push(`No origin/${branch} (or not fetched); continuing local-only.`);
    return { ok: true };
  }
  if (relation === 'up-to-date' || relation === 'ahead') {
    if (relation === 'ahead') {
      messages.push(`${branch} is ahead of origin; OK until push.`);
    } else {
      messages.push(`${branch} is up to date with origin.`);
    }
    return { ok: true };
  }
  if (relation === 'behind') {
    if (behindFfPullEnabled()) {
      const ff = await runGitCommand(
        `git merge --ff-only ${shellQuoteSingle(`origin/${branch}`)}`,
        'preflight-behind-ffonly'
      );
      if (!ff.success) {
        messages.push(`Fast-forward from origin/${branch} failed: ${ff.error || ff.output}`);
        recordGitFriction({
          step: 'preflightBranch-behind',
          tier: frictionCtx.tier,
          tierId: frictionCtx.tierId,
          featureName: frictionCtx.featureName,
          reasonCode: 'behind_remote_ff_failed',
          stderrExcerpt: (ff.error || ff.output).slice(0, 500),
          disposition: 'blocked',
        });
        return { ok: false, reasonCode: 'branch_behind_remote' };
      }
      messages.push(`Fast-forwarded ${branch} to match origin.`);
      return { ok: true };
    }
    messages.push(
      `Local ${branch} is behind origin/${branch}. Pull with a fast-forward (e.g. git pull --ff-only origin ${branch}) then retry.`
    );
    recordGitFriction({
      step: 'preflightBranch-behind',
      tier: frictionCtx.tier,
      tierId: frictionCtx.tierId,
      featureName: frictionCtx.featureName,
      expectedBranch: branch,
      reasonCode: 'branch_behind_remote',
      disposition: 'blocked',
    });
    return { ok: false, reasonCode: 'branch_behind_remote' };
  }
  const hint = `Local ${branch} and origin/${branch} have diverged. Resolve manually (rebase or merge), then retry.`;
  if (divergedWarnOnly()) {
    messages.push(`WARNING (SOLO_GIT_COHERENCE or HARNESS_GIT_DIVERGED_POLICY=warn): ${hint}`);
    recordGitFriction({
      step: 'preflightBranch-diverged',
      tier: frictionCtx.tier,
      tierId: frictionCtx.tierId,
      featureName: frictionCtx.featureName,
      reasonCode: 'diverged_from_remote',
      disposition: 'blocked',
      notes: hint,
    });
    return { ok: true };
  }
  messages.push(hint);
  recordGitFriction({
    step: 'preflightBranch-diverged',
    tier: frictionCtx.tier,
    tierId: frictionCtx.tierId,
    featureName: frictionCtx.featureName,
    reasonCode: 'diverged_from_remote',
    disposition: 'blocked',
    notes: hint,
  });
  return { ok: false, reasonCode: 'diverged_from_remote' };
}

/**
 * Before mutating git (tier-end commit, task-end commit, etc.): align local branch with origin policy.
 */
export async function preflightFeatureBranchForHarness(
  config: TierConfig,
  tierId: string,
  context: WorkflowCommandContext,
  options?: PreflightFeatureBranchOptions
): Promise<PreflightFeatureBranchResult> {
  const messages: string[] = [];
  const friction = {
    tier: options?.tier ?? config.name,
    tierId: options?.tierId ?? tierId,
    featureName: options?.featureName ?? context.feature.name,
  };

  const chain = buildBranchChain(config, tierId, context);
  const expectedBranch = await getExpectedBranchForTier(config, tierId, context);

  if (chain.length > 0 && expectedBranch == null) {
    const msg =
      'Expected a feature branch for this tier but the name is ambiguous or unresolved (e.g. multiple local branches match the same prefix). Resolve to a single branch before continuing.';
    messages.push(msg);
    recordGitFriction({
      step: 'preflightBranch-ambiguous',
      ...friction,
      reasonCode: 'ambiguous_branch_prefix',
      disposition: 'blocked',
      notes: msg,
    });
    return {
      ok: false,
      expectedBranch: null,
      resolvedBranch: null,
      messages,
      reasonCode: 'ambiguous_branch_prefix',
    };
  }

  if (expectedBranch == null) {
    messages.push('No expected feature branch for this tier; skipping branch preflight.');
    return {
      ok: true,
      expectedBranch: null,
      resolvedBranch: null,
      messages,
    };
  }

  if ((await getCurrentBranch()) === null) {
    const msg = 'Cannot determine current git branch (detached HEAD or not a git repository).';
    messages.push(msg);
    recordGitFriction({
      step: 'preflightBranch',
      ...friction,
      currentBranch: null,
      reasonCode: 'current_branch_unknown',
      disposition: 'blocked',
      notes: msg,
    });
    return {
      ok: false,
      expectedBranch,
      resolvedBranch: null,
      messages,
      reasonCode: 'current_branch_unknown',
    };
  }

  const syncRemote = options?.syncRemote !== false;

  if (syncRemote) {
    const fetchR = await runGitCommand(`git fetch origin ${expectedBranch}`, 'preflight-fetch-expected');
    if (!fetchR.success) {
      const msg = `git fetch origin ${expectedBranch} failed: ${fetchR.error || fetchR.output}. Check git remote -v and network.`;
      messages.push(msg);
      recordGitFriction({
        step: 'preflight-fetch',
        ...friction,
        reasonCode: 'preflight_fetch_failed',
        stderrExcerpt: (fetchR.error || fetchR.output).slice(0, 500),
        disposition: 'blocked',
        notes: msg,
      });
      return {
        ok: false,
        expectedBranch,
        resolvedBranch: null,
        messages,
        reasonCode: 'preflight_fetch_failed',
      };
    }
    messages.push(`Fetched origin ${expectedBranch}.`);
  }

  if (!(await branchExists(expectedBranch))) {
    const originRef = `origin/${expectedBranch}`;
    const originRev = await runGitCommand(
      `git rev-parse --verify ${shellQuoteSingle(originRef)}`,
      'preflight-rev-parse-origin'
    );
    if (!originRev.success) {
      const msg =
        `No local branch ${expectedBranch} and no ${originRef} (after fetch). ` +
        `Verify origin URL (\`git remote -v\`) and that the branch exists on the remote, or run tier-start from develop.`;
      messages.push(msg);
      recordGitFriction({
        step: 'preflight-no-local-no-remote',
        ...friction,
        expectedBranch,
        reasonCode: 'no_local_no_remote',
        disposition: 'blocked',
        notes: msg,
      });
      return {
        ok: false,
        expectedBranch,
        resolvedBranch: null,
        messages,
        reasonCode: 'no_local_no_remote',
      };
    }
    const co = await runGitCommand(
      `git checkout -B ${shellQuoteSingle(expectedBranch)} ${shellQuoteSingle(originRef)}`,
      'preflight-checkout-from-origin'
    );
    if (!co.success) {
      const msg = `Could not create/checkout ${expectedBranch} from ${originRef}: ${co.error || co.output}`;
      messages.push(msg);
      recordGitFriction({
        step: 'preflight-checkout-tracking',
        ...friction,
        reasonCode: 'checkout_from_origin_failed',
        stderrExcerpt: (co.error || co.output).slice(0, 500),
        disposition: 'blocked',
        notes: msg,
      });
      return {
        ok: false,
        expectedBranch,
        resolvedBranch: null,
        messages,
        reasonCode: 'checkout_from_origin_failed',
      };
    }
    messages.push(`Created/reset local ${expectedBranch} tracking ${originRef}.`);
  }

  if (!(await ensureCheckedOut(expectedBranch, messages))) {
    return {
      ok: false,
      expectedBranch,
      resolvedBranch: null,
      messages,
      reasonCode: 'preflight_checkout_failed',
    };
  }

  const head = await getCurrentBranch();
  if (head !== expectedBranch) {
    const msg = `HEAD is ${head ?? '(unknown)'} but expected ${expectedBranch} after preflight.`;
    messages.push(msg);
    recordGitFriction({
      step: 'preflight-head-mismatch',
      ...friction,
      currentBranch: head,
      expectedBranch,
      reasonCode: 'wrong_branch_after_preflight',
      disposition: 'blocked',
      notes: msg,
    });
    return {
      ok: false,
      expectedBranch,
      resolvedBranch: head,
      messages,
      reasonCode: 'wrong_branch_after_preflight',
    };
  }

  if (!syncRemote) {
    messages.push('syncRemote=false: skipped remote comparison.');
    return {
      ok: true,
      expectedBranch,
      resolvedBranch: expectedBranch,
      messages,
    };
  }

  const remoteState = await compareBranchToRemote(expectedBranch, { skipFetch: true });
  const rel = await applyRemoteRelation(expectedBranch, remoteState, messages, friction);
  if (!rel.ok) {
    return {
      ok: false,
      expectedBranch,
      resolvedBranch: expectedBranch,
      remoteState,
      messages,
      reasonCode: rel.reasonCode,
    };
  }

  return {
    ok: true,
    expectedBranch,
    resolvedBranch: expectedBranch,
    remoteState,
    messages,
  };
}

/**
 * /accepted-push path: ensure HEAD matches expected feature branch and optional remote coherence (no checkout from origin).
 */
export async function verifyHarnessPushBranchCoherence(
  context: WorkflowCommandContext
): Promise<{ ok: boolean; messages: string[]; reasonCode?: string; remoteState?: HarnessBranchRemoteState }> {
  const messages: string[] = [];
  const featureId = context.feature.name;
  const chain = buildBranchChain(FEATURE_CONFIG, featureId, context);
  const expectedBranch = await getExpectedBranchForTier(FEATURE_CONFIG, featureId, context);

  if (chain.length > 0 && expectedBranch == null) {
    const msg = 'Could not resolve a unique expected feature branch; push guard aborted.';
    messages.push(msg);
    return { ok: false, messages, reasonCode: 'ambiguous_branch_prefix' };
  }
  if (expectedBranch == null) {
    messages.push('No expected feature branch from config; skipping push guard.');
    return { ok: true, messages };
  }

  const current = await getCurrentBranch();
  if (current == null) {
    const msg = 'Cannot determine current branch; push aborted.';
    messages.push(msg);
    recordGitFriction({
      step: 'verifyHarnessPush',
      featureName: context.feature.name,
      currentBranch: null,
      reasonCode: 'current_branch_unknown',
      disposition: 'blocked',
      notes: msg,
    });
    return { ok: false, messages, reasonCode: 'current_branch_unknown' };
  }

  const onExpected = current === expectedBranch || current.startsWith(`${expectedBranch}-`);
  if (!onExpected) {
    const msg = `Push guard: HEAD is \`${current}\` but pending tier-end expects work on \`${expectedBranch}\`. Checkout the feature branch and retry /accepted-push.`;
    messages.push(msg);
    recordGitFriction({
      step: 'verifyHarnessPush',
      featureName: context.feature.name,
      currentBranch: current,
      expectedBranch,
      reasonCode: 'wrong_branch_before_push',
      disposition: 'blocked',
      notes: msg,
    });
    return { ok: false, messages, reasonCode: 'wrong_branch_before_push' };
  }

  const skipRemoteCompare = process.env.HARNESS_PUSH_SKIP_REMOTE_COMPARE?.trim() === '1';
  if (skipRemoteCompare) {
    messages.push('HARNESS_PUSH_SKIP_REMOTE_COMPARE=1: skipped remote compare before push.');
    return { ok: true, messages };
  }

  const fetchR = await runGitCommand(`git fetch origin ${expectedBranch}`, 'verify-push-fetch');
  if (!fetchR.success) {
    const msg = `Push guard: fetch failed (${fetchR.error || fetchR.output}). Fix remote or set HARNESS_PUSH_SKIP_REMOTE_COMPARE=1 to skip.`;
    messages.push(msg);
    return { ok: false, messages, reasonCode: 'push_preflight_fetch_failed' };
  }

  const remoteState = await compareBranchToRemote(expectedBranch, { skipFetch: true });
  const friction = { featureName: context.feature.name };
  const rel = await applyRemoteRelation(expectedBranch, remoteState, messages, friction);
  if (!rel.ok) {
    return { ok: false, messages, reasonCode: rel.reasonCode, remoteState };
  }
  return { ok: true, messages, remoteState };
}
