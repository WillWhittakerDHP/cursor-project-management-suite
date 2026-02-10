/**
 * Atomic Planning Command: /planning-validate-planning
 * Validate planning completeness
 * 
 * Wraps planning-validation.ts utilities and provides command interface.
 */

import {
  validatePlanning,
  canProceedWithPlanning,
  getBlockingIssues,
  getTierValidationRules,
} from '../../utils/planning-validation';
import { PlanningOutput, PlanningTier, DecisionGate } from '../../utils/planning-types';

/**
 * Validate planning output
 * 
 * @param planningOutput Planning output to validate
 * @param tier Planning tier
 * @param decisionGates Decision gates (optional)
 * @param requireAlternatives Whether alternatives are required
 * @returns Formatted validation result
 */
export async function validatePlanningCommand(
  planningOutput: PlanningOutput,
  tier: PlanningTier,
  decisionGates?: DecisionGate[],
  requireAlternatives: boolean = false
): Promise<string> {
  const validation = validatePlanning(planningOutput, tier, decisionGates, requireAlternatives);
  
  return formatValidationResult(validation, tier);
}

/**
 * Format validation result as string output
 */
function formatValidationResult(
  validation: import('../../../project-manager/utils/planning-types').PlanningValidation,
  tier: PlanningTier
): string {
  const output: string[] = [];
  
  output.push('# Planning Validation Result\n');
  output.push(`**Status:** ${validation.isValid ? '✅ Valid' : '❌ Invalid'}\n`);
  output.push(`**Tier:** ${tier}\n`);
  output.push(`**Can Proceed:** ${canProceedWithPlanning(validation) ? '✅ Yes' : '❌ No'}\n`);
  output.push('\n---\n');
  
  if (validation.errors.length > 0) {
    output.push('## Errors\n');
    validation.errors.forEach(error => {
      const icon = error.severity === 'error' ? '❌' : '⚠️';
      output.push(`### ${icon} ${error.field || 'General'}\n`);
      output.push(`**Message:** ${error.message}\n`);
      if (error.suggestion) {
        output.push(`**Suggestion:** ${error.suggestion}\n`);
      }
      output.push('\n');
    });
  }
  
  if (validation.warnings.length > 0) {
    output.push('## Warnings\n');
    validation.warnings.forEach(warning => {
      output.push(`### ⚠️ ${warning.field || 'General'}\n`);
      output.push(`**Message:** ${warning.message}\n`);
      if (warning.suggestion) {
        output.push(`**Suggestion:** ${warning.suggestion}\n`);
      }
      output.push('\n');
    });
  }
  
  if (validation.info.length > 0) {
    output.push('## Info\n');
    validation.info.forEach(info => {
      output.push(`### ℹ️ ${info.field || 'General'}\n`);
      output.push(`**Message:** ${info.message}\n`);
      if (info.suggestion) {
        output.push(`**Suggestion:** ${info.suggestion}\n`);
      }
      output.push('\n');
    });
  }
  
  if (validation.missingFields.length > 0) {
    output.push('## Missing Required Fields\n');
    validation.missingFields.forEach(field => {
      output.push(`- ❌ ${field}\n`);
    });
    output.push('\n');
  }
  
  if (validation.suggestions.length > 0) {
    output.push('## Suggestions\n');
    validation.suggestions.forEach(suggestion => {
      output.push(`- 💡 ${suggestion}\n`);
    });
    output.push('\n');
  }
  
  const blockingIssues = getBlockingIssues(validation);
  if (blockingIssues.length > 0) {
    output.push('---\n');
    output.push('## ⚠️ Blocking Issues\n');
    output.push('**The following issues must be resolved before proceeding:**\n');
    blockingIssues.forEach(issue => {
      output.push(`- ❌ ${issue.field || 'General'}: ${issue.message}\n`);
    });
  }
  
  if (!canProceedWithPlanning(validation)) {
    output.push('\n---\n');
    output.push('## ⚠️ Cannot Proceed\n');
    output.push('**Please resolve all errors before continuing with planning.**\n');
  }
  
  return output.join('\n');
}

/**
 * Get tier validation rules
 * 
 * @param tier Planning tier
 * @returns Tier validation rules
 */
export function getTierValidationRulesCommand(tier: PlanningTier): import('../../../project-manager/utils/planning-types').TierValidationRules {
  return getTierValidationRules(tier);
}

