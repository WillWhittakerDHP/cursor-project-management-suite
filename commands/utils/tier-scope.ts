/**
 * Tier Scope Config
 *
 * Single source of truth for current feature, phase, session, and task.
 * Replaces .current-feature with .tier-scope storing id + name per tier.
 * Names are used in display and commit messages; ids (numbers) stay in branches and commands.
 */

import { readFile, writeFile, unlink } from 'fs/promises';
import { join } from 'path';

/** Local type to avoid circular dependency (tiers/shared/types imports command-context which imports feature-context). */
type TierName = 'feature' | 'phase' | 'session' | 'task';

const SCOPE_FILE_PATH = '.project-manager/.tier-scope';
const LEGACY_FILE_PATH = '.project-manager/.current-feature';

const TIER_HIERARCHY: TierName[] = ['feature', 'phase', 'session', 'task'];

/** Child tiers cleared when a tier is updated (inclusive of children, not the tier itself). */
const CHILDREN_OF: Record<TierName, TierName[]> = {
  feature: ['phase', 'session', 'task'],
  phase: ['session', 'task'],
  session: ['task'],
  task: [],
};

export interface TierScopeEntry {
  id: string;
  name: string | null;
  /** Full git branch name for this tier (e.g. phase-6.5-rescheduling-flow). Used for parent resolution. */
  branch?: string;
  /** Slug from guide title for branch naming (e.g. rescheduling-flow). */
  slug?: string;
}

export interface TierScope {
  feature: TierScopeEntry | null;
  phase: TierScopeEntry | null;
  session: TierScopeEntry | null;
  task: TierScopeEntry | null;
}

export interface UpdateScopeResult {
  success: boolean;
  previousScope: TierScope;
  currentScope: TierScope;
  messages: string[];
}

function getProjectRoot(): string {
  return process.cwd();
}

function scopeFilePath(): string {
  return join(getProjectRoot(), SCOPE_FILE_PATH);
}

function legacyFilePath(): string {
  return join(getProjectRoot(), LEGACY_FILE_PATH);
}

function parseScopeFile(content: string): TierScope {
  const result: TierScope = {
    feature: null,
    phase: null,
    session: null,
    task: null,
  };

  const ids: Partial<Record<TierName, string>> = {};
  const names: Partial<Record<TierName, string>> = {};
  const branches: Partial<Record<TierName, string>> = {};
  const slugs: Partial<Record<TierName, string>> = {};

  const lines = content.split('\n');
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    const match = key.match(/^(feature|phase|session|task)\.(id|name|branch|slug)$/);
    if (!match) continue;
    const tier = match[1] as TierName;
    const field = match[2];
    if (field === 'id' && value) {
      ids[tier] = value;
    } else if (field === 'name') {
      names[tier] = value || null;
    } else if (field === 'branch' && value) {
      branches[tier] = value;
    } else if (field === 'slug' && value) {
      slugs[tier] = value;
    }
  }

  for (const tier of TIER_HIERARCHY) {
    const id = ids[tier];
    if (id) {
      result[tier] = {
        id,
        name: names[tier] ?? null,
        ...(branches[tier] && { branch: branches[tier] }),
        ...(slugs[tier] && { slug: slugs[tier] }),
      };
    }
  }

  return result;
}

function serializeScope(scope: TierScope): string {
  const lines: string[] = [];
  for (const tier of TIER_HIERARCHY) {
    const entry = scope[tier];
    if (entry) {
      lines.push(`${tier}.id=${entry.id}`);
      lines.push(`${tier}.name=${entry.name ?? ''}`);
      if (entry.branch) lines.push(`${tier}.branch=${entry.branch}`);
      if (entry.slug) lines.push(`${tier}.slug=${entry.slug}`);
    } else {
      lines.push(`${tier}.id=`);
      lines.push(`${tier}.name=`);
    }
  }
  return lines.join('\n');
}

/**
 * Read current tier scope from .tier-scope (with fallback migration from .current-feature).
 */
export async function readTierScope(): Promise<TierScope> {
  const path = scopeFilePath();
  const legacyPath = legacyFilePath();

  try {
    const content = await readFile(path, 'utf-8');
    return parseScopeFile(content);
  } catch {
    // .tier-scope does not exist - try migration from .current-feature
  }

  try {
    const legacyContent = await readFile(legacyPath, 'utf-8');
    const featureName = legacyContent.trim();
    if (featureName) {
      const scope: TierScope = {
        feature: { id: featureName, name: featureName },
        phase: null,
        session: null,
        task: null,
      };
      await writeTierScope(scope);
      try {
        await unlink(legacyPath);
      } catch {
        // non-fatal
      }
      return scope;
    }
  } catch {
    // .current-feature does not exist or is empty
  }

  return {
    feature: null,
    phase: null,
    session: null,
    task: null,
  };
}

/**
 * Write the full scope atomically.
 */
export async function writeTierScope(scope: TierScope): Promise<void> {
  const path = scopeFilePath();
  await writeFile(path, serializeScope(scope), 'utf-8');
}

/**
 * Update one tier (id + name) and clear all child tiers. Returns before/after + messages.
 */
export async function updateTierScope(
  tier: TierName,
  entry: TierScopeEntry | null
): Promise<UpdateScopeResult> {
  const previousScope = await readTierScope();
  const messages: string[] = [];

  const currentScope: TierScope = {
    feature: previousScope.feature,
    phase: previousScope.phase,
    session: previousScope.session,
    task: previousScope.task,
  };

  if (entry) {
    currentScope[tier] = {
      id: entry.id,
      name: entry.name ?? null,
      ...(entry.branch && { branch: entry.branch }),
      ...(entry.slug && { slug: entry.slug }),
    };
    for (const child of CHILDREN_OF[tier]) {
      currentScope[child] = null;
      messages.push(`Cleared ${child} from scope.`);
    }
  } else {
    const toClear = [tier, ...CHILDREN_OF[tier]];
    for (const t of toClear) {
      currentScope[t] = null;
    }
    messages.push(`Cleared ${tier} and children from scope.`);
  }

  await writeTierScope(currentScope);
  return {
    success: true,
    previousScope,
    currentScope,
    messages,
  };
}

/**
 * Remove the scope file entirely (for root branch checkout).
 */
export async function clearTierScope(): Promise<void> {
  const path = scopeFilePath();
  try {
    await unlink(path);
  } catch {
    // File may not exist; ignore
  }
}

/**
 * Generic resolve ID: use override if provided, else read from .tier-scope.
 */
export async function resolveTierId(tier: TierName, override?: string): Promise<string | null> {
  const trimmed = override?.trim();
  if (trimmed) return trimmed;
  const scope = await readTierScope();
  const entry = scope[tier];
  return entry?.id ?? null;
}

/**
 * Generic resolve name: read from .tier-scope. Returns name or id as fallback.
 */
export async function resolveTierName(tier: TierName): Promise<string | null> {
  const scope = await readTierScope();
  const entry = scope[tier];
  if (!entry) return null;
  return entry.name ?? entry.id;
}

/**
 * Format scope as a human-readable summary block for command output.
 */
export function formatScopeDisplay(scope: TierScope): string {
  const lines: string[] = ['## Current Scope'];
  for (const tier of TIER_HIERARCHY) {
    const entry = scope[tier];
    if (entry) {
      const label = tier.charAt(0).toUpperCase() + tier.slice(1);
      const suffix = entry.name ? ` -- ${entry.name}` : '';
      lines.push(`- **${label}:** ${entry.id}${suffix}`);
    }
  }
  return lines.join('\n');
}

/**
 * Format a scope-aware commit message prefix: "[3.6.2: Slot Calculation Refactor]"
 */
export function formatScopeCommitPrefix(scope: TierScope, tier: TierName): string {
  const entry = scope[tier];
  if (!entry) return `[${tier}]`;
  const name = entry.name?.trim() || entry.id;
  return `[${entry.id}: ${name}]`;
}

/**
 * Slugify a string for use in branch names (e.g. "Rescheduling Flow" -> "rescheduling-flow").
 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'work';
}

/**
 * Extract descriptor from guide first line and slugify (e.g. "# Phase 6.5 Guide: Rescheduling Flow" -> "rescheduling-flow").
 */
export function deriveSlugFromGuideTitle(firstLine: string): string {
  const afterColon = firstLine.includes(':') ? firstLine.split(':').slice(1).join(':').trim() : firstLine.trim();
  return slugify(afterColon) || 'work';
}
