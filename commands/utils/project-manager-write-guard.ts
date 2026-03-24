/**
 * Guard and audit for writes to .project-manager planning docs and guides.
 * - Audit: log every protected write (path, timestamp, caller) to stderr and to .project-manager/.write-log so you can see WHEN/WHY overwrites happen.
 * - Lock: block overwriting files that are already "filled" (no placeholders).
 * Used by writeProjectFile in utils.ts; DocumentManager also uses it for guide writes.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { REQUIRED_GUIDE_SECTIONS, type GuideTier } from '../tiers/shared/guide-required-sections';

export const PROJECT_MANAGER_WRITE_LOG = '.project-manager/.write-log';

/** Paths under .project-manager that we protect (planning docs and guides). */
export function isProjectManagerProtectedPath(filename: string): boolean {
  const n = filename.replace(/\\/g, '/');
  if (!n.includes('.project-manager')) return false;
  return n.endsWith('-planning.md') || n.endsWith('-guide.md');
}

// Placeholders that indicate planning doc not filled (aligned with tier-start-steps.ts).
const PLACEHOLDER_REFINED = '[To be refined during discussion]';
const PLACEHOLDER_TIERDOWN = '[List tierDown units here]';
const TIERDOWN_BULLET_PLACEHOLDERS = [
  '[one line per session in this phase]',
  '[one line per task in this session]',
  '[one line per phase in this feature]',
];
const TASK_PLACEHOLDERS = [
  '[Define explicit coding goal before beginning implementation]',
  '[List files to touch]',
  '[Outline steps before coding]',
  '[Key code shapes or signatures]',
  '[What to verify when done]',
];

/** Must stay aligned with `PLANNING_STORY_PLACEHOLDERS` in `tier-start-steps.ts`. */
const PLANNING_STORY_PLACEHOLDERS = [
  '[Analyze the problem space before planning]',
  '[Describe what changes and why]',
  '[Define acceptance criteria]',
  '[As a ... I want ... so that ...]',
  '[List concrete deliverables]',
];

// Placeholders that indicate guide tierDown blocks not filled (aligned with tier-start-steps.ts).
const GUIDE_TIERDOWN_PLACEHOLDERS = ['[Fill in]', '[To be planned]', '[To be defined]'];

/** Session guide templates use these bracket placeholders; treat as unfilled until replaced (not in GUIDE_TIERDOWN_PLACEHOLDERS). */
const SESSION_GUIDE_STOCK_PLACEHOLDERS = [
  '[Task Name]',
  '[Task goal]',
  '[Brief description of session objectives]',
  '[Approach to take]',
  '[What needs to be verified]',
  '[Files to work with]',
];

function isPlanningDocFilled(content: string): boolean {
  if (content.includes(PLACEHOLDER_REFINED)) return false;
  if (content.includes(PLACEHOLDER_TIERDOWN)) return false;
  for (const p of TIERDOWN_BULLET_PLACEHOLDERS) {
    if (content.includes(p)) return false;
  }
  for (const p of TASK_PLACEHOLDERS) {
    if (content.includes(p)) return false;
  }
  for (const p of PLANNING_STORY_PLACEHOLDERS) {
    if (content.includes(p)) return false;
  }
  return true;
}

/** Infer guide tier from filename so we can check required sections. */
function inferGuideTier(filename: string): GuideTier | null {
  const n = filename.replace(/\\/g, '/');
  if (n.includes('feature-') && n.endsWith('-guide.md')) return 'feature';
  if (n.includes('phase-') && n.endsWith('-guide.md')) return 'phase';
  if (n.includes('session-') && n.endsWith('-guide.md')) return 'session';
  return null;
}

function isGuideFilled(content: string, filename: string): boolean {
  for (const p of GUIDE_TIERDOWN_PLACEHOLDERS) {
    if (content.includes(p)) return false;
  }
  const tier = inferGuideTier(filename);
  if (tier === 'session') {
    for (const p of SESSION_GUIDE_STOCK_PLACEHOLDERS) {
      if (content.includes(p)) return false;
    }
  }
  if (tier) {
    const required = REQUIRED_GUIDE_SECTIONS[tier];
    for (const section of required) {
      if (!content.includes(`## ${section}`)) return false;
    }
  }
  return true;
}

/** True if existing content is "filled" and should not be overwritten by a template. */
export function isProtectedPathFilled(filename: string, content: string): boolean {
  const n = filename.replace(/\\/g, '/');
  if (n.endsWith('-planning.md')) return isPlanningDocFilled(content);
  if (n.endsWith('-guide.md')) return isGuideFilled(content, filename);
  return false;
}

/** Get a short caller description from the stack (file:line of first caller outside this module). */
export function getCallerFromStack(): string {
  try {
    const stack = new Error().stack ?? '';
    const lines = stack.split('\n').slice(1);
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip node internals and this module
      if (trimmed.includes('project-manager-write-guard') || trimmed.startsWith('at Module')) continue;
      // Extract "at ... (path:line:col)" or "at path:line:col"
      const m = trimmed.match(/at\s+(?:async\s+)?(?:.*?\s+\()?(.+?):(\d+):\d+\)?$/);
      if (m) return `${m[1]}:${m[2]}`;
      if (trimmed) return trimmed.slice(0, 80);
    }
  } catch {
    // ignore
  }
  return '(unknown)';
}

/** Log a protected-path write (or blocked overwrite) to stderr and to .project-manager/.write-log so you can see WHEN/WHY. */
export function logProjectManagerWrite(opts: {
  path: string;
  blocked: boolean;
  caller: string;
}): void {
  const ts = new Date().toISOString();
  const line = opts.blocked
    ? `[${ts}] BLOCKED overwrite ${opts.path} (caller: ${opts.caller})\n`
    : `[${ts}] WRITE ${opts.path} (caller: ${opts.caller})\n`;
  if (typeof process !== 'undefined' && process.stderr?.write) {
    process.stderr.write(line);
  }
  appendToWriteLog(line).catch(() => {});
}

async function appendToWriteLog(line: string): Promise<void> {
  try {
    const { appendFile } = await import('fs/promises');
    const { join } = await import('path');
    const path = join(process.cwd(), PROJECT_MANAGER_WRITE_LOG);
    await appendFile(path, line, 'utf-8');
  } catch {
    // best-effort; avoid breaking the write path
  }
}

/** Options for shouldBlockProjectManagerWrite. */
export interface ShouldBlockProjectManagerWriteOptions {
  /** When true, allow write for tier-end workflow (e.g. task-end checkbox, session/phase status). Do not use for other callers. */
  overwriteForTierEnd?: boolean;
}

/** If path is protected and existing content is filled, return true (caller should skip write). */
export async function shouldBlockProjectManagerWrite(
  projectRoot: string,
  filename: string,
  options?: ShouldBlockProjectManagerWriteOptions
): Promise<boolean> {
  if (!isProjectManagerProtectedPath(filename)) return false;
  if (options?.overwriteForTierEnd) return false;
  let existing: string;
  try {
    existing = await readFile(join(projectRoot, filename), 'utf-8');
  } catch {
    return false; // no file or unreadable → allow write
  }
  return isProtectedPathFilled(filename, existing);
}
