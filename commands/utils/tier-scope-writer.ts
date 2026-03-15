/**
 * Writes .project-manager/.tier-scope so downstream tooling (e.g. /audit-fix, context-injector)
 * can resolve the current feature, phase, session, and task.
 *
 * Restored after explicit-scope-and-context.plan removed scope writes; session/task fields
 * were left empty. Start commands now call writeTierScope on success.
 */

import { readProjectFile, writeProjectFile } from './utils';

const TIER_SCOPE_PATH = '.project-manager/.tier-scope';

export interface TierScopeSnapshot {
  feature?: { id: string; name: string };
  phase?: { id: string; name: string; branch?: string; slug?: string };
  session?: { id: string; name: string };
  task?: { id: string; name: string };
}

/**
 * Serialize scope to key=value lines (one entry per line; empty values allowed).
 */
function serializeScope(snapshot: TierScopeSnapshot): string {
  const lines: string[] = [];
  if (snapshot.feature) {
    lines.push(`feature.id=${snapshot.feature.id}`);
    lines.push(`feature.name=${snapshot.feature.name}`);
  }
  if (snapshot.phase) {
    lines.push(`phase.id=${snapshot.phase.id}`);
    lines.push(`phase.name=${snapshot.phase.name}`);
    if (snapshot.phase.branch != null) lines.push(`phase.branch=${snapshot.phase.branch}`);
    if (snapshot.phase.slug != null) lines.push(`phase.slug=${snapshot.phase.slug}`);
  }
  lines.push(`session.id=${snapshot.session?.id ?? ''}`);
  lines.push(`session.name=${snapshot.session?.name ?? ''}`);
  lines.push(`task.id=${snapshot.task?.id ?? ''}`);
  lines.push(`task.name=${snapshot.task?.name ?? ''}`);
  return lines.join('\n');
}

/**
 * Read and parse .tier-scope into TierScopeSnapshot. Returns null on file-not-found or parse errors.
 */
export async function readTierScope(): Promise<TierScopeSnapshot | null> {
  try {
    const raw = await readProjectFile(TIER_SCOPE_PATH);
    const map = new Map<string, string>();
    for (const line of raw.split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0) map.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
    }
    const snapshot: TierScopeSnapshot = {};
    if (map.get('feature.id')) {
      snapshot.feature = { id: map.get('feature.id')!, name: map.get('feature.name') ?? '' };
    }
    if (map.get('phase.id')) {
      snapshot.phase = {
        id: map.get('phase.id')!,
        name: map.get('phase.name') ?? '',
        branch: map.get('phase.branch') || undefined,
        slug: map.get('phase.slug') || undefined,
      };
    }
    if (map.get('session.id')) {
      snapshot.session = { id: map.get('session.id')!, name: map.get('session.name') ?? '' };
    }
    if (map.get('task.id')) {
      snapshot.task = { id: map.get('task.id')!, name: map.get('task.name') ?? '' };
    }
    return snapshot;
  } catch {
    return null;
  }
}

/**
 * Write the tier-scope file. Non-blocking on failure (log and continue).
 */
export async function writeTierScope(snapshot: TierScopeSnapshot): Promise<void> {
  try {
    const content = serializeScope(snapshot);
    await writeProjectFile(TIER_SCOPE_PATH, content);
  } catch (err) {
    console.warn('[tier-scope-writer] write failed:', err instanceof Error ? err.message : String(err));
  }
}
