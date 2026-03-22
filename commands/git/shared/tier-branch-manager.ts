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
import { getCurrentBranch, branchExists, isBranchBasedOn } from './git-manager';
import { runGitCommand, warnGitOp } from './git-logger';
import { createBranch } from '../atomic/create-branch';
import { gitMerge } from '../atomic/merge';
import { gitPush } from '../atomic/push';

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
  /** When true, checkout was blocked by uncommitted changes that need user decision. */
  blockedByUncommitted?: boolean;
  /** File paths that blocked checkout (non-.cursor files needing user decision). */
  uncommittedFiles?: string[];
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

// ─── Internals ───────────────────────────────────────────────────────

const ROOT_BRANCH_NAMES = ['develop', 'main', 'master'];

function isRootBranch(branchName: string): boolean {
  return ROOT_BRANCH_NAMES.includes(branchName);
}

/**
 * List local branches whose names start with the given prefix (e.g. "phase-6.5").
 * Used to resolve short names like phase-6.5 to phase-6.5-rescheduling-flow when scope has a descriptor.
 */
async function listBranchesByPrefix(prefix: string): Promise<string[]> {
  const pattern = `${prefix}*`;
  const result = await runGitCommand(`git branch --list "${pattern}"`, 'listBranchesByPrefix');
  if (!result.success || !result.output.trim()) return [];
  return result.output
    .split('\n')
    .map((line) => line.replace(/^\*\s*/, '').trim())
    .filter(Boolean);
}

// ─── Pre-checkout uncommitted-changes resolver ───────────────────────

interface UncommittedResolution {
  clean: boolean;
  /** True when we stashed workflow artifacts (no commit); caller should pop after checkout. */
  stashedWorkflowArtifacts?: boolean;
  /** True when we stashed blocking (source) files so we could checkout; commitUncommittedNonCursor should pop after checkout to carry changes. */
  stashedBlockingFiles?: boolean;
  /** Non-auto-committable files (need user decision). */
  blockingFiles: string[];
  message: string;
}

/**
 * True if path is .cursor or under .cursor (normalized). Used so we only block
 * on uncommitted non-.cursor files; .cursor submodule/dir changes are excluded.
 */
export function isCursorPath(path: string): boolean {
  const p = path.trim();
  return p === '.cursor' || p === 'cursor' || p.startsWith('.cursor/') || p.startsWith('cursor/');
}

/**
 * True if path is .project-manager or under it. Workflow-generated guides and
 * planning docs live here; we auto-commit them before branch switch so
 * /accepted-proceed is not blocked by the planning docs it just produced.
 */
export function isProjectManagerPath(path: string): boolean {
  const p = path.trim();
  return (
    p === '.project-manager' ||
    p === 'project-manager' ||
    p.startsWith('.project-manager/') ||
    p.startsWith('project-manager/')
  );
}

/**
 * True if path is under client/.audit-reports (or frontend-root/.audit-reports).
 * Audit reports are workflow artifacts; we stash them before branch switch so
 * /accepted-proceed is not blocked.
 */
export function isAuditReportsPath(path: string): boolean {
  const p = path.trim();
  return (
    p.startsWith('client/.audit-reports') ||
    p.startsWith('client/.audit-reports/') ||
    p.startsWith('frontend-root/.audit-reports') ||
    p.startsWith('frontend-root/.audit-reports/')
  );
}

/** Paths we treat as non-blocking: stash before checkout, pop after (no commit). */
export function isAutoCommittable(filePath: string): boolean {
  return (
    isCursorPath(filePath) ||
    isProjectManagerPath(filePath) ||
    isAuditReportsPath(filePath)
  );
}

/**
 * Transient harness state files under .project-manager/ that must never be
 * committed (they are also in .gitignore). Everything else under
 * .project-manager/ (PROJECT_PLAN.md, feature guides, session plans, etc.)
 * is project documentation and should be committed normally.
 */
const TRANSIENT_PM_FILES = [
  '.project-manager/.audit-baseline-log.jsonl',
  '.project-manager/.git-ops-log',
  '.project-manager/.merge-incident-log',
  '.project-manager/.write-log',
  '.project-manager/.tier-scope',
  '.project-manager/.current-feature',
] as const;

function isTransientProjectManagerFile(filePath: string): boolean {
  const p = filePath.trim().replace(/^\.\//, '');
  return TRANSIENT_PM_FILES.some(
    (t) => p === t || p === t.replace(/^\./, '')
  );
}

/**
 * Paths we never auto-commit in tier-end.
 * - .cursor/ (synced separately as submodule)
 * - client/.audit-reports/ (generated artifacts)
 * - Transient .project-manager/ dotfiles (.write-log, .tier-scope, etc.)
 *
 * Non-transient .project-manager/ docs (PROJECT_PLAN.md, feature guides,
 * session plans, handoffs) are committable and covered by
 * DEFAULT_ALLOWED_COMMIT_PREFIXES.
 */
export function isNeverCommitPath(filePath: string): boolean {
  if (isCursorPath(filePath)) return true;
  if (isAuditReportsPath(filePath)) return true;
  if (isTransientProjectManagerFile(filePath)) return true;
  return false;
}

/** Default path prefixes for tier-end "commit remaining": app code and project documentation. */
export const DEFAULT_ALLOWED_COMMIT_PREFIXES = ['client/', 'server/', '.project-manager/'] as const;

/** Paths to stash when only workflow artifacts are uncommitted (non-blocking flow). */
const WORKFLOW_ARTIFACT_STASH_PATHS = '.cursor .project-manager client/.audit-reports';

/** Normalize path from git status for classification (strip leading ./ and surrounding quotes). */
function normalizeStatusPath(path: string): string {
  let p = path.trim();
  if (p.startsWith('./')) p = p.slice(2);
  if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
  p = p.trim();
  // WHY: Some porcelain lines collapse Y + separator so substring(3) ate the leading dot; recover workflow root.
  if (p.startsWith('project-manager/') || p === 'project-manager') {
    p = `.${p}`;
  }
  return p;
}

interface PortcelainEntry {
  /** Two-character XY status code (e.g. ' M', 'UU', '??', 'A '). */
  xy: string;
  path: string;
}

/**
 * True when the two-character XY status contains 'U' (unmerged file).
 * Unmerged statuses: UU (both modified), UA, AU, DU, UD, AA, DD.
 * Git uses 'U' in X or Y to mark unmerged; AA and DD are also unmerged.
 */
function isUnmergedStatus(xy: string): boolean {
  return xy.includes('U') || xy === 'AA' || xy === 'DD';
}

/**
 * Parse `git status --porcelain` output into entries preserving XY status codes.
 *
 * Porcelain v1 format: `XY PATH` — two status chars (X=index, Y=working tree)
 * followed by a space, then the path. Renames add ` -> NEW` after the original.
 *
 * Previous code used `output.trim().split('\n')` + `slice(3)` which **corrupted
 * dotfile paths** (e.g. `.project-manager/`) because `trim()` strips the leading
 * space when X is blank, making `slice(3)` eat the dot.
 *
 * PATTERN: Prefer `^(.)(.)\\s+(.*)$` so path starts after XY and whitespace; avoids
 * `substring(3)` eating `.` when the line is `M .file` (only one space before path).
 */
function parsePortcelainEntries(porcelainOutput: string): PortcelainEntry[] {
  if (!porcelainOutput) return [];
  return porcelainOutput
    .split('\n')
    .filter(line => line.length >= 4)
    .map(line => {
      const m = line.match(/^(.)(.)\s+(.*)$/);
      if (m?.[1] != null && m[2] != null && m[3] != null) {
        const xy = m[1] + m[2];
        const pathPart = m[3];
        const arrowIdx = pathPart.indexOf(' -> ');
        const resolved = arrowIdx >= 0
          ? normalizeStatusPath(pathPart.substring(arrowIdx + 4))
          : normalizeStatusPath(pathPart);
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
    .filter(e => e.path.length > 0);
}

/** Thin wrapper: returns only the file paths (no status codes). */
function parsePortcelainPaths(porcelainOutput: string): string[] {
  return parsePortcelainEntries(porcelainOutput).map(e => e.path);
}

/**
 * Recover from a failed `git stash pop` by resetting unmerged (conflicted) files
 * to HEAD and dropping the broken stash. Returns a description of what was done.
 *
 * After a failed stash pop, git leaves conflict markers in affected files and
 * keeps the stash entry intact. This helper:
 *   1. Lists unmerged files via `git diff --name-only --diff-filter=U`
 *   2. For each, runs `git checkout HEAD -- <path>` (takes the branch version)
 *   3. Resets any remaining unstaged leftovers from the partial pop
 *   4. Drops the stash that caused the conflict
 */
async function recoverFromFailedStashPop(
  opLabel: string
): Promise<{ recovered: boolean; detail: string }> {
  const unmerged = await runGitCommand(
    'git diff --name-only --diff-filter=U',
    `${opLabel}-listUnmerged`
  );

  const unmergedPaths = unmerged.success && unmerged.output.trim()
    ? unmerged.output.trim().split('\n').filter(Boolean)
    : [];

  if (unmergedPaths.length > 0) {
    for (const p of unmergedPaths) {
      const safePath = p.replace(/'/g, "'\\''");
      await runGitCommand(`git checkout HEAD -- '${safePath}'`, `${opLabel}-resetUnmerged`);
    }
  }

  await runGitCommand('git checkout -- .', `${opLabel}-cleanPartialPop`);
  await runGitCommand('git stash drop', `${opLabel}-dropConflictedStash`);

  const detail = unmergedPaths.length > 0
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

/**
 * Check for uncommitted changes and resolve them before checkout.
 *
 * When theirBranch is provided (target for start, expected for end):
 * - Block only when current branch === theirBranch and there are non-workflow uncommitted files.
 * - When current !== theirBranch and there are non-workflow files: stash them ("uncommitted (other branch)"),
 *   then stash workflow artifacts if any; do not block. After checkout, pop once to restore workflow only.
 *
 * When theirBranch is not provided: block on any non-workflow uncommitted files (legacy behavior).
 *
 * Resolution:
 * - No changes → clean
 * - Only workflow artifacts → commit them on current branch (no stash, no pop, no conflict markers)
 * - Blocking files and (no theirBranch or current === theirBranch) → return unresolved
 * - Blocking files and theirBranch and current !== theirBranch → commit workflow, stash blocking only; clean
 */
async function resolveUncommittedBeforeCheckout(
  theirBranch?: string | null
): Promise<UncommittedResolution> {
  const status = await runGitCommand('git status --porcelain --ignore-submodules=dirty', 'resolveUncommitted-status');
  if (!status.success || !status.output.trim()) {
    return { clean: true, blockingFiles: [], message: '' };
  }

  const changedFiles = parsePortcelainPaths(status.output);

  const autoFiles = changedFiles.filter((f) => isAutoCommittable(f));
  const blockingFiles = changedFiles.filter((f) => !isAutoCommittable(f));

  // Only workflow artifacts uncommitted: commit on current branch (avoids stash-pop conflicts)
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
        message: 'Committed workflow artifacts (.cursor, .project-manager, audit reports) on current branch before switch.',
      };
    }
    // Commit failed — fallback to stash so the checkout can still proceed
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

  // Non-workflow (blocking) files present
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

    // current !== theirBranch: commit workflow artifacts, then stash blocking files
    if (autoFiles.length > 0) {
      for (const f of autoFiles) {
        const safePath = f.replace(/'/g, "'\\''");
        await runGitCommand(`git add -- '${safePath}'`, 'resolveUncommitted-auto-add-mixed');
      }
      const commitWorkflow = await runGitCommand(
        `git commit -m '[auto] workflow artifacts before branch switch'`,
        'resolveUncommitted-auto-commit-mixed'
      );
      if (!commitWorkflow.success) {
        await runGitCommand('git reset HEAD -- .', 'resolveUncommitted-auto-reset-mixed');
      }
    }

    const blockingPathsSafe = blockingFiles
      .map((p) => `'${p.replace(/'/g, "'\\''")}'`)
      .join(' ');
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
    };
  }

  return { clean: true, blockingFiles: [], message: '' };
}

/** Result of ensureOnBranch: success, message, and whether blocking files were stashed (so caller can pop to carry changes). */
interface EnsureOnBranchResult {
  success: boolean;
  output: string;
  stashedBlockingFiles?: boolean;
}

/**
 * Ensure working tree is on expectedBranch. Stashes only workflow artifacts if needed, then checkout, then stash pop.
 * Used by commitUncommittedNonCursor when current branch does not match expected (e.g. tier-end on wrong branch).
 */
async function ensureOnBranch(expectedBranch: string): Promise<EnsureOnBranchResult> {
  let resolvedBranch = expectedBranch;
  if (!(await branchExists(resolvedBranch))) {
    const prefixMatches = await listBranchesByPrefix(resolvedBranch);
    if (prefixMatches.length >= 1) resolvedBranch = prefixMatches[0];
  }

  const uncommitted = await resolveUncommittedBeforeCheckout(resolvedBranch);
  if (!uncommitted.clean) {
    const fileList = uncommitted.blockingFiles.length > 0
      ? ` Blocking files: ${uncommitted.blockingFiles.join(', ')}.`
      : '';
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

export interface CommitUncommittedOptions {
  /** If set, commit is aborted when current branch does not match (wrong branch). */
  expectedBranch?: string;
  /** Only paths under these prefixes are staged; default is frontend-root/ and server/. Never-commit paths are always excluded. */
  allowedPrefixes?: string[];
}

/**
 * Commit only in-scope, touched files (no .cursor, .project-manager, or audit reports).
 * Optionally verifies current branch matches expectedBranch before committing.
 * Use from tier-end before runGit so the final push includes this commit.
 */
export async function commitUncommittedNonCursor(
  commitMessage: string,
  options?: CommitUncommittedOptions
): Promise<{ committed: boolean; success: boolean; output: string }> {
  const allowedPrefixes = options?.allowedPrefixes ?? [...DEFAULT_ALLOWED_COMMIT_PREFIXES];

  let carriedFromBranch: string | undefined;
  if (options?.expectedBranch != null) {
    const current = await getCurrentBranch();
    if (current !== options.expectedBranch) {
      carriedFromBranch = current;
      const ensureResult = await ensureOnBranch(options.expectedBranch);
      if (!ensureResult.success) {
        return { committed: false, success: false, output: ensureResult.output };
      }
      // If we stashed blocking (source) files to switch, pop them on the target branch so we can commit.
      if (ensureResult.stashedBlockingFiles) {
        const topStash = await runGitCommand('git stash list -1', 'commitUncommitted-stash-list');
        const topMessage = topStash.success && topStash.output ? topStash.output : '';
        if (!topMessage.includes('uncommitted (other branch)')) {
          console.warn(
            '[tier-branch-manager] Expected top stash to be "uncommitted (other branch)"; skipping pop. Message:',
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
            console.warn(`[tier-branch-manager] ${recovery.detail}`);
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
      // Fall through to status/stage/commit (now on expected branch, with carried changes if any).
    }
  }

  const status = await runGitCommand('git status --porcelain --ignore-submodules=dirty', 'commitUncommitted-status');
  if (!status.success || !status.output.trim()) {
    return { committed: false, success: true, output: '' };
  }

  const entries = parsePortcelainEntries(status.output);

  const unmergedPaths = entries.filter(e => isUnmergedStatus(e.xy)).map(e => e.path);
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
    .filter(e => !isUnmergedStatus(e.xy))
    .map(e => e.path)
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

/**
 * Tier that owns the **leaf** git branch for this workflow (feature / phase / session).
 * Task-end resolves to **session** because tasks have no branch; the session branch is the commit target.
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

/**
 * Return the expected branch name for the given tier (leaf of branch chain).
 * Resolves slug-style names via prefix matching (e.g. phase-6.9 → phase-6.9-availability-step-mini-wizard).
 * Used before commit to verify we are on the correct branch. Returns null for tiers with no branch (e.g. task).
 */
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
    if (prefixMatches.length >= 1) branchName = prefixMatches[0];
  }
  return branchName;
}

// ─── Scope Coherence ──────────────────────────────────────────────────

/**
 * Scope coherence check. Always coherent (scope derived from context per command).
 */
export async function checkScopeCoherence(
  context: WorkflowCommandContext
): Promise<ScopeCoherenceResult> {
  const commandFeature = context.feature.name;
  return {
    coherent: true,
    configFeature: commandFeature,
    branchFeature: null,
    message: `Scope derived from context: ${commandFeature}`,
  };
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
    /** When true (default), pull non-root ancestor branches after checkout (multi-machine sync). */
    syncRemote?: boolean;
  }
): Promise<EnsureTierBranchResult> {
  const messages: string[] = [];
  const createIfMissing = options?.createIfMissing ?? true;
  const pullRoot = options?.pullRoot ?? false;
  const syncRemote = options?.syncRemote ?? true;

  // Step 0a: Feature coherence
  const coherence = await checkScopeCoherence(context);
  if (!coherence.coherent) {
    return {
      success: false,
      messages: [coherence.message],
      finalBranch: await getCurrentBranch(),
      chain: [],
    };
  }

  // Step 0b: Build chain so we know target branch for branch-aware uncommitted resolution
  const chain = buildBranchChain(config, tierId, context);
  if (chain.length === 0) {
    return {
      success: true,
      messages: ['Tier has no branch; inheriting current branch.'],
      finalBranch: await getCurrentBranch(),
      chain,
    };
  }

  const targetLink = chain[chain.length - 1];
  if (!(await branchExists(targetLink.branchName))) {
    const prefixMatches = await listBranchesByPrefix(targetLink.branchName);
    if (prefixMatches.length === 1) targetLink.branchName = prefixMatches[0];
    else if (prefixMatches.length > 1) targetLink.branchName = prefixMatches[0];
  }
  const targetBranch = targetLink.branchName;

  // Step 0c: Resolve uncommitted: block only when current === target and there are non-workflow files
  const uncommitted = await resolveUncommittedBeforeCheckout(targetBranch);
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
      finalBranch: await getCurrentBranch(),
      chain: [],
      blockedByUncommitted: true,
      uncommittedFiles: uncommitted.blockingFiles,
    };
  }

  // Walk ancestors (everything except the last = target)
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
        const pullResult = await runGitCommand(`git checkout ${parentBranch} && git pull origin ${parentBranch}`, 'ensureTierBranch-pullRoot');
        if (pullResult.success) {
          messages.push(`Pulled latest ${parentBranch}.`);
        } else {
          messages.push(`Warning: could not pull ${parentBranch}: ${pullResult.error || pullResult.output}`);
        }
      }
    }

    // Verify ancestor branch exists (exact or prefix match for descriptor-style names)
    let ancestorBranch = link.branchName;
    if (!(await branchExists(ancestorBranch))) {
      const prefixMatches = await listBranchesByPrefix(link.branchName);
      if (prefixMatches.length === 1) {
        ancestorBranch = prefixMatches[0];
        link.branchName = ancestorBranch;
      } else if (prefixMatches.length > 1) {
        ancestorBranch = prefixMatches[0];
        link.branchName = ancestorBranch;
        messages.push(`Multiple branches match ${link.branchName}; using ${ancestorBranch}.`);
      } else {
        messages.push(
          `Ancestor branch ${link.branchName} (${link.tier}) does not exist. ` +
          `Run /${link.tier}-start to create it first.`
        );
        return { success: false, messages, finalBranch: await getCurrentBranch(), chain };
      }
    }

    // Verify ancestor is based on its parent; auto-rebase if not (e.g. parent got new commits from a sibling merge)
    const resolvedParent = i > 0 ? chain[i - 1].branchName : parentBranch;
    if (resolvedParent && !isRootBranch(resolvedParent) && (await branchExists(resolvedParent))) {
      const isBasedOn = await isBranchBasedOn(link.branchName, resolvedParent);
      if (!isBasedOn) {
        const preBranch = await getCurrentBranch();
        if (preBranch !== link.branchName) {
          const coResult = await runGitCommand(`git checkout ${link.branchName}`, 'ensureTierBranch-checkout-for-rebase');
          if (!coResult.success) {
            messages.push(
              `Branch ${link.branchName} (${link.tier}) is not based on ${resolvedParent} ` +
              `and could not checkout for auto-rebase: ${coResult.error || coResult.output}. ` +
              `Resolve manually: git checkout ${link.branchName} && git rebase ${resolvedParent}`
            );
            return { success: false, messages, finalBranch: await getCurrentBranch(), chain };
          }
        }
        const rebaseResult = await runGitCommand(`git rebase ${resolvedParent}`, 'ensureTierBranch-auto-rebase');
        if (!rebaseResult.success) {
          await runGitCommand('git rebase --abort', 'ensureTierBranch-rebase-abort');
          messages.push(
            `Branch ${link.branchName} (${link.tier}) is not based on ${resolvedParent} ` +
            `and auto-rebase failed (conflicts). ` +
            `Resolve manually: git checkout ${link.branchName} && git rebase ${resolvedParent}`
          );
          return { success: false, messages, finalBranch: await getCurrentBranch(), chain };
        }
        messages.push(`Auto-rebased ${link.branchName} onto ${resolvedParent}.`);
      }
    }

    // Checkout ancestor (needed so we can create/verify next level from correct base)
    const currentBranch = await getCurrentBranch();
    if (currentBranch !== link.branchName) {
      const checkoutResult = await runGitCommand(`git checkout ${link.branchName}`, 'ensureTierBranch-checkout-ancestor');
      if (!checkoutResult.success) {
        messages.push(`Could not checkout ${link.tier} branch ${link.branchName}: ${checkoutResult.error || checkoutResult.output}`);
        return { success: false, messages, finalBranch: currentBranch, chain };
      }
      messages.push(`Checked out ${link.tier} branch: ${link.branchName}`);
    }
    if (syncRemote && !link.isRoot) {
      const pullResult = await runGitCommand(
        `git pull origin ${link.branchName}`,
        'ensureTierBranch-pullAncestor'
      );
      if (pullResult.success) {
        messages.push(`Pulled latest ${link.branchName} from remote.`);
      } else {
        messages.push(`Warning: could not pull ${link.branchName}: ${pullResult.error || pullResult.output}`);
      }
      // Re-check ancestry after pull; pulling can introduce old history that breaks the relationship
      if (resolvedParent && !isRootBranch(resolvedParent) && (await branchExists(resolvedParent))) {
        const stillBasedOn = await isBranchBasedOn(link.branchName, resolvedParent);
        if (!stillBasedOn) {
          const postPullRebase = await runGitCommand(`git rebase ${resolvedParent}`, 'ensureTierBranch-post-pull-rebase');
          if (!postPullRebase.success) {
            await runGitCommand('git rebase --abort', 'ensureTierBranch-post-pull-rebase-abort');
            messages.push(
              `Pulling ${link.branchName} broke ancestry with ${resolvedParent} and auto-rebase failed. ` +
              `Resolve manually: git rebase ${resolvedParent}`
            );
            return { success: false, messages, finalBranch: await getCurrentBranch(), chain };
          }
          messages.push(`Post-pull auto-rebase: ${link.branchName} onto ${resolvedParent}.`);
        }
      }
    }
  }

  // Step 3: Handle target branch (the leaf)
  const parentOfTarget = chain.length >= 2 ? chain[chain.length - 2].branchName : targetLink.parentBranchName;

  // Ensure we're on the parent before create/switch
  if (parentOfTarget) {
    const currentBranch = await getCurrentBranch();
    if (currentBranch !== parentOfTarget) {
      const checkoutParent = await runGitCommand(`git checkout ${parentOfTarget}`, 'ensureTierBranch-checkout-parent');
      if (!checkoutParent.success) {
        messages.push(`Could not checkout parent branch ${parentOfTarget} before creating target: ${checkoutParent.error || checkoutParent.output}`);
        return { success: false, messages, finalBranch: currentBranch, chain };
      }
    }
    // Feature-start: pull latest from root before creating feature branch
    if (pullRoot && isRootBranch(parentOfTarget)) {
      const pullResult = await runGitCommand(`git pull origin ${parentOfTarget}`, 'ensureTierBranch-pull');
      if (pullResult.success) {
        messages.push(`Pulled latest ${parentOfTarget}.`);
      } else {
        messages.push(`Warning: could not pull ${parentOfTarget}: ${pullResult.error || pullResult.output}`);
      }
    }
    // Phase/session-start: pull latest non-root parent before creating child branch so the new branch includes latest harness/feature updates
    if (
      createIfMissing &&
      !isRootBranch(parentOfTarget) &&
      (await branchExists(parentOfTarget)) &&
      !(await branchExists(targetLink.branchName))
    ) {
      const pullResult = await runGitCommand(
        `git pull origin ${parentOfTarget}`,
        'ensureTierBranch-pullParentBeforeCreate'
      );
      if (pullResult.success) {
        messages.push(`Pulled latest ${parentOfTarget} before creating ${targetLink.tier} branch.`);
      } else {
        messages.push(`Warning: could not pull ${parentOfTarget}: ${pullResult.error || pullResult.output}`);
      }
    }
  }

  if (await branchExists(targetLink.branchName)) {
    // Target exists - checkout first, then verify based-on parent (auto-rebase if not)
    const checkoutTarget = await runGitCommand(`git checkout ${targetLink.branchName}`, 'ensureTierBranch-checkout-target');
    if (!checkoutTarget.success) {
      messages.push(`Could not switch to existing branch ${targetLink.branchName}: ${checkoutTarget.error || checkoutTarget.output}`);
      return { success: false, messages, finalBranch: await getCurrentBranch(), chain };
    }
    messages.push(`Switched to existing ${targetLink.tier} branch: ${targetLink.branchName}`);

    if (parentOfTarget && (await branchExists(parentOfTarget)) && !isRootBranch(parentOfTarget)) {
      const isBasedOn = await isBranchBasedOn(targetLink.branchName, parentOfTarget);
      if (!isBasedOn) {
        messages.push(
          `Target branch ${targetLink.branchName} (${targetLink.tier}) is not based on ${parentOfTarget}. ` +
            `Attempting auto-rebase to bring in latest parent updates...`
        );
        const rebaseResult = await runGitCommand(`git rebase ${parentOfTarget}`, 'ensureTierBranch-auto-rebase-target');
        if (!rebaseResult.success) {
          await runGitCommand('git rebase --abort', 'ensureTierBranch-rebase-abort-target');
          messages.push(
            `Auto-rebase of ${targetLink.branchName} onto ${parentOfTarget} failed (conflicts). ` +
              `Resolve manually: git checkout ${targetLink.branchName} && git rebase ${parentOfTarget}`
          );
          return { success: false, messages, finalBranch: await getCurrentBranch(), chain };
        }
        messages.push(`Auto-rebased ${targetLink.branchName} onto ${parentOfTarget}.`);
      }
    }
  } else if (createIfMissing) {
    // Target does not exist - create from current (parent) branch
    const result = await createBranch(targetLink.branchName);
    if (!result.success) {
      messages.push(`Could not create ${targetLink.tier} branch ${targetLink.branchName}: ${result.output}`);
      return { success: false, messages, finalBranch: await getCurrentBranch(), chain };
    }
    messages.push(`Created ${targetLink.tier} branch: ${targetLink.branchName}`);

    // Push new branch to remote so tier-end pull/merge can find it
    const pushNew = await runGitCommand(
      `git push -u origin ${targetLink.branchName}`,
      'ensureTierBranch-pushNewBranch'
    );
    if (pushNew.success) {
      messages.push(`Pushed new branch ${targetLink.branchName} to remote.`);
    } else {
      messages.push(`Warning: could not push new branch to remote: ${pushNew.error || pushNew.output}`);
    }

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

  // If we stashed workflow artifacts before checkout, restore them on the target branch
  if (needStashPop) {
    const popResult = await runGitCommand('git stash pop', 'ensureTierBranch-stash-pop');
    if (popResult.success) {
      messages.push(
        'Restored stashed workflow artifacts (.cursor, .project-manager, audit reports) on current branch. Planning docs and other .project-manager files are back in the working tree.'
      );
    } else {
      const recovery = await recoverFromFailedStashPop('ensureTierBranch');
      messages.push(
        `Stash pop conflicted after branch switch. ${recovery.detail}`
      );
    }
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
 * Merge a tier's branch into its parent branch (await-then-merge pattern).
 *
 * 1. Await any in-flight background work (audit prewarm, background audit runner).
 * 2. Final comprehensive commit — git add -A && git commit (no file exclusions).
 * 3. Assert clean tree; log to .merge-incident-log if still dirty.
 * 4. Merge with skipStash: true (no stash/pop — any remaining dirty state is a bug).
 * 5. Optionally delete tier branch and/or push parent.
 */
export async function mergeTierBranch(
  config: TierConfig,
  tierId: string,
  context: WorkflowCommandContext,
  options?: {
    deleteBranch?: boolean;
    push?: boolean;
    /** Awaited before the final commit so all async writes land on disk first. */
    auditPrewarmPromise?: Promise<void>;
    /** When true (default), pull parent branch from origin before merge (multi-machine sync). */
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
    return { success: false, messages: [`No parent branch defined for ${config.name} tier.`], mergedInto: '', deletedBranch: false };
  }

  // Resolve tier and parent by prefix when exact name does not exist (descriptor-style names)
  if (!(await branchExists(tierBranch))) {
    const tierMatches = await listBranchesByPrefix(tierBranch);
    if (tierMatches.length >= 1) tierBranch = tierMatches[0];
  }
  if (!isRootBranch(parentBranch) && !(await branchExists(parentBranch))) {
    const parentMatches = await listBranchesByPrefix(parentBranch);
    if (parentMatches.length >= 1) parentBranch = parentMatches[0];
  }

  const currentBranch = await getCurrentBranch();
  if (currentBranch !== tierBranch && !currentBranch.startsWith(tierBranch + '-')) {
    messages.push(`Not on ${config.name} branch (current: ${currentBranch}). Skipping merge.`);
    return { success: true, messages, mergedInto: '', deletedBranch: false };
  }

  // ── Step 1: Await background work ─────────────────────────────────
  if (options?.auditPrewarmPromise) {
    try {
      await options.auditPrewarmPromise;
      messages.push('Awaited audit prewarm before merge.');
    } catch (err) {
      messages.push(`Audit prewarm failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Step 2: Final selective commit (skip workflow artifacts and unmerged files) ─────
  const preMergeStatus = await runGitCommand('git status --porcelain --ignore-submodules=dirty', 'mergeTierBranch-preStatus');
  if (preMergeStatus.success && preMergeStatus.output.trim()) {
    const preMergeEntries = parsePortcelainEntries(preMergeStatus.output);
    const unmergedPreMerge = preMergeEntries.filter(e => isUnmergedStatus(e.xy));
    if (unmergedPreMerge.length > 0) {
      warnGitOp({
        timestamp: new Date().toISOString(),
        operation: 'mergeTierBranch-unmerged',
        command: 'git status --porcelain',
        success: true,
        output: `Skipping ${unmergedPreMerge.length} unmerged file(s) in pre-merge commit: ${unmergedPreMerge.map(e => e.path).join(', ')}`,
      });
    }
    const pathsToStage = preMergeEntries
      .filter(e => !isUnmergedStatus(e.xy))
      .map(e => e.path)
      .filter(p => !isNeverCommitPath(p));

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
        messages.push(`Pre-merge commit note: ${preMergeCommit.error || preMergeCommit.output}`);
      }
    }
  }

  // ── Step 3: Assert clean tree ─────────────────────────────────────
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
    messages.push('WARNING: working tree not clean after final commit — see .git-ops-log.');
  }

  // ── Step 4: Merge — child branch wins text conflicts, auto-resolve .cursor submodule
  const syncRemote = options?.syncRemote ?? true;
  const mergeResult = await gitMerge({
    sourceBranch: tierBranch,
    targetBranch: parentBranch,
    skipStash: true,
    pullBeforeMerge: syncRemote,
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
    return { success: false, messages, mergedInto: parentBranch, deletedBranch: false };
  }
  messages.push(`Merged ${tierBranch} into ${parentBranch}.`);

  // Delete
  let deleted = false;
  if (deleteBranch) {
    const safeTierBranch = tierBranch.replace(/'/g, "'\\''");
    const deleteResult = await runGitCommand(`git branch -d '${safeTierBranch}'`, 'mergeTierBranch-delete');
    deleted = deleteResult.success;
    messages.push(deleted
      ? `Deleted branch: ${tierBranch}`
      : `Could not delete branch (non-critical): ${deleteResult.error || deleteResult.output}`
    );
    if (deleted) {
      const remoteDel = await runGitCommand(
        `git push origin --delete '${safeTierBranch}'`,
        'mergeTierBranch-delete-remote'
      );
      messages.push(
        remoteDel.success
          ? `Deleted remote branch: ${tierBranch}`
          : `Remote branch delete (non-critical): ${remoteDel.error || remoteDel.output}`
      );
    }
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

// ─── mergeChildBranches (for phase-end: merge session branches into phase) ───

export interface MergeChildBranchesResult {
  merged: string[];
  failed: string[];
  messages: string[];
}

/**
 * List branches matching pattern (e.g. "session-6.10*"), merge each into targetBranch
 * with skipStash: true, child-wins text conflicts, submodule auto-resolve, optional pull.
 * Optionally delete each merged branch. Used by phase-end.
 */
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
