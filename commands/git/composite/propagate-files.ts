/**
 * Propagate shared files from a source branch to all active tier branches.
 *
 * Solves the recurring problem where fixes to shared files (PROJECT_PLAN.md,
 * .gitignore, .cursor submodule) made on one branch don't reach other active
 * branches, causing agents to "re-discover" already-fixed issues.
 *
 * Usage from slash command or direct call:
 *   propagateFiles({ sourceBranch: 'session-6.9.4', files: ['.project-manager/PROJECT_PLAN.md'] })
 *   propagateFiles({ preset: 'shared' })           // propagates PROJECT_PLAN + .gitignore + .cursor
 *   propagateFiles({ preset: 'harness' })           // propagates .cursor submodule + .gitignore only
 */

import { getCurrentBranch, branchExists } from '../../utils/utils';
import { runGitCommand } from '../shared/git-logger';

// ─── Types ──────────────────────────────────────────────────────────────

export interface PropagateOptions {
  sourceBranch?: string;
  files?: string[];
  includeSubmodule?: boolean;
  targetBranches?: string[];
  preset?: 'shared' | 'harness';
  commitMessage?: string;
  dryRun?: boolean;
}

export interface PropagateResult {
  success: boolean;
  summary: string;
  details: BranchResult[];
}

interface BranchResult {
  branch: string;
  status: 'updated' | 'skipped' | 'failed';
  message: string;
}

// ─── Presets ────────────────────────────────────────────────────────────

const PRESETS: Record<string, { files: string[]; includeSubmodule: boolean }> = {
  shared: {
    files: ['.project-manager/PROJECT_PLAN.md', '.gitignore'],
    includeSubmodule: true,
  },
  harness: {
    files: ['.gitignore'],
    includeSubmodule: true,
  },
};

const TIER_BRANCH_PREFIXES = ['feature/', 'phase-', 'session-'];
const ROOT_BRANCHES = ['main', 'master', 'develop'];

// ─── Core ───────────────────────────────────────────────────────────────

async function listTierBranches(): Promise<string[]> {
  const result = await runGitCommand('git branch --format="%(refname:short)"', 'propagate-listBranches');
  if (!result.success || !result.output.trim()) return [];
  return result.output
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((name) => TIER_BRANCH_PREFIXES.some((p) => name.startsWith(p)));
}

async function stashIfDirty(): Promise<boolean> {
  const status = await runGitCommand('git status --porcelain', 'propagate-status');
  if (!status.success || !status.output.trim()) return false;
  const stash = await runGitCommand('git stash push -u -m "propagate-files: auto-stash"', 'propagate-stash');
  return stash.success;
}

async function unstash(didStash: boolean): Promise<void> {
  if (!didStash) return;
  await runGitCommand('git stash pop', 'propagate-unstash');
}

export async function propagateFiles(opts: PropagateOptions): Promise<PropagateResult> {
  const details: BranchResult[] = [];

  const originalBranch = await getCurrentBranch();
  const sourceBranch = opts.sourceBranch ?? originalBranch;

  if (!(await branchExists(sourceBranch))) {
    return { success: false, summary: `Source branch "${sourceBranch}" does not exist.`, details };
  }

  let filesToCopy = opts.files ?? [];
  let includeSubmodule = opts.includeSubmodule ?? false;

  if (opts.preset && PRESETS[opts.preset]) {
    const preset = PRESETS[opts.preset];
    filesToCopy = [...new Set([...filesToCopy, ...preset.files])];
    includeSubmodule = includeSubmodule || preset.includeSubmodule;
  }

  if (includeSubmodule && !filesToCopy.includes('.cursor')) {
    filesToCopy.push('.cursor');
  }

  if (filesToCopy.length === 0) {
    return { success: false, summary: 'No files specified for propagation.', details };
  }

  const targets = opts.targetBranches ?? (await listTierBranches());
  const filteredTargets = targets.filter((b) => b !== sourceBranch && !ROOT_BRANCHES.includes(b));

  if (filteredTargets.length === 0) {
    return { success: true, summary: 'No target branches found to propagate to.', details };
  }

  const commitMsg =
    opts.commitMessage ??
    `fix: propagate shared files from ${sourceBranch}\n\nFiles: ${filesToCopy.join(', ')}`;

  if (opts.dryRun) {
    for (const branch of filteredTargets) {
      details.push({ branch, status: 'skipped', message: 'dry-run: would propagate' });
    }
    return {
      success: true,
      summary: `Dry run: would propagate ${filesToCopy.length} file(s) to ${filteredTargets.length} branch(es).`,
      details,
    };
  }

  const didStash = await stashIfDirty();

  const safeCommitMsg = commitMsg.replace(/'/g, "'\\''");

  for (const branch of filteredTargets) {
    try {
      const checkout = await runGitCommand(`git checkout ${branch}`, 'propagate-checkout');
      if (!checkout.success) {
        details.push({ branch, status: 'failed', message: `checkout failed: ${checkout.error ?? checkout.output}` });
        continue;
      }

      for (const file of filesToCopy) {
        await runGitCommand(`git checkout ${sourceBranch} -- ${file}`, 'propagate-checkout-file');
      }

      const diff = await runGitCommand('git diff --cached --quiet', 'propagate-diff');
      if (diff.success) {
        await runGitCommand('git checkout -- .', 'propagate-discard');
        details.push({ branch, status: 'skipped', message: 'already up to date' });
        continue;
      }

      const commit = await runGitCommand(`git commit -m '${safeCommitMsg}'`, 'propagate-commit');
      if (!commit.success) {
        await runGitCommand('git reset HEAD -- .', 'propagate-reset');
        await runGitCommand('git checkout -- .', 'propagate-discard');
        details.push({ branch, status: 'failed', message: `commit failed: ${commit.error ?? commit.output}` });
        continue;
      }

      details.push({ branch, status: 'updated', message: 'propagated successfully' });
    } catch (err) {
      details.push({
        branch,
        status: 'failed',
        message: `unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  await runGitCommand(`git checkout ${originalBranch}`, 'propagate-checkout-original');
  await unstash(didStash);

  const updated = details.filter((d) => d.status === 'updated').length;
  const skipped = details.filter((d) => d.status === 'skipped').length;
  const failed = details.filter((d) => d.status === 'failed').length;

  return {
    success: failed === 0,
    summary: `Propagated to ${updated} branch(es), skipped ${skipped}, failed ${failed}.`,
    details,
  };
}

// ─── Convenience wrappers ───────────────────────────────────────────────

export async function propagateSharedFiles(
  sourceBranch?: string,
  opts?: { dryRun?: boolean; targetBranches?: string[] }
): Promise<PropagateResult> {
  return propagateFiles({
    sourceBranch,
    preset: 'shared',
    dryRun: opts?.dryRun,
    targetBranches: opts?.targetBranches,
  });
}

export async function propagateHarness(
  sourceBranch?: string,
  opts?: { dryRun?: boolean; targetBranches?: string[] }
): Promise<PropagateResult> {
  return propagateFiles({
    sourceBranch,
    preset: 'harness',
    dryRun: opts?.dryRun,
    targetBranches: opts?.targetBranches,
  });
}
