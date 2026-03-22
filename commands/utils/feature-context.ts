/**
 * Feature Context Abstraction
 *
 * **Feature directory resolution** (PROJECT_PLAN # / slug → `features/<dir>`) lives in **`workflow-scope.ts`**:
 * `resolveWorkflowScope`, `resolveFeatureDirectoryFromPlan`, `resolveActiveFeatureDirectory`.
 * This module only provides `FeatureContext` + `listAvailableFeatures`.
 *
 * LEARNING: Context objects encapsulate related functionality and configuration
 * WHY: Hardcoded feature names make code inflexible and harder to test
 * PATTERN: Factory pattern with optional configuration file for feature detection
 */

import { WorkflowPathResolver } from './path-resolver';
import { readdir } from 'fs/promises';
import { join } from 'path';

/**
 * FeatureContext class
 *
 * Provides feature context including name and path resolver.
 * Created from an explicit directory name (resolved via resolveWorkflowScope / PROJECT_PLAN).
 */
export class FeatureContext {
  readonly name: string;
  readonly paths: WorkflowPathResolver;

  /**
   * Create a new feature context
   * @param featureName Feature directory name under .project-manager/features/
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
