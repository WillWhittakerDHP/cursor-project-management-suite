/**
 * Fail fast when merge or stash-pop left conflict markers in harness-visible trees
 * (.project-manager, client, server) so tier-end does not run builds on broken files.
 */

import { execFileSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECT_ROOT } from './utils';

const HARNESS_ROOTS = ['.project-manager', 'client', 'server'] as const;
const MARKER_LINE = /^<<<<<<</m;
const SCAN_EXTENSIONS = new Set([
  '.md',
  '.ts',
  '.tsx',
  '.vue',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.scss',
]);

export type ConflictMarkerScanResult =
  | { ok: true }
  | { ok: false; relativePaths: string[]; message: string };

function tryRgScan(projectRoot: string): string[] | null {
  try {
    const out = execFileSync(
      'rg',
      [
        '-l',
        '--glob',
        '!**/node_modules/**',
        '--glob',
        '!**/.git/**',
        '^<<<<<<<',
        ...HARNESS_ROOTS,
      ],
      { cwd: projectRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
    );
    return out
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string };
    if (err.status === 1) {
      return [];
    }
    return null;
  }
}

async function walkForMarkers(relDir: string, acc: string[]): Promise<void> {
  const full = join(PROJECT_ROOT, relDir);
  let st;
  try {
    st = await stat(full);
  } catch {
    return;
  }
  if (!st.isDirectory()) return;

  let entries;
  try {
    entries = await readdir(full, { withFileTypes: true });
  } catch {
    return;
  }

  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist' || ent.name === 'build') {
      continue;
    }
    const rel = `${relDir}/${ent.name}`;
    if (ent.isDirectory()) {
      await walkForMarkers(rel, acc);
      continue;
    }
    const dot = ent.name.lastIndexOf('.');
    const ext = dot >= 0 ? ent.name.slice(dot) : '';
    if (!SCAN_EXTENSIONS.has(ext)) continue;
    try {
      const content = await readFile(join(PROJECT_ROOT, rel), 'utf8');
      MARKER_LINE.lastIndex = 0;
      if (MARKER_LINE.test(content)) acc.push(rel);
    } catch {
      // skip unreadable
    }
  }
}

async function fallbackWalkScan(): Promise<string[]> {
  const acc: string[] = [];
  for (const root of HARNESS_ROOTS) {
    await walkForMarkers(root, acc);
  }
  return acc.sort();
}

/**
 * Scan project roots for lines starting with <<<<<<< (merge / stash conflict markers).
 * Uses ripgrep when available; otherwise walks trees (skips node_modules).
 */
export async function scanHarnessRootsForConflictMarkers(): Promise<ConflictMarkerScanResult> {
  const rgPaths = tryRgScan(PROJECT_ROOT);
  const paths = rgPaths === null ? await fallbackWalkScan() : rgPaths;

  if (paths.length === 0) {
    return { ok: true };
  }

  const list = paths.map((p) => `  - ${p}`).join('\n');
  return {
    ok: false,
    relativePaths: paths,
    message:
      `Conflict markers (<<<<<<<) were found — fix before tier-end:\n${list}\n\n` +
      `Resolve each file (or run \`git merge --abort\` / repair stash) then re-run.`,
  };
}
