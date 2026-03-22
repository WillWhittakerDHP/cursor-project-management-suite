/**
 * INTERNAL git composite: imports git-logger to avoid a circular import with
 * git-manager (which re-exports propagate*). All other `.cursor/commands` code
 * must use `git/shared/git-manager.ts` only for git operations.
 *
 * Propagate shared files from a source branch to all active tier branches.
 *
 * Uses git worktrees so the main working tree is never modified — this avoids
 * triggering nodemon/watchers and eliminates stash-pop conflict markers.
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

import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { getCurrentBranch, branchExists, runGitCommand } from '../shared/git-logger';

// ─── Types ──────────────────────────────────────────────────────────────

export interface PropagateOptions {
  sourceBranch?: string;
  files?: string[];
  includeSubmodule?: boolean;
  targetBranches?: string[];
  preset?: 'shared' | 'harness';
  commitMessage?: string;
  dryRun?: boolean;
  /** When set, auto-discovered branches are filtered to only those in the same feature hierarchy. */
  featureScope?: { tierId: string; featureBranchName?: string };
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

/**
 * Given a tier identifier (e.g. "8.2.1"), extract the feature-number prefix
 * (the leading integer before the first dot). Returns null if unparseable.
 */
function extractFeaturePrefix(tierId: string): string | null {
  const match = tierId.match(/^(\d+)\./);
  return match ? match[1] : null;
}

/**
 * Filter a list of tier branches to only those belonging to the same feature
 * hierarchy (matching the feature number prefix in their tier ID).
 * Also includes any feature branch whose name matches `featureBranchName`.
 */
export function filterBranchesByFeature(
  branches: string[],
  tierId: string,
  featureBranchName?: string
): string[] {
  const prefix = extractFeaturePrefix(tierId);
  if (!prefix) return branches;

  return branches.filter((b) => {
    if (b.startsWith(`phase-${prefix}.`) || b.startsWith(`phase-${prefix}-`)) return true;
    if (b.startsWith(`session-${prefix}.`)) return true;
    if (featureBranchName && b === featureBranchName) return true;
    return false;
  });
}

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

/**
 * Remove a worktree and its directory. git worktree remove can fail if there
 * are changes in the worktree; --force handles that. Belt-and-suspenders: also
 * rm -rf the directory and prune dangling worktree bookkeeping.
 */
async function removeWorktree(worktreeDir: string): Promise<void> {
  await runGitCommand(`git worktree remove '${worktreeDir}' --force`, 'propagate-worktree-remove');
  try { rmSync(worktreeDir, { recursive: true, force: true }); } catch { /* best-effort */ }
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

  let targets = opts.targetBranches ?? (await listTierBranches());
  if (!opts.targetBranches && opts.featureScope) {
    targets = filterBranchesByFeature(targets, opts.featureScope.tierId, opts.featureScope.featureBranchName);
  }
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

  // Prune stale worktrees from any previous crashed run
  await runGitCommand('git worktree prune', 'propagate-worktree-prune');

  const safeCommitMsg = commitMsg.replace(/'/g, "'\\''");
  const worktreeBase = mkdtempSync(join(tmpdir(), 'propagate-'));

  for (const branch of filteredTargets) {
    const safeBranchDir = branch.replace(/[/\\]/g, '-');
    const worktreeDir = join(worktreeBase, safeBranchDir);

    try {
      const addResult = await runGitCommand(
        `git worktree add '${worktreeDir}' '${branch}'`,
        'propagate-worktree-add'
      );
      if (!addResult.success) {
        details.push({ branch, status: 'failed', message: `worktree add failed: ${addResult.error ?? addResult.output}` });
        continue;
      }

      for (const file of filesToCopy) {
        const safeFile = file.replace(/'/g, "'\\''");
        await runGitCommand(
          `git -C '${worktreeDir}' checkout ${sourceBranch} -- '${safeFile}'`,
          'propagate-worktree-checkout-file'
        );
      }

      const diff = await runGitCommand(
        `git -C '${worktreeDir}' diff --cached --quiet`,
        'propagate-worktree-diff'
      );
      if (diff.success) {
        details.push({ branch, status: 'skipped', message: 'already up to date' });
        await removeWorktree(worktreeDir);
        continue;
      }

      const commit = await runGitCommand(
        `git -C '${worktreeDir}' commit -m '${safeCommitMsg}'`,
        'propagate-worktree-commit'
      );
      if (!commit.success) {
        details.push({ branch, status: 'failed', message: `commit failed: ${commit.error ?? commit.output}` });
        await removeWorktree(worktreeDir);
        continue;
      }

      details.push({ branch, status: 'updated', message: 'propagated successfully (worktree)' });
      await removeWorktree(worktreeDir);
    } catch (err) {
      details.push({
        branch,
        status: 'failed',
        message: `unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      });
      if (existsSync(worktreeDir)) {
        await removeWorktree(worktreeDir);
      }
    }
  }

  // Final cleanup
  try { rmSync(worktreeBase, { recursive: true, force: true }); } catch { /* best-effort */ }
  await runGitCommand('git worktree prune', 'propagate-worktree-prune-final');

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
  opts?: { dryRun?: boolean; targetBranches?: string[]; featureScope?: PropagateOptions['featureScope'] }
): Promise<PropagateResult> {
  return propagateFiles({
    sourceBranch,
    preset: 'shared',
    dryRun: opts?.dryRun,
    targetBranches: opts?.targetBranches,
    featureScope: opts?.featureScope,
  });
}

export async function propagateHarness(
  sourceBranch?: string,
  opts?: { dryRun?: boolean; targetBranches?: string[]; featureScope?: PropagateOptions['featureScope'] }
): Promise<PropagateResult> {
  return propagateFiles({
    sourceBranch,
    preset: 'harness',
    dryRun: opts?.dryRun,
    targetBranches: opts?.targetBranches,
    featureScope: opts?.featureScope,
  });
}
