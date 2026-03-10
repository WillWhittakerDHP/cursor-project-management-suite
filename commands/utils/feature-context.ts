/**
 * Feature Context Abstraction
 * 
 * Eliminates hardcoded feature names throughout the codebase.
 * Provides feature context with integrated path resolver.
 * 
 * LEARNING: Context objects encapsulate related functionality and configuration
 * WHY: Hardcoded feature names make code inflexible and harder to test
 * PATTERN: Factory pattern with optional configuration file for feature detection
 */

import { WorkflowPathResolver } from './path-resolver';
import { readFile, readdir, access } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';

/**
 * FeatureContext class
 * 
 * Provides feature context including name and path resolver.
 * Can be created explicitly or from git branch when no explicit feature is passed.
 */
export class FeatureContext {
  readonly name: string;
  readonly paths: WorkflowPathResolver;

  /**
   * Create a new feature context
   * @param featureName Feature name (e.g. from .current-feature or git branch)
   */
  constructor(featureName: string) {
    this.name = featureName;
    this.paths = new WorkflowPathResolver(featureName);
  }

  /**
   * Create feature context from explicit name
   * @param name Feature name
   * @returns FeatureContext instance
   */
  static fromName(name: string): FeatureContext {
    return new FeatureContext(name);
  }

  /**
   * Get current feature context from git branch only.
   * Scope is explicit per invocation (F/P/S/T in the command); no shared config file is read.
   *
   * @returns FeatureContext instance
   * @throws Error if not on a feature branch or feature cannot be detected
   */
  static async getCurrent(): Promise<FeatureContext> {
    try {
      const branchName = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
      const featureName = branchName
        .replace(/^(feature|feat|fix|bugfix)\//, '')
        .replace(/^.*\//, '')
        .trim();
      if (featureName) {
        return new FeatureContext(featureName);
      }
    } catch (_error) {
      const availableFeatures = await FeatureContext.listAvailableFeatures();
      throw new Error(
        `Could not auto-detect feature from git branch.\n` +
        `Error: ${_error instanceof Error ? _error.message : String(_error)}\n\n` +
        `Available features: ${availableFeatures.length > 0 ? availableFeatures.join(', ') : 'none found'}\n` +
        `Pass feature explicitly in the command or run from a feature branch.`
      );
    }
    const availableFeatures = await FeatureContext.listAvailableFeatures();
    throw new Error(
      `Could not auto-detect feature from git branch.\n\n` +
      `Available features: ${availableFeatures.length > 0 ? availableFeatures.join(', ') : 'none found'}\n` +
      `Pass feature explicitly in the command or run from a feature branch.`
    );
  }

  /**
   * Resolve feature name from tier + identifier by finding which feature dir contains that doc.
   * Use when scope is explicit (e.g. from command) and you have tier + id but not feature.
   *
   * @param tier 'phase' | 'session' | 'task'
   * @param identifier Phase id (e.g. 6.5), session id (X.Y), or task id (X.Y.Z.N)
   * @returns Feature name (directory under .project-manager/features/)
   * @throws Error if no feature directory contains the corresponding file
   */
  static async featureNameFromTierAndId(
    tier: 'phase' | 'session' | 'task',
    identifier: string
  ): Promise<string> {
    const PROJECT_ROOT = process.cwd();
    const featuresDir = join(PROJECT_ROOT, '.project-manager/features');
    const entries = await readdir(featuresDir, { withFileTypes: true });
    const candidates = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    let relPath: string;
    let searchDir: string;
    if (tier === 'task') {
      relPath = `sessions/task-${identifier}-planning.md`;
      searchDir = 'sessions';
    } else if (tier === 'session') {
      relPath = `sessions/session-${identifier}-guide.md`;
      searchDir = 'sessions';
    } else {
      relPath = `phases/phase-${identifier}-guide.md`;
      searchDir = 'phases';
    }
    for (const name of candidates) {
      const full = join(featuresDir, name, relPath);
      try {
        await access(full);
        return name;
      } catch {
        // continue
      }
    }
    // Phase fallback: phase guide may not exist yet (phase-add). Resolve via feature number from phase ID (e.g. 6.12 → 6).
    if (tier === 'phase') {
      const featureNum = identifier.split('.')[0];
      if (featureNum && /^\d+$/.test(featureNum)) {
        return resolveFeatureId(featureNum);
      }
    }
    // Task fallback: planning doc may not exist yet (created during task-start). Resolve via session guide.
    if (tier === 'task') {
      const sessionId = identifier.split('.').slice(0, 3).join('.');
      if (sessionId && sessionId !== identifier) {
        const sessionRelPath = `sessions/session-${sessionId}-guide.md`;
        for (const name of candidates) {
          const full = join(featuresDir, name, sessionRelPath);
          try {
            await access(full);
            return name;
          } catch {
            // continue
          }
        }
      }
    }
    // Session fallback: session guide may not exist yet (session-add). Resolve via parent phase guide.
    if (tier === 'session') {
      const phaseId = identifier.split('.').slice(0, 2).join('.');
      if (phaseId && phaseId !== identifier) {
        const phaseRelPath = `phases/phase-${phaseId}-guide.md`;
        for (const name of candidates) {
          const full = join(featuresDir, name, phaseRelPath);
          try {
            await access(full);
            return name;
          } catch {
            // continue
          }
        }
      }
    }
    throw new Error(
      `featureNameFromTierAndId: no feature found containing ${tier} ${identifier}. Check .project-manager/features/*/${searchDir}/.`
    );
  }

  /**
   * List all available features from the features directory
   * @returns Array of feature names
   */
  static async listAvailableFeatures(): Promise<string[]> {
    const PROJECT_ROOT = process.cwd();
    const featuresPath = join(PROJECT_ROOT, '.project-manager/features');

    try {
      const entries = await readdir(featuresPath, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch (err) {
      console.warn('Feature context: features directory not found or unreadable', err);
      return [];
    }
  }
}

/**
 * Resolve feature name: use override if provided (feature id or directory name), otherwise git branch.
 * Scope is explicit per invocation (identifier in the command).
 *
 * @param override Explicit feature id or name (e.g. from command args)
 * @returns Resolved feature name (directory under .project-manager/features/)
 * @throws Error if no override and git branch cannot be used
 */
export async function resolveFeatureName(override?: string): Promise<string> {
  if (override?.trim()) {
    return resolveFeatureId(override.trim());
  }
  const context = await FeatureContext.getCurrent();
  return context.name;
}

const PROJECT_PLAN_PATH = '.project-manager/PROJECT_PLAN.md';
const FEATURE_SUMMARY_HEADER = '| # | Feature | Status | Directory | Key Dates |';

/**
 * Resolve feature ID to feature name (directory name). Accepts either:
 * - Numeric string (e.g. "3", "17") → looked up in PROJECT_PLAN.md # column.
 * - Feature directory name (e.g. "appointment-workflow") → returned as-is when it appears
 *   in PROJECT_PLAN Directory column or in .project-manager/features/.
 *
 * @param featureId Numeric # or feature directory name
 * @returns Feature name (directory name under .project-manager/features/)
 * @throws Error if PROJECT_PLAN.md cannot be read or no matching feature is found
 */
export async function resolveFeatureId(featureId: string): Promise<string> {
  const trimmed = featureId.trim();
  if (!trimmed) {
    throw new Error('resolveFeatureId: featureId is required');
  }
  const PROJECT_ROOT = process.cwd();
  const planPath = join(PROJECT_ROOT, PROJECT_PLAN_PATH);
  let content: string;
  try {
    content = await readFile(planPath, 'utf-8');
  } catch (err) {
    throw new Error(
      `resolveFeatureId: could not read ${PROJECT_PLAN_PATH}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const tableStart = content.indexOf(FEATURE_SUMMARY_HEADER);
  if (tableStart === -1) {
    throw new Error(`resolveFeatureId: Feature Summary table not found in ${PROJECT_PLAN_PATH}`);
  }
  const afterHeader = content.slice(tableStart + FEATURE_SUMMARY_HEADER.length);
  const tableEnd = afterHeader.indexOf('\n\n');
  const tableBody = tableEnd === -1 ? afterHeader : afterHeader.slice(0, tableEnd);
  const rows = tableBody.split('\n').filter((line) => line.startsWith('|') && line.includes('|'));
  const isNumericId = /^\d+$/.test(trimmed);
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 4) continue;
    const numCell = cells[0];
    const dirCell = cells[3];
    const dirMatch = dirCell.match(/`?features\/([^/`]+)\/?`?/);
    const name = dirMatch ? dirMatch[1] : dirCell.replace(/^`|`$/g, '').replace(/^features\/|\/$/g, '').trim();
    if (!name || name === '—' || name.startsWith('—')) continue;
    if (isNumericId && numCell === trimmed) return name;
    if (!isNumericId && name === trimmed) return name;
  }
  if (!isNumericId) {
    const available = await FeatureContext.listAvailableFeatures();
    if (available.includes(trimmed)) return trimmed;
  }
  throw new Error(
    `resolveFeatureId: no feature found with # = "${trimmed}" in ${PROJECT_PLAN_PATH} Feature Summary table`
  );
}

