/**
 * Guard and audit for writes to .project-manager planning docs and guides.
 * - Audit: log every protected write (path, timestamp, caller) to stderr and to .project-manager/.write-log so you can see WHEN/WHY overwrites happen.
 * - Lock: block overwriting files that are already "filled" (no placeholders).
 * Used by writeProjectFile in utils.ts; DocumentManager also uses it for guide writes.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

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

// Placeholders that indicate guide tierDown blocks not filled (aligned with tier-start-steps.ts).
const GUIDE_TIERDOWN_PLACEHOLDERS = ['[Fill in]', '[To be planned]', '[To be defined]'];

function isPlanningDocFilled(content: string): boolean {
  if (content.includes(PLACEHOLDER_REFINED)) return false;
  if (content.includes(PLACEHOLDER_TIERDOWN)) return false;
  for (const p of TIERDOWN_BULLET_PLACEHOLDERS) {
    if (content.includes(p)) return false;
  }
  for (const p of TASK_PLACEHOLDERS) {
    if (content.includes(p)) return false;
  }
  return true;
}

function isGuideFilled(content: string): boolean {
  for (const p of GUIDE_TIERDOWN_PLACEHOLDERS) {
    if (content.includes(p)) return false;
  }
  return true;
}

/** True if existing content is "filled" and should not be overwritten by a template. */
export function isProtectedPathFilled(filename: string, content: string): boolean {
  const n = filename.replace(/\\/g, '/');
  if (n.endsWith('-planning.md')) return isPlanningDocFilled(content);
  if (n.endsWith('-guide.md')) return isGuideFilled(content);
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

/** If path is protected and existing content is filled, return true (caller should skip write). */
export async function shouldBlockProjectManagerWrite(
  projectRoot: string,
  filename: string
): Promise<boolean> {
  if (!isProjectManagerProtectedPath(filename)) return false;
  let existing: string;
  try {
    existing = await readFile(join(projectRoot, filename), 'utf-8');
  } catch {
    return false; // no file or unreadable → allow write
  }
  return isProtectedPathFilled(filename, existing);
}
