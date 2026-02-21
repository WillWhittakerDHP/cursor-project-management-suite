/**
 * Scope Assessment Utility
 * 
 * Determines if a change request requires re-planning (significant scope change)
 * vs. can be handled with direct todo updates (minor scope change).
 * 
 * Criteria for significant scope change (requires re-planning):
 * - New tasks added
 * - Tasks removed
 * - Changed dependencies
 * - Architectural changes
 * - Changes affecting multiple tiers
 * - Changes that modify session/phase structure
 */

import { ChangeRequest, ChangeScope } from './utils';

export type ScopeChangeSignificance = 'significant' | 'minor';

export interface ScopeAssessment {
  significance: ScopeChangeSignificance;
  requiresReplanning: boolean;
  reasons: string[];
  suggestedPlanningCommand?: 'phase-plan' | 'plan-session' | 'plan-feature';
}

/**
 * Assess if a change request requires re-planning
 * 
 * @param changeRequest The parsed change request
 * @param scope The identified change scope
 * @param tier The tier level of the change (session, phase, feature)
 * @returns Assessment of whether re-planning is needed
 */
export function assessChangeScope(
  changeRequest: ChangeRequest,
  scope: ChangeScope,
  tier: 'session' | 'phase' | 'feature'
): ScopeAssessment {
  const reasons: string[] = [];
  let requiresReplanning = false;
  let suggestedPlanningCommand: 'phase-plan' | 'plan-session' | 'plan-feature' | undefined;

  // Architectural changes always require re-planning
  if (changeRequest.type === 'architectural') {
    requiresReplanning = true;
    reasons.push('Architectural changes require re-planning to ensure consistency');
    suggestedPlanningCommand = tier === 'phase' ? 'phase-plan' : tier === 'session' ? 'plan-session' : 'plan-feature';
  }

  // Changes affecting multiple tiers suggest significant scope
  if (scope.tiersAffected.length > 1) {
    requiresReplanning = true;
    reasons.push(`Change affects multiple tiers: ${scope.tiersAffected.join(', ')}`);
    // Determine which planning command to use based on highest tier affected
    if (scope.tiersAffected.includes('phase')) {
      suggestedPlanningCommand = 'phase-plan';
    } else if (scope.tiersAffected.includes('session')) {
      suggestedPlanningCommand = 'plan-session';
    } else {
      suggestedPlanningCommand = 'plan-feature';
    }
  }

  // Check for keywords that suggest new tasks or removed tasks
  const descriptionLower = changeRequest.description.toLowerCase();
  const newTaskKeywords = ['add task', 'new task', 'create task', 'introduce task', 'additional task'];
  const removeTaskKeywords = ['remove task', 'delete task', 'drop task', 'eliminate task', 'cancel task'];
  const dependencyKeywords = ['dependency', 'depends on', 'requires', 'needs', 'prerequisite'];
  const structureKeywords = ['restructure', 'reorganize', 'reorder', 'change structure', 'modify structure'];

  if (newTaskKeywords.some(keyword => descriptionLower.includes(keyword))) {
    requiresReplanning = true;
    reasons.push('Change adds new tasks, requiring session/phase re-planning');
    suggestedPlanningCommand = tier === 'phase' ? 'phase-plan' : 'plan-session';
  }

  if (removeTaskKeywords.some(keyword => descriptionLower.includes(keyword))) {
    requiresReplanning = true;
    reasons.push('Change removes tasks, requiring session/phase re-planning');
    suggestedPlanningCommand = tier === 'phase' ? 'phase-plan' : 'plan-session';
  }

  if (dependencyKeywords.some(keyword => descriptionLower.includes(keyword))) {
    requiresReplanning = true;
    reasons.push('Change affects dependencies, requiring re-planning');
    suggestedPlanningCommand = tier === 'phase' ? 'phase-plan' : 'plan-session';
  }

  if (structureKeywords.some(keyword => descriptionLower.includes(keyword))) {
    requiresReplanning = true;
    reasons.push('Change modifies structure, requiring re-planning');
    suggestedPlanningCommand = tier === 'phase' ? 'phase-plan' : tier === 'session' ? 'plan-session' : 'plan-feature';
  }

  // Large number of files affected suggests significant change
  if (scope.filesAffected.length > 10) {
    requiresReplanning = true;
    reasons.push(`Change affects ${scope.filesAffected.length} files, suggesting significant scope`);
    suggestedPlanningCommand = tier === 'phase' ? 'phase-plan' : 'plan-session';
  }

  // Refactoring that affects many files
  if (changeRequest.type === 'refactoring' && scope.filesAffected.length > 5) {
    requiresReplanning = true;
    reasons.push('Refactoring affects multiple files, may require re-planning');
    suggestedPlanningCommand = tier === 'phase' ? 'phase-plan' : 'plan-session';
  }

  // If no reasons found, it's a minor change
  if (reasons.length === 0) {
    reasons.push('Change is localized and does not affect planning structure');
  }

  return {
    significance: requiresReplanning ? 'significant' : 'minor',
    requiresReplanning,
    reasons,
    suggestedPlanningCommand,
  };
}

