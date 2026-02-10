/**
 * Utility: Update .current-feature config to match current git branch
 * 
 * This utility ensures the project manager stays focused on the correct feature
 * by syncing the .current-feature config file with the current git branch.
 * 
 * Use this after git operations (merge, checkout, branch switch) to keep config in sync.
 */

import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { getCurrentBranch } from './utils';

export interface UpdateCurrentFeatureResult {
  success: boolean;
  previousFeature?: string;
  currentFeature?: string;
  currentBranch: string;
  message: string;
}

/**
 * Update .current-feature config to match current git branch
 * 
 * @returns Result with previous/current feature names and status message
 */
export async function updateCurrentFeature(): Promise<UpdateCurrentFeatureResult> {
  const PROJECT_ROOT = process.cwd();
  const configPath = join(PROJECT_ROOT, '.project-manager/.current-feature');
  const { readFile } = await import('fs/promises');
  
  // Get previous feature from config (if exists)
  let previousFeature: string | undefined;
  try {
    previousFeature = (await readFile(configPath, 'utf-8')).trim();
  } catch {
    // Config file doesn't exist, that's okay
  }
  
  // Get current git branch
  const currentBranch = await getCurrentBranch();
  
  // Handle different branch scenarios
  if (currentBranch === 'develop' || currentBranch === 'main' || currentBranch === 'master') {
    // On base branch - remove config file to rely on git branch detection for next feature
    try {
      await unlink(configPath);
      return {
        success: true,
        previousFeature,
        currentFeature: undefined,
        currentBranch,
        message: `Removed .current-feature config (on ${currentBranch} branch). Config will auto-detect from git branch when starting next feature.`,
      };
    } catch {} {
      // File might not exist, that's okay
      return {
        success: true,
        previousFeature,
        currentFeature: undefined,
        currentBranch,
        message: `.current-feature config not found (on ${currentBranch} branch). Config will auto-detect from git branch when starting next feature.`,
      };
    }
  } else {
    // Extract feature name from branch (remove common prefixes)
    const featureName = currentBranch
      .replace(/^(feature|feat|fix|bugfix)\//, '')
      .replace(/^.*\//, '') // Remove any remaining path separators
      .trim();
    
    if (featureName && featureName.length > 0) {
      // Update config file to match current branch
      await writeFile(configPath, featureName, 'utf-8');
      return {
        success: true,
        previousFeature,
        currentFeature: featureName,
        currentBranch,
        message: `Updated .current-feature config: ${previousFeature || '(none)'} → ${featureName}\n` +
          `Current branch: ${currentBranch}\n` +
          `Config now synced with git branch.`,
      };
    } else {
      // Couldn't detect feature name from branch
      return {
        success: false,
        previousFeature,
        currentFeature: undefined,
        currentBranch,
        message: `Could not extract feature name from branch: ${currentBranch}\n` +
          `.current-feature config not updated. Please update manually if needed.`,
      };
    }
  }
}

