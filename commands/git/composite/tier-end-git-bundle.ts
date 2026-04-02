/**
 * Orchestrated tier-end git sequences (preflight → ensure branch → commit → push → optional merge).
 * Keeps tier *-end-impl hooks free of ad-hoc git composition.
 */

import type { WorkflowCommandContext } from '../../utils/command-context';
import { FEATURE_CONFIG } from '../../tiers/configs/feature';
import { PHASE_CONFIG } from '../../tiers/configs/phase';
import { gitCommit } from '../atomic/commit';
import { gitPush } from '../atomic/push';
import { ensureTierBranch, mergeTierBranch } from '../shared/tier-branch-manager';
import { preflightFeatureBranchForHarness } from '../shared/harness-branch-preflight';

export type TierEndGitStepEntry = { success: boolean; output: string };

export type FeatureTierEndGitInput = {
  context: WorkflowCommandContext;
  identifier: string;
  commitMessage: string;
  auditPrewarmPromise?: Promise<void>;
};

/**
 * Feature-end git: preflight, ensure branch, commit, push, merge to develop (delete branch when configured).
 */
export async function runFeatureTierEndGit(
  input: FeatureTierEndGitInput
): Promise<{ ok: boolean; steps: Record<string, TierEndGitStepEntry>; errorOutcome?: string }> {
  const steps: Record<string, TierEndGitStepEntry> = {};
  const { context, identifier, commitMessage, auditPrewarmPromise } = input;

  const featureBranchName = FEATURE_CONFIG.getBranchName(context, identifier);
  if (!featureBranchName) {
    steps.ensureFeatureBranch = { success: false, output: 'Could not resolve feature branch name from config.' };
    return { ok: false, steps, errorOutcome: 'Cannot proceed: feature branch name is null' };
  }

  const pre = await preflightFeatureBranchForHarness(FEATURE_CONFIG, identifier, context, {
    syncRemote: true,
    tier: 'feature',
    tierId: identifier,
  });
  steps.preflightBranch = { success: pre.ok, output: pre.messages.join('\n') };
  if (!pre.ok) {
    return { ok: false, steps, errorOutcome: pre.messages.join('\n') };
  }

  const ensureResult = await ensureTierBranch(FEATURE_CONFIG, identifier, context, { createIfMissing: true });
  steps.ensureFeatureBranch = { success: ensureResult.success, output: ensureResult.messages.join('\n') };
  if (!ensureResult.success) {
    return { ok: false, steps, errorOutcome: 'Cannot proceed: could not ensure feature branch' };
  }

  steps.mergePhaseBranches = {
    success: true,
    output: 'Feature-only branching: no separate phase branches to merge into the feature branch.',
  };

  const featureCommitResult = await gitCommit(commitMessage);
  steps.gitCommit = { success: featureCommitResult.success, output: featureCommitResult.output };
  if (!featureCommitResult.success) {
    return {
      ok: false,
      steps,
      errorOutcome: `Feature completion commit failed. ${featureCommitResult.output}`,
    };
  }

  const featurePushResult = await gitPush();
  steps.gitPush = { success: featurePushResult.success, output: featurePushResult.output };
  if (!featurePushResult.success) {
    return {
      ok: false,
      steps,
      errorOutcome: `Feature branch push failed. ${featurePushResult.output}`,
    };
  }

  const mergeToDevelop = await mergeTierBranch(FEATURE_CONFIG, identifier, context, {
    push: true,
    deleteBranch: true,
    auditPrewarmPromise,
  });
  steps.gitMerge = { success: mergeToDevelop.success, output: mergeToDevelop.messages.join('\n') };
  steps.deleteBranch = {
    success: mergeToDevelop.deletedBranch,
    output: mergeToDevelop.deletedBranch
      ? 'Feature branch deleted locally (and remote delete attempted).'
      : 'Feature branch not deleted (see merge step output).',
  };
  steps.checkoutDevelop = {
    success: mergeToDevelop.success,
    output: mergeToDevelop.success ? `Merged into ${mergeToDevelop.mergedInto}.` : 'Merge into develop did not complete.',
  };

  if (!mergeToDevelop.success) {
    return {
      ok: false,
      steps,
      errorOutcome: mergeToDevelop.messages.join(' '),
    };
  }

  return { ok: true, steps };
}

export type PhaseTierEndGitInput = {
  context: WorkflowCommandContext;
  phaseId: string;
  commitMessage: string;
};

/**
 * Phase-end git: preflight on feature branch, ensure branch, commit, push (no phase-owned branch).
 */
export async function runPhaseTierEndGit(
  input: PhaseTierEndGitInput
): Promise<{ ok: boolean; steps: Record<string, TierEndGitStepEntry>; errorOutcome?: string }> {
  const steps: Record<string, TierEndGitStepEntry> = {};
  const { context, phaseId, commitMessage } = input;

  const featureBranchName = FEATURE_CONFIG.getBranchName(context, context.feature.name);
  if (!featureBranchName) {
    steps.ensurePhaseBranch = { success: false, output: 'Could not resolve feature branch from config.' };
    return { ok: false, steps, errorOutcome: 'Cannot proceed: feature branch name is null' };
  }

  const pre = await preflightFeatureBranchForHarness(PHASE_CONFIG, phaseId, context, {
    syncRemote: true,
    tier: 'phase',
    tierId: phaseId,
  });
  steps.preflightBranch = { success: pre.ok, output: pre.messages.join('\n') };
  if (!pre.ok) {
    return { ok: false, steps, errorOutcome: pre.messages.join('\n') };
  }

  const ensureResult = await ensureTierBranch(PHASE_CONFIG, phaseId, context, { createIfMissing: true });
  steps.ensurePhaseBranch = { success: ensureResult.success, output: ensureResult.messages.join('\n') };
  if (!ensureResult.success) {
    return { ok: false, steps, errorOutcome: 'Cannot proceed: could not ensure feature branch for phase-end' };
  }

  steps.findSessionBranches = {
    success: true,
    output: 'Feature-only branching: no separate session branches to merge.',
  };
  steps.mergeSessionBranches = {
    success: true,
    output: 'Skipped session branch merges (work stays on the feature branch).',
  };

  const phaseCommitResult = await gitCommit(commitMessage);
  steps.gitCommitPhase = { success: phaseCommitResult.success, output: phaseCommitResult.output };
  if (!phaseCommitResult.success) {
    return {
      ok: false,
      steps,
      errorOutcome: `Phase completion commit failed. ${phaseCommitResult.output}`,
    };
  }

  const phasePushResult = await gitPush();
  steps.gitPushPhase = { success: phasePushResult.success, output: phasePushResult.output };
  if (!phasePushResult.success) {
    return {
      ok: false,
      steps,
      errorOutcome: `Feature branch push failed after phase-end. ${phasePushResult.output}`,
    };
  }

  steps.gitMergePhaseToFeature = {
    success: true,
    output: 'No phase→feature merge (phase tier has no branch); checkpoint completed on feature branch.',
  };

  return { ok: true, steps };
}
