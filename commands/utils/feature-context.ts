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
import { readFile } from 'fs/promises';
import { join } from 'path';
import { access } from 'fs/promises';

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
   * @param featureName Feature name (e.g., "vue-migration")
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
    } catch (error) {
      // Config file doesn't exist or is empty - continue to git branch detection
    }

    // Fall back to git branch detection
    try {
      const { execSync } = await import('child_process');
      const branchName = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
      
      // Remove common prefixes (feature/, feat/, etc.)
      const featureName = branchName
        .replace(/^(feature|feat|fix|bugfix)\//, '')
        .replace(/^.*\//, '') // Remove any remaining path separators
        .trim();
      
      if (featureName) {
        return new FeatureContext(featureName);
      }
    } catch (error) {
      // Git command failed - throw error with available features
      const availableFeatures = await FeatureContext.listAvailableFeatures();
      throw new Error(
        `Could not auto-detect feature from git branch.\n` +
        `Error: ${error instanceof Error ? error.message : String(error)}\n\n` +
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
      const { readdir } = await import('fs/promises');
      const entries = await readdir(featuresPath, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch {} {
      // Features directory doesn't exist or can't be read
      return [];
    }
  }
}

