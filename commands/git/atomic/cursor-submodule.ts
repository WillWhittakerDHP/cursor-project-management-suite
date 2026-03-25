/**
 * Read / commit operations for the `.cursor` git submodule (harness-repair canonical path).
 * All subprocess calls go through runGitCommand with cwd = submodule root when inside the child repo.
 */

import { access } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';
import { runGitCommand } from '../shared/git-logger';

export function getCursorSubmoduleRoot(projectRoot: string = PROJECT_ROOT): string {
  return join(projectRoot, '.cursor');
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * True when `.cursor` appears to be a git work tree (submodule or nested repo).
 */
export async function isCursorSubmoduleRepoAvailable(
  projectRoot: string = PROJECT_ROOT
): Promise<boolean> {
  const cursorRoot = getCursorSubmoduleRoot(projectRoot);
  const gitFile = join(cursorRoot, '.git');
  return pathExists(gitFile);
}

export interface CursorSubmoduleStatusResult {
  available: boolean;
  skipReason?: string;
  /** Porcelain lines from `git status --porcelain` inside `.cursor`, or empty. */
  porcelain: string;
  dirty: boolean;
  /** Current branch name, or `(detached)` when not on a branch, or empty if unknown. */
  branchLabel: string;
  /** Short SHA of HEAD inside submodule when available. */
  headSha?: string;
}

/**
 * Read-only status for `.cursor` (dirty, detached HEAD, missing submodule).
 */
export async function getCursorSubmoduleStatus(
  projectRoot: string = PROJECT_ROOT
): Promise<CursorSubmoduleStatusResult> {
  const cursorRoot = getCursorSubmoduleRoot(projectRoot);
  const ok = await isCursorSubmoduleRepoAvailable(projectRoot);
  if (!ok) {
    return {
      available: false,
      skipReason: '`.cursor` is not a git work tree (no `.cursor/.git`).',
      porcelain: '',
      dirty: false,
      branchLabel: '',
    };
  }

  const st = await runGitCommand('git status --porcelain', 'cursorSubmoduleStatus-porcelain', cursorRoot);
  const porcelain = st.success ? st.output.trimEnd() : '';
  const dirty = porcelain.length > 0;

  const sym = await runGitCommand('git symbolic-ref -q HEAD', 'cursorSubmoduleStatus-branch', cursorRoot);
  let branchLabel = '';
  if (sym.success && sym.output.trim()) {
    const ref = sym.output.trim();
    const short = ref.replace(/^refs\/heads\//, '');
    branchLabel = short || ref;
  } else {
    branchLabel = '(detached)';
  }

  const rev = await runGitCommand('git rev-parse --short HEAD', 'cursorSubmoduleStatus-head', cursorRoot);
  const headSha = rev.success && rev.output.trim() ? rev.output.trim() : undefined;

  return {
    available: true,
    porcelain,
    dirty,
    branchLabel,
    headSha,
  };
}

export interface CommitCursorSubmoduleResult {
  success: boolean;
  output: string;
  /** Submodule HEAD after commit, when success. */
  submoduleSha?: string;
}

/**
 * Stage all, commit inside `.cursor`, then `git add .cursor` on the parent (gitlink only).
 * Does not commit the parent repo.
 */
export async function commitCursorSubmoduleAndStageParentGitlink(params: {
  message: string;
  projectRoot?: string;
}): Promise<CommitCursorSubmoduleResult> {
  const projectRoot = params.projectRoot ?? PROJECT_ROOT;
  const cursorRoot = getCursorSubmoduleRoot(projectRoot);
  const available = await isCursorSubmoduleRepoAvailable(projectRoot);
  if (!available) {
    return { success: false, output: '`.cursor` is not a git work tree; skipped submodule commit.' };
  }

  const stage = await runGitCommand('git add -A', 'cursorSubmoduleCommit-stage', cursorRoot);
  if (!stage.success) {
    return {
      success: false,
      output: `Submodule stage failed: ${stage.error ?? stage.output}`,
    };
  }

  const safe = params.message.replace(/'/g, "'\\''");
  const commit = await runGitCommand(`git commit -m '${safe}'`, 'cursorSubmoduleCommit-commit', cursorRoot);
  if (!commit.success) {
    const combined = `${commit.error ?? ''} ${commit.output ?? ''}`.toLowerCase();
    const nothing =
      combined.includes('nothing to commit') || combined.includes('no changes added to commit');
    if (nothing) {
      return { success: true, output: 'Submodule: nothing to commit (clean).', submoduleSha: undefined };
    }
    return {
      success: false,
      output: `Submodule commit failed: ${commit.error ?? commit.output}`,
    };
  }

  const head = await runGitCommand('git rev-parse --short HEAD', 'cursorSubmoduleCommit-head', cursorRoot);
  const submoduleSha = head.success ? head.output.trim() : undefined;

  const addParent = await runGitCommand('git add .cursor', 'cursorSubmoduleCommit-stageParent', projectRoot);
  if (!addParent.success) {
    return {
      success: false,
      output: `Committed inside .cursor (${submoduleSha ?? 'HEAD'}) but failed to stage parent gitlink: ${addParent.error ?? addParent.output}`,
      submoduleSha,
    };
  }

  return {
    success: true,
    output: `Committed inside .cursor (${submoduleSha ?? 'HEAD'}) and staged parent gitlink.`,
    submoduleSha,
  };
}
