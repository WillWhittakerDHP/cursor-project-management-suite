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
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { access } from 'fs/promises';
import { execSync } from 'child_process';

/**
 * FeatureContext class
 * 
 * Provides feature context including name and path resolver.
 * Can be created explicitly or detected from git branch/config file.
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
   * Get current feature context
   * 
   * Detection order:
   * 1. Check `.project-manager/.current-feature` config file
   * 2. Fall back to git branch name (removes common prefixes)
   * 
   * Throws error if detection fails - no fallback to 'vue-migration'
   * 
   * @returns FeatureContext instance
   * @throws Error if feature cannot be detected
   */
  static async getCurrent(): Promise<FeatureContext> {
    const PROJECT_ROOT = process.cwd();
    const configPath = join(PROJECT_ROOT, '.project-manager/.current-feature');

    // Try config file first
    try {
      await access(configPath);
      const content = await readFile(configPath, 'utf-8');
      const featureName = content.trim();
      if (featureName) {
        return new FeatureContext(featureName);
      }
    } catch (_error) {
      // Config file doesn't exist or is empty - continue to git branch detection
    }

    // Fall back to git branch detection
    try {
      const branchName = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
      
      // Remove common prefixes (feature/, feat/, etc.)
      const featureName = branchName
        .replace(/^(feature|feat|fix|bugfix)\//, '')
        .replace(/^.*\//, '') // Remove any remaining path separators
        .trim();
      
      if (featureName) {
        return new FeatureContext(featureName);
      }
    } catch (_error) {
      // Git command failed - throw error with available features
      const availableFeatures = await FeatureContext.listAvailableFeatures();
      throw new Error(
        `Could not auto-detect feature from git branch.\n` +
        `Error: ${_error instanceof Error ? _error.message : String(_error)}\n\n` +
        `Available features: ${availableFeatures.length > 0 ? availableFeatures.join(', ') : 'none found'}\n` +
        `Please specify feature name explicitly or set .project-manager/.current-feature config file.`
      );
    }

    // If we get here, detection failed - throw error
    const availableFeatures = await FeatureContext.listAvailableFeatures();
    throw new Error(
      `Could not auto-detect feature. No config file found and git branch detection failed.\n\n` +
      `Available features: ${availableFeatures.length > 0 ? availableFeatures.join(', ') : 'none found'}\n` +
      `Please specify feature name explicitly or set .project-manager/.current-feature config file.`
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
 * Resolve feature name: use override if provided, otherwise current context
 * (.project-manager/.current-feature or git branch). Use this instead of any
 * hardcoded default feature name.
 *
 * @param override Explicit feature name (e.g. from command args)
 * @returns Resolved feature name
 * @throws Error if no override and current context cannot be detected
 */
export async function resolveFeatureName(override?: string): Promise<string> {
  const trimmed = override?.trim();
  if (trimmed) return trimmed;
  const context = await FeatureContext.getCurrent();
  return context.name;
}

const PROJECT_PLAN_PATH = '.project-manager/PROJECT_PLAN.md';
const FEATURE_SUMMARY_HEADER = '| # | Feature | Status | Directory | Key Dates |';

/**
 * Resolve numeric feature ID to feature name (directory name) from PROJECT_PLAN.md.
 * Reads the Feature Summary table, finds the row where the # column matches featureId,
 * and returns the directory name from the Directory column (e.g. "17" -> "admin-ui-overhaul").
 *
 * @param featureId Numeric string (e.g. "3", "17") matching the # column in PROJECT_PLAN.md
 * @returns Feature name (directory name under .project-manager/features/)
 * @throws Error if PROJECT_PLAN.md cannot be read or no matching feature row is found
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
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 4) continue;
    const numCell = cells[0];
    const dirCell = cells[3];
    if (numCell !== trimmed) continue;
    const dirMatch = dirCell.match(/`?features\/([^/`]+)\/?`?/);
    const name = dirMatch ? dirMatch[1] : dirCell.replace(/^`|`$/g, '').replace(/^features\/|\/$/g, '').trim();
    if (name && name !== '—' && !name.startsWith('—')) {
      return name;
    }
    throw new Error(
      `resolveFeatureId: feature #${trimmed} has no feature directory in ${PROJECT_PLAN_PATH} (Directory column: "${dirCell}")`
    );
  }
  throw new Error(
    `resolveFeatureId: no feature found with # = "${trimmed}" in ${PROJECT_PLAN_PATH} Feature Summary table`
  );
}

