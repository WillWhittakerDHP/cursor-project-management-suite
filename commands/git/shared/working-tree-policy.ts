/**
 * Working tree classification, porcelain parsing, pre-checkout resolution, and selective commit.
 */

import { getCurrentBranch, branchExists, runGitCommand, warnGitOp } from './git-logger';

// ─── Path classification ───────────────────────────────────────────────

export function isCursorPath(path: string): boolean {
  const p = path.trim();
  return p === '.cursor' || p === 'cursor' || p.startsWith('.cursor/') || p.startsWith('cursor/');
}

export function isProjectManagerPath(path: string): boolean {
  const p = path.trim();
  return (
    p === '.project-manager' ||
    p === 'project-manager' ||
    p.startsWith('.project-manager/') ||
    p.startsWith('project-manager/')
  );
}

export function isAuditReportsPath(path: string): boolean {
  const p = path.trim();
  return (
    p.startsWith('client/.audit-reports') ||
    p.startsWith('client/.audit-reports/') ||
    p.startsWith('frontend-root/.audit-reports') ||
    p.startsWith('frontend-root/.audit-reports/')
  );
}

export function isAutoCommittable(filePath: string): boolean {
  return isCursorPath(filePath) || isProjectManagerPath(filePath) || isAuditReportsPath(filePath);
}

const TRANSIENT_PM_FILES = [
  '.project-manager/.audit-baseline-log.jsonl',
  '.project-manager/.git-ops-log',
  '.project-manager/.merge-incident-log',
  '.project-manager/.write-log',
  '.project-manager/.tier-scope',
  '.project-manager/.current-feature',
  '.project-manager/.git-friction-log.jsonl',
] as const;

function isTransientProjectManagerFile(filePath: string): boolean {
  const p = filePath.trim().replace(/^\.\//, '');
  return TRANSIENT_PM_FILES.some((t) => p === t || p === t.replace(/^\./, ''));
}

export function isNeverCommitPath(filePath: string): boolean {
  if (isCursorPath(filePath)) return true;
  if (isAuditReportsPath(filePath)) return true;
  if (isTransientProjectManagerFile(filePath)) return true;
  return false;
}

export const DEFAULT_ALLOWED_COMMIT_PREFIXES = ['client/', 'server/', '.project-manager/'] as const;

const WORKFLOW_ARTIFACT_STASH_PATHS = '.cursor .project-manager client/.audit-reports';

function normalizeStatusPath(path: string): string {
  let p = path.trim();
  if (p.startsWith('./')) p = p.slice(2);
  if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
  p = p.trim();
  if (p.startsWith('project-manager/') || p === 'project-manager') {
    p = `.${p}`;
  }
  return p;
}

export interface PortcelainEntry {
  xy: string;
  path: string;
}

export function isUnmergedStatus(xy: string): boolean {
  return xy.includes('U') || xy === 'AA' || xy === 'DD';
}

export function parsePortcelainEntries(porcelainOutput: string): PortcelainEntry[] {
  if (!porcelainOutput) return [];
  return porcelainOutput
    .split('\n')
    .filter((line) => line.length >= 4)
    .map((line) => {
      const m = line.match(/^(.)(.)\s+(.*)$/);
      if (m?.[1] != null && m?.[2] != null && m?.[3] != null) {
        const xy = m[1] + m[2];
        const pathPart = m[3];
        const arrowIdx = pathPart.indexOf(' -> ');
        const resolved =
          arrowIdx >= 0 ? normalizeStatusPath(pathPart.substring(arrowIdx + 4)) : normalizeStatusPath(pathPart);
        return { xy, path: resolved };
      }
      const arrowInTail = line.indexOf(' -> ', 2);
      if (arrowInTail >= 0) {
        const xy = line.substring(0, 2);
        const afterPrefix = line.slice(3);
        const arrowIdx = afterPrefix.indexOf(' -> ');
        const filePart = arrowIdx >= 0 ? afterPrefix.substring(arrowIdx + 4) : afterPrefix;
        return { xy, path: normalizeStatusPath(filePart) };
      }
      const xy = line.substring(0, 2);
      const raw = line.substring(3);
      return { xy, path: normalizeStatusPath(raw) };
    })
    .filter((e) => e.path.length > 0);
}

function parsePortcelainPaths(porcelainOutput: string): string[] {
  return parsePortcelainEntries(porcelainOutput).map((e) => e.path);
}

export async function recoverFromFailedStashPop(opLabel: string): Promise<{ recovered: boolean; detail: string }> {
  const unmerged = await runGitCommand(
    'git diff --name-only --diff-filter=U',
    `${opLabel}-listUnmerged`
  );

  const unmergedPaths =
    unmerged.success && unmerged.output.trim()
      ? unmerged.output
          .trim()
          .split('\n')
          .filter(Boolean)
      : [];

  if (unmergedPaths.length > 0) {
    for (const p of unmergedPaths) {
      const safePath = p.replace(/'/g, "'\\''");
      await runGitCommand(`git checkout HEAD -- '${safePath}'`, `${opLabel}-resetUnmerged`);
    }
  }

  await runGitCommand('git checkout -- .', `${opLabel}-cleanPartialPop`);
  await runGitCommand('git stash drop', `${opLabel}-dropConflictedStash`);

  const detail =
    unmergedPaths.length > 0
      ? `Recovered ${unmergedPaths.length} conflicted file(s) by keeping branch version: ${unmergedPaths.join(', ')}`
      : 'Stash pop failed; cleaned up and dropped stash.';

  warnGitOp({
    timestamp: new Date().toISOString(),
    operation: `${opLabel}-stashPopRecovery`,
    command: 'recoverFromFailedStashPop',
    success: true,
    output: detail,
  });

  return { recovered: true, detail };
}

interface UncommittedResolution {
  clean: boolean;
  stashedWorkflowArtifacts?: boolean;
  stashedBlockingFiles?: boolean;
  blockingFiles: string[];
  message: string;
  autoCommittedPaths?: string[];
}

async function resolveUncommittedBeforeCheckout(theirBranch?: string | null): Promise<UncommittedResolution> {
  const status = await runGitCommand('git status --porcelain --ignore-submodules=dirty', 'resolveUncommitted-status');
  if (!status.success || !status.output.trim()) {
    return { clean: true, blockingFiles: [], message: '' };
  }

  const changedFiles = parsePortcelainPaths(status.output);

  const autoFiles = changedFiles.filter((f) => isAutoCommittable(f));
  const blockingFiles = changedFiles.filter((f) => !isAutoCommittable(f));

  if (autoFiles.length > 0 && blockingFiles.length === 0) {
    for (const f of autoFiles) {
      const safePath = f.replace(/'/g, "'\\''");
      await runGitCommand(`git add -- '${safePath}'`, 'resolveUncommitted-auto-add');
    }
    const commitResult = await runGitCommand(
      `git commit -m '[auto] workflow artifacts before branch switch'`,
      'resolveUncommitted-auto-commit'
    );
    if (commitResult.success) {
      return {
        clean: true,
        stashedWorkflowArtifacts: false,
        blockingFiles: [],
        message:
          'Committed workflow artifacts (.cursor, .project-manager, audit reports) on current branch before switch.',
        autoCommittedPaths: [...autoFiles],
      };
    }
    await runGitCommand('git reset HEAD -- .', 'resolveUncommitted-auto-reset');
    const stashResult = await runGitCommand(
      `git stash push -m "workflow artifacts (non-blocking)" -- ${WORKFLOW_ARTIFACT_STASH_PATHS}`,
      'resolveUncommitted-stash-workflow'
    );
    if (!stashResult.success) {
      return {
        clean: false,
        blockingFiles: autoFiles,
        message: `Failed to commit or stash workflow artifacts: ${stashResult.error || stashResult.output}`,
      };
    }
    return {
      clean: true,
      stashedWorkflowArtifacts: true,
      blockingFiles: [],
      message:
        'Could not commit workflow artifacts; stashed them instead. ' +
        'They will be restored automatically after checkout.',
    };
  }

  if (blockingFiles.length > 0) {
    const currentBranch = theirBranch != null ? await getCurrentBranch() : null;
    const blockBecauseOnTheirBranch =
      theirBranch != null && currentBranch != null && currentBranch === theirBranch;

    if (blockBecauseOnTheirBranch || theirBranch == null) {
      return {
        clean: false,
        blockingFiles,
        message: `Uncommitted changes in: ${blockingFiles.join(', ')}`,
      };
    }

    let mixedAutoCommittedPaths: string[] | undefined;
    if (autoFiles.length > 0) {
      for (const f of autoFiles) {
        const safePath = f.replace(/'/g, "'\\''");
        await runGitCommand(`git add -- '${safePath}'`, 'resolveUncommitted-auto-add-mixed');
      }
      const commitWorkflow = await runGitCommand(
        `git commit -m '[auto] workflow artifacts before branch switch'`,
        'resolveUncommitted-auto-commit-mixed'
      );
      if (commitWorkflow.success) {
        mixedAutoCommittedPaths = [...autoFiles];
      } else {
        await runGitCommand('git reset HEAD -- .', 'resolveUncommitted-auto-reset-mixed');
      }
    }

    const blockingPathsSafe = blockingFiles.map((p) => `'${p.replace(/'/g, "'\\''")}'`).join(' ');
    const stashBlockingResult = await runGitCommand(
      `git stash push -u -m "uncommitted (other branch)" -- ${blockingPathsSafe}`,
      'resolveUncommitted-stash-blocking'
    );
    if (!stashBlockingResult.success) {
      return {
        clean: false,
        blockingFiles,
        message: `Failed to stash uncommitted (other branch): ${stashBlockingResult.error || stashBlockingResult.output}`,
      };
    }

    return {
      clean: true,
      stashedWorkflowArtifacts: false,
      stashedBlockingFiles: true,
      blockingFiles: [],
      message:
        'Uncommitted work is on another branch; stashed it so we can switch to the command branch. ' +
        'Apply the "uncommitted (other branch)" stash on that branch when you switch back.',
      autoCommittedPaths: mixedAutoCommittedPaths,
    };
  }

  return { clean: true, blockingFiles: [], message: '' };
}

interface EnsureOnBranchResult {
  success: boolean;
  output: string;
  stashedBlockingFiles?: boolean;
}

async function listBranchesByPrefixForEnsure(prefix: string): Promise<string[]> {
  const pattern = `${prefix}*`;
  const result = await runGitCommand(`git branch --list "${pattern}"`, 'listBranchesByPrefix-ensure');
  if (!result.success || !result.output.trim()) return [];
  return result.output
    .split('\n')
    .map((line) => line.replace(/^\*\s*/, '').trim())
    .filter(Boolean);
}

async function ensureOnBranch(expectedBranch: string): Promise<EnsureOnBranchResult> {
  let resolvedBranch = expectedBranch;
  if (!(await branchExists(resolvedBranch))) {
    const prefixMatches = await listBranchesByPrefixForEnsure(resolvedBranch);
    if (prefixMatches.length >= 1) resolvedBranch = prefixMatches[0];
  }

  const uncommitted = await resolveUncommittedBeforeCheckout(resolvedBranch);
  if (!uncommitted.clean) {
    const fileList =
      uncommitted.blockingFiles.length > 0 ? ` Blocking files: ${uncommitted.blockingFiles.join(', ')}.` : '';
    return { success: false, output: uncommitted.message + fileList };
  }
  const needStashPop = uncommitted.stashedWorkflowArtifacts === true;
  const stashedBlockingFiles = uncommitted.stashedBlockingFiles === true;
  const checkoutResult = await runGitCommand(`git checkout ${resolvedBranch}`, 'ensureOnBranch-checkout');
  if (!checkoutResult.success) {
    if (needStashPop) await runGitCommand('git stash pop', 'ensureOnBranch-stash-pop');
    return {
      success: false,
      output: `Failed to checkout ${expectedBranch}: ${checkoutResult.error || checkoutResult.output}`,
    };
  }
  if (needStashPop) {
    const popResult = await runGitCommand('git stash pop', 'ensureOnBranch-stash-pop');
    if (!popResult.success) {
      const recovery = await recoverFromFailedStashPop('ensureOnBranch');
      return {
        success: true,
        output: `Switched to ${expectedBranch}. ${recovery.detail}`,
      };
    }
  }
  return {
    success: true,
    output: `Switched to expected branch: ${expectedBranch}.`,
    stashedBlockingFiles: stashedBlockingFiles || undefined,
  };
}

import type { CommitUncommittedOptions } from './git-contract';

export async function commitUncommittedNonCursor(
  commitMessage: string,
  options?: CommitUncommittedOptions
): Promise<{ committed: boolean; success: boolean; output: string }> {
  const allowedPrefixes = options?.allowedPrefixes ?? [...DEFAULT_ALLOWED_COMMIT_PREFIXES];

  let carriedFromBranch: string | undefined;
  if (options?.expectedBranch != null) {
    const current = await getCurrentBranch();
    if (current == null) {
      return {
        committed: false,
        success: false,
        output: 'Cannot determine current git branch (detached HEAD or not a git repo).',
      };
    }
    if (current !== options.expectedBranch) {
      carriedFromBranch = current;
      const ensureResult = await ensureOnBranch(options.expectedBranch);
      if (!ensureResult.success) {
        return { committed: false, success: false, output: ensureResult.output };
      }
      if (ensureResult.stashedBlockingFiles) {
        const topStash = await runGitCommand('git stash list -1', 'commitUncommitted-stash-list');
        const topMessage = topStash.success && topStash.output ? topStash.output : '';
        if (!topMessage.includes('uncommitted (other branch)')) {
          console.warn(
            '[working-tree-policy] Expected top stash to be "uncommitted (other branch)"; skipping pop. Message:',
            topMessage.trim() || '(none)'
          );
          return {
            committed: false,
            success: false,
            output: `Source code was stashed before branch switch but top stash does not match "uncommitted (other branch)". Your changes may be in \`git stash list\`. Apply manually with \`git stash pop\` if correct.`,
          };
        }
        const popResult = await runGitCommand('git stash pop', 'commitUncommitted-stash-pop');
        if (!popResult.success) {
          const recovery = await recoverFromFailedStashPop('commitUncommitted');
          if (recovery.recovered) {
            console.warn(`[working-tree-policy] ${recovery.detail}`);
            return {
              committed: false,
              success: false,
              output: `Source code stash pop conflicted on ${options.expectedBranch}. ${recovery.detail} Re-apply your source-branch changes manually if needed.`,
            };
          }
          return {
            committed: false,
            success: false,
            output: `Source code was stashed before branch switch but could not be applied cleanly on ${options.expectedBranch}. Your changes are safe in \`git stash list\`. Apply them manually with \`git stash pop\` after resolving conflicts.`,
          };
        }
      }
    }
  }

  const status = await runGitCommand('git status --porcelain --ignore-submodules=dirty', 'commitUncommitted-status');
  if (!status.success || !status.output.trim()) {
    return { committed: false, success: true, output: '' };
  }

  const entries = parsePortcelainEntries(status.output);

  const unmergedPaths = entries.filter((e) => isUnmergedStatus(e.xy)).map((e) => e.path);
  if (unmergedPaths.length > 0) {
    warnGitOp({
      timestamp: new Date().toISOString(),
      operation: 'commitUncommitted-unmerged',
      command: 'git status --porcelain',
      success: true,
      output: `Skipping ${unmergedPaths.length} unmerged file(s) — resolve conflicts before committing: ${unmergedPaths.join(', ')}`,
    });
  }

  const inScopePaths = entries
    .filter((e) => !isUnmergedStatus(e.xy))
    .map((e) => e.path)
    .filter((p) => {
      if (isNeverCommitPath(p)) return false;
      return allowedPrefixes.some((prefix) => p === prefix || p.startsWith(prefix));
    });

  if (inScopePaths.length === 0) {
    return { committed: false, success: true, output: '' };
  }

  for (const path of inScopePaths) {
    const safePath = path.replace(/'/g, "'\\''");
    const addResult = await runGitCommand(`git add -- '${safePath}'`, 'commitUncommitted-add');
    if (!addResult.success) {
      return {
        committed: false,
        success: false,
        output: `Failed to stage ${path}: ${addResult.error || addResult.output}`,
      };
    }
  }

  const diffStaged = await runGitCommand('git diff --cached --quiet', 'commitUncommitted-diff');
  if (diffStaged.success) {
    return { committed: false, success: true, output: '' };
  }

  const safeMessage = commitMessage.replace(/'/g, "'\\''");
  const commitResult = await runGitCommand(`git commit -m '${safeMessage}'`, 'commitUncommitted-commit');
  let output = commitResult.success
    ? `Committed in-scope changes (${inScopePaths.length} path(s)): ${commitMessage}`
    : `Commit failed: ${commitResult.error || commitResult.output}`;
  if (commitResult.success && carriedFromBranch && options?.expectedBranch) {
    output += `\nCarried uncommitted changes from ${carriedFromBranch} to ${options.expectedBranch} and committed.`;
  }
  return { committed: true, success: commitResult.success, output };
}

/** Exported for tier-branch-manager ensureTierBranch (single entry for pre-checkout). */
export async function resolveUncommittedForCheckout(theirBranch?: string | null): Promise<{
  clean: boolean;
  stashedWorkflowArtifacts?: boolean;
  blockingFiles: string[];
  message: string;
  autoCommittedPaths?: string[];
}> {
  return resolveUncommittedBeforeCheckout(theirBranch);
}
