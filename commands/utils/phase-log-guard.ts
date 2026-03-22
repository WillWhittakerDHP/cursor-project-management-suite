/**
 * WHY: Tier-end must never replace a real phase log when readProjectFile fails (e.g. I/O, conflicts).
 * If the file exists on disk, we fail fast instead of writing a stub or template.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT } from './utils';

/**
 * If `relativePath` exists under PROJECT_ROOT, throw with context — the log must be fixed manually.
 * If the file does not exist, return normally so callers can bootstrap a new log.
 */
export function assertExistingPhaseLogReadableOrThrow(relativePath: string, readError: unknown, operation: string): void {
  const abs = join(PROJECT_ROOT, relativePath);
  if (!existsSync(abs)) {
    return;
  }
  const cause = readError instanceof Error ? readError.message : String(readError);
  throw new Error(
    `${operation}: Phase log exists at ${relativePath} but could not be read (${cause}). ` +
      'Fix merge conflicts, permissions, or encoding on that file; do not let tier-end overwrite it with a template.'
  );
}
