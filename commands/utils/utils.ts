/**
 * Shared utilities for slash commands
 * 
 * ## Deprecated Functions Removed
 * 
 * The following functions were deprecated and have been removed:
 * - `FILE_PATHS` constant - Hardcoded paths for single feature
 * - `getSessionLogPath()` - Hardcoded feature name
 * - `extractMarkdownSection()` - Basic markdown extraction
 * - `parseTaskId()` - Basic ID parsing
 * - `parseSessionId()` - Basic ID parsing
 * - Task IDs: Use WorkflowId.parseTaskId (task = tier below session).
 * 
 * ## Migration Guide
 * 
 * **Path Operations:**
 * Use `WorkflowCommandContext` from `.cursor/commands/utils/command-context`:
 * ```typescript
 * const context = new WorkflowCommandContext('feature-name');
 * const path = context.paths.getSessionLogPath(sessionId);
 * const handoffPath = context.paths.getFeatureHandoffPath();
 * ```
 * 
 * **Markdown Operations:**
 * Use `MarkdownUtils` from `.cursor/commands/utils/markdown-utils`:
 * ```typescript
 * import { MarkdownUtils } from './markdown-utils';
 * const section = MarkdownUtils.extractSection(content, 'Section Title', { includeSubsections: true });
 * ```
 * 
 * **ID Parsing:**
 * Use `WorkflowId` via `WorkflowCommandContext`:
 * ```typescript
 * const context = new WorkflowCommandContext('feature-name');
 * const parsed = context.idUtils.parseTaskId(taskId);
 * const sessionParsed = context.idUtils.parseSessionId(sessionId);
 * ```
 * 
 * See `.cursor/commands/utils/` for utility files.
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import type { ShouldBlockProjectManagerWriteOptions } from './project-manager-write-guard';
import {
  isProjectManagerProtectedPath,
  shouldBlockProjectManagerWrite,
  getCallerFromStack,
  logProjectManagerWrite,
} from './project-manager-write-guard';

export const PROJECT_ROOT = process.cwd();
/** Frontend app root directory (Vue). Use for path construction; must match the actual directory name (e.g. client or frontend-root). */
export const FRONTEND_ROOT = 'client';

/**
 * Read a file from the project root
 */
export async function readProjectFile(filename: string): Promise<string> {
  const filePath = join(PROJECT_ROOT, filename);
  return await readFile(filePath, 'utf-8');
}

/**
 * Write a file to the project root.
 * For paths under .project-manager that are *-planning.md or *-guide.md:
 * - Audit: logs path, timestamp, and caller to stderr (and to .project-manager/.write-log when TIER_LOG_WRITES=1 or when a write is blocked).
 * - Lock: skips the write and logs "BLOCKED overwrite" if the file already exists and is "filled" (no placeholders).
 * Set TIER_LOG_WRITES=1 to capture all protected-path writes in .project-manager/.write-log.
 * Pass options.overwriteForTierEnd: true only for tier-end workflow (e.g. task-end checkbox).
 * @returns true if the file was actually written; false if blocked by the write guard.
 */
export async function writeProjectFile(
  filename: string,
  content: string,
  options?: ShouldBlockProjectManagerWriteOptions
): Promise<boolean> {
  const filePath = join(PROJECT_ROOT, filename);
  if (isProjectManagerProtectedPath(filename)) {
    const caller = getCallerFromStack();
    const blocked = await shouldBlockProjectManagerWrite(PROJECT_ROOT, filename, options);
    if (blocked) {
      logProjectManagerWrite({ path: filename, blocked: true, caller });
      return false;
    }
    logProjectManagerWrite({ path: filename, blocked: false, caller });
  }
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
  return true;
}


/**
 * Get current date in YYYY-MM-DD format
 */
export function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Run a command and return output
 */
export async function runCommand(command: string, cwd?: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      cwd: cwd || PROJECT_ROOT,
      stdio: 'pipe'
    });
    // trimEnd only: full trim() strips a leading space from git porcelain line 1
    // (e.g. ` M path` → `M path`), corrupting XY path parsing in tier-branch-manager.
    return { success: true, output: output.trimEnd() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    return {
      success: false,
      output: error.stdout?.toString() || '',
      error: error.stderr?.toString() || error.message
    };
  }
}

export interface LintGateResult {
  success: boolean;
  output: string;
  /** First N lines of output for display; full exit code comes from success */
  truncatedOutput: string;
}

const LINT_GATE_DISPLAY_LINES = 20;

/**
 * Run vue-tsc --noEmit in client/ and return real exit code.
 * Do not pipe to head in the shell (that would mask exit code). Truncate output in JS for display.
 */
export function runLintGate(projectRoot: string = PROJECT_ROOT): LintGateResult {
  const clientPath = join(projectRoot, FRONTEND_ROOT);
  try {
    const output = execSync('npx vue-tsc --noEmit', {
      encoding: 'utf-8',
      cwd: clientPath,
      stdio: 'pipe'
    });
    const full = (output ?? '').trim();
    const lines = full.split('\n');
    const truncatedOutput = lines.slice(0, LINT_GATE_DISPLAY_LINES).join('\n');
    return { success: true, output: full, truncatedOutput };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    const stdout = error.stdout?.toString() ?? '';
    const stderr = error.stderr?.toString() ?? '';
    const full = [stdout, stderr].filter(Boolean).join('\n').trim();
    const lines = full.split('\n');
    const truncatedOutput = lines.slice(0, LINT_GATE_DISPLAY_LINES).join('\n');
    return { success: false, output: full, truncatedOutput };
  }
}

/** Result of running cleanup with pre- and post-lint verification. */
export interface LintVerifiedResult<TCleanupResult extends { success: boolean; filesModified: number }> {
  /** Null when skippedCleanup is true (pre-cleanup lint failed). */
  cleanupResult: TCleanupResult | null;
  preCleanupLint: LintGateResult;
  postCleanupLint: LintGateResult;
  reverted: boolean;
  /** True when pre-cleanup lint failed; cleanup was not run. */
  skippedCleanup: boolean;
}

/**
 * Run pre-cleanup lint; if it fails, skip cleanup and return skippedCleanup=true.
 * Otherwise run cleanup, then post-cleanup lint; if post fails and files were modified, call revertFn and set reverted=true.
 */
export async function runWithLintVerification<TCleanupResult extends { success: boolean; filesModified: number }>(
  cleanupFn: () => Promise<TCleanupResult>,
  revertFn: () => Promise<void>
): Promise<LintVerifiedResult<TCleanupResult>> {
  const preCleanupLint = runLintGate();
  if (!preCleanupLint.success) {
    return {
      cleanupResult: null,
      preCleanupLint,
      postCleanupLint: preCleanupLint,
      reverted: false,
      skippedCleanup: true
    };
  }
  const cleanupResult = await cleanupFn();
  const postCleanupLint = runLintGate();
  let reverted = false;
  if (!postCleanupLint.success && cleanupResult.filesModified > 0) {
    await revertFn();
    reverted = true;
  }
  return {
    cleanupResult,
    preCleanupLint,
    postCleanupLint,
    reverted,
    skippedCleanup: false
  };
}

