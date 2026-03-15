/**
 * Utility: Update .current-feature config to match current git branch
 *
 * @deprecated Scope is derived from context (tier + identifier) per command.
 * This function returns branch-derived info for callers only.
 *
 * Use this after git operations (merge, checkout, branch switch) to keep config in sync.
 */

import { getCurrentBranch } from '../git/shared/git-manager';

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
 * @deprecated Returns branch-derived info only; scope is per-command from context.
 * @returns Result with current branch and derived feature name (for display/callers)
 */
export async function updateCurrentFeature(): Promise<UpdateCurrentFeatureResult> {
  const currentBranch = await getCurrentBranch();

  if (currentBranch === 'develop' || currentBranch === 'main' || currentBranch === 'master') {
    return {
      success: true,
      currentFeature: undefined,
      currentBranch,
      message: `On ${currentBranch} branch. Scope derived from context when starting next feature.`,
    };
  }

  const featureName = currentBranch
    .replace(/^(feature|feat|fix|bugfix)\//, '')
    .replace(/^.*\//, '')
    .trim();

  if (featureName) {
    return {
      success: true,
      currentFeature: featureName,
      currentBranch,
      message: `Branch: ${currentBranch} → feature: ${featureName}. Scope derived from context.`,
    };
  }

  return {
    success: false,
    currentFeature: undefined,
    currentBranch,
    message: `Could not extract feature name from branch: ${currentBranch}.`,
  };
}
