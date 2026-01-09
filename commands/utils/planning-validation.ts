/**
 * Planning Management System - Planning Validation
 * 
 * Functions for validating planning completeness, checking required fields,
 * and verifying alternatives/decisions are considered.
 */

import {
  PlanningOutput,
  PlanningValidation,
  ValidationIssue,
  ValidationSeverity,
  TierValidationRules,
  PlanningTier,
  DecisionGate,
} from './planning-types';

// ===================================================================
// VALIDATION RULES
// ===================================================================

/**
 * Get tier-specific validation rules
 */
export function getTierValidationRules(tier: PlanningTier): TierValidationRules {
  switch (tier) {
    case 'feature':
      return {
        tier: 'feature',
        requiredFields: ['objectives', 'scope'],
        recommendedFields: ['risks', 'dependencies', 'constraints', 'estimatedEffort'],
        rules: [
          {
            field: 'objectives',
            required: true,
            validator: (value) => Array.isArray(value) && (value as string[]).length >= 2,
            errorMessage: 'Features require at least 2 objectives',
          },
          {
            field: 'scope',
            required: true,
            validator: (value) => typeof value === 'string' && value.trim().length >= 20,
            errorMessage: 'Scope description must be at least 20 characters',
          },
          {
            field: 'risks',
            required: false,
            validator: (value) => !value || (Array.isArray(value) && (value as string[]).length > 0),
            errorMessage: 'Risks should be an array if provided',
          },
        ],
      };
      
    case 'phase':
      return {
        tier: 'phase',
        requiredFields: ['objectives', 'scope'],
        recommendedFields: ['dependencies', 'estimatedEffort'],
        rules: [
          {
            field: 'objectives',
            required: true,
            validator: (value) => Array.isArray(value) && (value as string[]).length >= 1,
            errorMessage: 'Phases require at least 1 objective',
          },
          {
            field: 'scope',
            required: true,
            validator: (value) => typeof value === 'string' && value.trim().length >= 10,
            errorMessage: 'Scope description must be at least 10 characters',
          },
        ],
      };
      
    case 'session':
      return {
        tier: 'session',
        requiredFields: ['objectives', 'scope'],
        recommendedFields: ['dependencies', 'estimatedEffort'],
        rules: [
          {
            field: 'objectives',
            required: true,
            validator: (value) => Array.isArray(value) && (value as string[]).length >= 1,
            errorMessage: 'Sessions require at least 1 objective',
          },
          {
            field: 'scope',
            required: true,
            validator: (value) => typeof value === 'string' && value.trim().length >= 10,
            errorMessage: 'Scope description must be at least 10 characters',
          },
        ],
      };
      
    case 'task':
      return {
        tier: 'task',
        requiredFields: ['objectives'],
        recommendedFields: ['scope', 'estimatedEffort'],
        rules: [
          {
            field: 'objectives',
            required: true,
            validator: (value) => Array.isArray(value) && (value as string[]).length >= 1,
            errorMessage: 'Tasks require at least 1 objective',
          },
          {
            field: 'objectives',
            required: false,
            validator: (value) => !value || (Array.isArray(value) && (value as string[]).length <= 3),
            errorMessage: 'Tasks should have 1-3 objectives (consider breaking into multiple tasks)',
          },
        ],
      };
  }
}

// ===================================================================
// PLANNING VALIDATION
// ===================================================================

/**
 * Validate planning output completeness
 */
export function validatePlanning(
  planningOutput: PlanningOutput,
  tier: PlanningTier,
  decisionGates?: DecisionGate[],
  requireAlternatives: boolean = false
): PlanningValidation {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];
  const missingFields: string[] = [];
  const suggestions: string[] = [];
  
  // Get tier-specific rules
  const rules = getTierValidationRules(tier);
  
  // Validate required fields
  for (const field of rules.requiredFields) {
    const value = (planningOutput as Record<string, unknown>)[field];
    
    if (value === undefined || value === null || value === '') {
      errors.push({
        severity: 'error',
        field,
        message: `Required field "${field}" is missing`,
        suggestion: `Provide a value for ${field}`,
      });
      missingFields.push(field);
    } else {
      // Validate field using rule validator if available
      const rule = rules.rules.find(r => r.field === field);
      if (rule && rule.validator) {
        if (!rule.validator(value)) {
          errors.push({
            severity: 'error',
            field,
            message: rule.errorMessage || `Field "${field}" validation failed`,
            suggestion: `Fix the value for ${field}`,
          });
        }
      }
    }
  }
  
  // Check recommended fields
  for (const field of rules.recommendedFields) {
    const value = (planningOutput as Record<string, unknown>)[field];
    
    if (value === undefined || value === null || value === '') {
      warnings.push({
        severity: 'warning',
        field,
        message: `Recommended field "${field}" is missing`,
        suggestion: `Consider providing a value for ${field}`,
      });
    }
  }
  
  // Validate field types and formats
  validateFieldTypes(planningOutput, errors, warnings);
  
  // Check if alternatives are required
  if (requireAlternatives && planningOutput.tags && !planningOutput.tags.includes('alternatives-considered')) {
    warnings.push({
      severity: 'warning',
      message: 'Alternatives should be considered for this planning item',
      suggestion: 'Generate and analyze alternatives before proceeding',
    });
    suggestions.push('Consider generating alternatives using alternatives-generator');
  }
  
  // Check decision gates
  if (decisionGates && decisionGates.length > 0) {
    const pendingRequired = decisionGates.filter(gate => gate.required && gate.status === 'pending');
    if (pendingRequired.length > 0) {
      errors.push({
        severity: 'error',
        message: `${pendingRequired.length} required decision gate(s) pending`,
        suggestion: 'Make decisions on all required decision gates before proceeding',
      });
    }
  }
  
  // Generate suggestions based on tier
  generateTierSuggestions(tier, planningOutput, suggestions);
  
  const isValid = errors.length === 0;
  
  return {
    isValid,
    errors,
    warnings,
    info,
    missingFields,
    suggestions,
  };
}

// ===================================================================
// FIELD VALIDATION
// ===================================================================

/**
 * Validate field types and formats
 */
function validateFieldTypes(
  planningOutput: PlanningOutput,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  // Validate objectives
  if (planningOutput.objectives) {
    if (!Array.isArray(planningOutput.objectives)) {
      errors.push({
        severity: 'error',
        field: 'objectives',
        message: 'Objectives must be an array',
        suggestion: 'Provide objectives as an array of strings',
      });
    } else {
      const emptyObjectives = planningOutput.objectives.filter(obj => !obj || obj.trim().length === 0);
      if (emptyObjectives.length > 0) {
        warnings.push({
          severity: 'warning',
          field: 'objectives',
          message: `${emptyObjectives.length} empty objective(s) found`,
          suggestion: 'Remove empty objectives or provide descriptions',
        });
      }
    }
  }
  
  // Validate scope
  if (planningOutput.scope && typeof planningOutput.scope !== 'string') {
    errors.push({
      severity: 'error',
      field: 'scope',
      message: 'Scope must be a string',
      suggestion: 'Provide scope as a string description',
    });
  }
  
  // Validate dependencies
  if (planningOutput.dependencies) {
    if (!Array.isArray(planningOutput.dependencies)) {
      errors.push({
        severity: 'error',
        field: 'dependencies',
        message: 'Dependencies must be an array',
        suggestion: 'Provide dependencies as an array of strings',
      });
    }
  }
  
  // Validate risks
  if (planningOutput.risks) {
    if (!Array.isArray(planningOutput.risks)) {
      errors.push({
        severity: 'error',
        field: 'risks',
        message: 'Risks must be an array',
        suggestion: 'Provide risks as an array of strings',
      });
    }
  }
  
  // Validate constraints
  if (planningOutput.constraints) {
    if (!Array.isArray(planningOutput.constraints)) {
      errors.push({
        severity: 'error',
        field: 'constraints',
        message: 'Constraints must be an array',
        suggestion: 'Provide constraints as an array of strings',
      });
    }
  }
  
  // Validate priority
  if (planningOutput.priority) {
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    if (!validPriorities.includes(planningOutput.priority)) {
      errors.push({
        severity: 'error',
        field: 'priority',
        message: `Priority must be one of: ${validPriorities.join(', ')}`,
        suggestion: `Set priority to one of: ${validPriorities.join(', ')}`,
      });
    }
  }
  
  // Validate tags
  if (planningOutput.tags) {
    if (!Array.isArray(planningOutput.tags)) {
      errors.push({
        severity: 'error',
        field: 'tags',
        message: 'Tags must be an array',
        suggestion: 'Provide tags as an array of strings',
      });
    }
  }
}

// ===================================================================
// SUGGESTION GENERATION
// ===================================================================

/**
 * Generate tier-specific suggestions
 */
function generateTierSuggestions(
  tier: PlanningTier,
  planningOutput: PlanningOutput,
  suggestions: string[]
): void {
  switch (tier) {
    case 'feature':
      if (!planningOutput.risks || planningOutput.risks.length === 0) {
        suggestions.push('Features should identify potential risks');
      }
      if (!planningOutput.estimatedEffort) {
        suggestions.push('Consider providing an effort estimate for the feature');
      }
      if (planningOutput.objectives && planningOutput.objectives.length < 3) {
        suggestions.push('Features typically have 3+ objectives. Consider adding more specific goals.');
      }
      break;
      
    case 'phase':
      if (!planningOutput.dependencies || planningOutput.dependencies.length === 0) {
        suggestions.push('Phases often have dependencies. Consider identifying what this phase depends on.');
      }
      if (!planningOutput.estimatedEffort) {
        suggestions.push('Consider providing an effort estimate for the phase');
      }
      break;
      
    case 'session':
      if (!planningOutput.estimatedEffort) {
        suggestions.push('Consider providing an effort estimate for the session');
      }
      if (planningOutput.objectives && planningOutput.objectives.length > 5) {
        suggestions.push('Sessions with many objectives may be too broad. Consider breaking into multiple sessions.');
      }
      break;
      
    case 'task':
      if (!planningOutput.scope) {
        suggestions.push('Tasks benefit from a clear scope description');
      }
      if (planningOutput.objectives && planningOutput.objectives.length > 3) {
        suggestions.push('Tasks should be focused. Consider breaking this into multiple tasks.');
      }
      break;
  }
}

// ===================================================================
// VALIDATION HELPERS
// ===================================================================

/**
 * Check if planning is complete enough to proceed
 */
export function canProceedWithPlanning(validation: PlanningValidation): boolean {
  return validation.isValid && validation.errors.length === 0;
}

/**
 * Get blocking issues that prevent progression
 */
export function getBlockingIssues(validation: PlanningValidation): ValidationIssue[] {
  return validation.errors.filter(issue => issue.severity === 'error');
}

/**
 * Get all suggestions for improvement
 */
export function getAllSuggestions(validation: PlanningValidation): string[] {
  return [
    ...validation.suggestions,
    ...validation.errors.map(e => e.suggestion).filter((s): s is string => !!s),
    ...validation.warnings.map(w => w.suggestion).filter((s): s is string => !!s),
  ];
}

