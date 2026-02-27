/**
 * Utility: Update .current-feature config to match current git branch
 *
 * @deprecated Use tier-scope.ts (updateTierScope, clearTierScope) instead.
 * This module delegates to .tier-scope for backward compatibility.
 *
 * Use this after git operations (merge, checkout, branch switch) to keep config in sync.
 */

import { getCurrentBranch } from './utils';
import { readTierScope, updateTierScope, clearTierScope } from './tier-scope';

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
 * @deprecated Delegates to updateTierScope('feature', ...) / clearTierScope(). Use tier-scope.ts directly.
 * @returns Result with previous/current feature names and status message
 */
export async function updateCurrentFeature(): Promise<UpdateCurrentFeatureResult> {
  const previousScope = await readTierScope();
  const previousFeature = previousScope.feature?.id;
  const currentBranch = await getCurrentBranch();

  if (currentBranch === 'develop' || currentBranch === 'main' || currentBranch === 'master') {
    await clearTierScope();
    return {
      success: true,
      previousFeature,
      currentFeature: undefined,
      currentBranch,
      message: `Removed tier scope (on ${currentBranch} branch). Config will auto-detect from git branch when starting next feature.`,
    };
  }

  const featureName = currentBranch
    .replace(/^(feature|feat|fix|bugfix)\//, '')
    .replace(/^.*\//, '')
    .trim();

  if (featureName) {
    await updateTierScope('feature', { id: featureName, name: featureName });
    return {
      success: true,
      previousFeature,
      currentFeature: featureName,
      currentBranch,
      message: `Updated tier scope: ${previousFeature || '(none)'} → ${featureName}\n` +
        `Current branch: ${currentBranch}\n` +
        `Config now synced with git branch.`,
    };
  }

  return {
    success: false,
    previousFeature,
    currentFeature: undefined,
    currentBranch,
    message: `Could not extract feature name from branch: ${currentBranch}\n` +
      `Tier scope not updated. Please update manually if needed.`,
  };
}
