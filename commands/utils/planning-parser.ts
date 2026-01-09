/**
 * Planning Management System - Plain Language Parser
 * 
 * Functions for parsing natural language input and creating structured planning data
 * with validation and error handling. Similar pattern to todo-plain-language.ts.
 * 
 * Uses shared parsing utilities from natural-language-parser.ts for common patterns.
 */

import { PlanningInput, PlanningOutput, ParsingResult, ParsingError, PlanningTier } from './planning-types';
import { tokenize, extractPriority, extractTags, extractDependencies } from './natural-language-parser';

// ===================================================================
// NATURAL LANGUAGE PARSING
// ===================================================================

/**
 * Parse natural language input into structured planning data
 */
export function parseNaturalLanguage(input: PlanningInput): ParsingResult {
  const errors: ParsingError[] = [];
  const suggestions: string[] = [];
  const output: PlanningOutput = {
    objectives: [],
    scope: '',
    dependencies: [],
    risks: [],
    constraints: [],
    tags: [],
  };
  
  // Tokenize input (using shared utility)
  const tokens = tokenize(input.description);
  
  // Extract components
  try {
    // Extract objectives (goals, aims, targets)
    output.objectives = extractObjectives(tokens, input.structured?.objectives);
    
    // Extract scope
    output.scope = extractScope(tokens, input.structured?.scope);
    
    // Extract dependencies (using shared utility)
    output.dependencies = input.structured?.dependencies || extractDependencies(tokens);
    
    // Extract risks
    output.risks = extractRisks(tokens, input.structured?.risks);
    
    // Extract constraints
    output.constraints = extractConstraints(tokens, input.structured?.constraints);
    
    // Extract priority (using shared utility)
    output.priority = extractPriority(tokens);
    
    // Extract effort estimate
    output.estimatedEffort = extractEffort(tokens);
    
    // Extract tags (using shared utility)
    output.tags = extractTags(tokens);
    
  } catch (error) {
    errors.push({
      type: 'ambiguous',
      message: `Parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
  
  // Validate completeness based on tier
  validateTierRequirements(output, input.tier, errors, suggestions);
  
  // Validate required fields
  if (output.objectives.length === 0 && !input.structured?.objectives) {
    errors.push({
      type: 'missing_field',
      field: 'objectives',
      message: 'At least one objective is required',
    });
    suggestions.push('Provide objectives, goals, or aims for this planning item');
  }
  
  if (!output.scope && !input.structured?.scope) {
    errors.push({
      type: 'missing_field',
      field: 'scope',
      message: 'Scope description is required',
    });
    suggestions.push('Describe the scope of work or boundaries');
  }
  
  return {
    success: errors.length === 0,
    output: errors.length === 0 ? output : undefined,
    errors,
    suggestions,
  };
}

// ===================================================================
// EXTRACTION FUNCTIONS
// ===================================================================

// Note: tokenize(), extractPriority(), extractTags(), and extractDependencies()
// are now imported from natural-language-parser.ts

/**
 * Extract objectives from tokens
 */
function extractObjectives(tokens: string[], structured?: string[]): string[] {
  if (structured && structured.length > 0) {
    return structured;
  }
  
  const objectives: string[] = [];
  const objectiveKeywords = ['goal', 'aim', 'target', 'objective', 'purpose', 'achieve', 'implement', 'build', 'create'];
  
  // Look for explicit objective markers
  const text = tokens.join(' ');
  const objectivePatterns = [
    /(?:goal|aim|target|objective)[s]?[:\s]+(.+?)(?:\.|$)/gi,
    /(?:to|will)\s+(.+?)(?:\.|$)/gi,
  ];
  
  for (const pattern of objectivePatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        objectives.push(match[1].trim());
      }
    }
  }
  
  // If no explicit objectives found, extract first sentence as primary objective
  if (objectives.length === 0) {
    const firstSentence = text.split(/[.!?]/)[0].trim();
    if (firstSentence.length > 0) {
      objectives.push(firstSentence);
    }
  }
  
  return objectives;
}

/**
 * Extract scope from tokens
 */
function extractScope(tokens: string[], structured?: string): string {
  if (structured) {
    return structured;
  }
  
  const text = tokens.join(' ');
  const scopeKeywords = ['scope', 'boundary', 'include', 'exclude', 'within', 'limited to'];
  
  // Look for explicit scope markers
  const scopePatterns = [
    /scope[:\s]+(.+?)(?:\.|$)/gi,
    /(?:within|limited to|including|excluding)[:\s]+(.+?)(?:\.|$)/gi,
  ];
  
  for (const pattern of scopePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1]?.trim() || '';
    }
  }
  
  // If no explicit scope, use description as scope
  return text.substring(0, 200); // Limit to 200 chars
}

// Note: extractDependencies() is now imported from natural-language-parser.ts

/**
 * Extract risks from tokens
 */
function extractRisks(tokens: string[], structured?: string[]): string[] {
  if (structured && structured.length > 0) {
    return structured;
  }
  
  const risks: string[] = [];
  const text = tokens.join(' ');
  
  // Look for risk markers
  const riskPatterns = [
    /(?:risk|risky|concern|challenge|issue|problem)[s]?[:\s]+(.+?)(?:\.|$)/gi,
    /(?:might|may|could|potential)[:\s]+(.+?)(?:\.|$)/gi,
  ];
  
  for (const pattern of riskPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        risks.push(match[1].trim());
      }
    }
  }
  
  return risks;
}

/**
 * Extract constraints from tokens
 */
function extractConstraints(tokens: string[], structured?: string[]): string[] {
  if (structured && structured.length > 0) {
    return structured;
  }
  
  const constraints: string[] = [];
  const text = tokens.join(' ');
  
  // Look for constraint markers
  const constraintPatterns = [
    /(?:constraint|limit|restriction|must|cannot|cannot|should not)[s]?[:\s]+(.+?)(?:\.|$)/gi,
    /(?:within|limited by|bound by)[:\s]+(.+?)(?:\.|$)/gi,
  ];
  
  for (const pattern of constraintPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        constraints.push(match[1].trim());
      }
    }
  }
  
  return constraints;
}

// Note: extractPriority() is now imported from natural-language-parser.ts

/**
 * Extract effort estimate from tokens
 */
function extractEffort(tokens: string[]): string | undefined {
  const text = tokens.join(' ');
  
  // Look for time estimates
  const effortPatterns = [
    /(\d+)\s*(?:hour|hr|h)[s]?/gi,
    /(\d+)\s*(?:day|d)[s]?/gi,
    /(\d+)\s*(?:week|wk|w)[s]?/gi,
    /(\d+)\s*(?:month|mo|m)[s]?/gi,
    /(small|medium|large|complex|simple)\s*(?:effort|task|work)/gi,
  ];
  
  for (const pattern of effortPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  
  return undefined;
}

// Note: extractTags() is now imported from natural-language-parser.ts

// ===================================================================
// VALIDATION FUNCTIONS
// ===================================================================

/**
 * Validate tier-specific requirements
 */
function validateTierRequirements(
  output: PlanningOutput,
  tier: PlanningTier,
  errors: ParsingError[],
  suggestions: string[]
): void {
  switch (tier) {
    case 'feature':
      // Features should have multiple objectives and clear scope
      if (output.objectives.length < 2) {
        suggestions.push('Features typically have multiple objectives. Consider adding more specific goals.');
      }
      if (output.risks.length === 0) {
        suggestions.push('Consider identifying potential risks for this feature.');
      }
      break;
      
    case 'phase':
      // Phases should have clear scope and dependencies
      if (output.dependencies.length === 0) {
        suggestions.push('Phases often have dependencies. Consider identifying what this phase depends on.');
      }
      break;
      
    case 'session':
      // Sessions should have clear objectives
      if (output.objectives.length === 0) {
        errors.push({
          type: 'missing_field',
          field: 'objectives',
          message: 'Sessions require at least one objective',
        });
      }
      break;
      
    case 'task':
      // Tasks should have a single clear objective
      if (output.objectives.length === 0) {
        errors.push({
          type: 'missing_field',
          field: 'objectives',
          message: 'Tasks require at least one objective',
        });
      }
      if (output.objectives.length > 3) {
        suggestions.push('Tasks should be focused. Consider breaking this into multiple tasks.');
      }
      break;
  }
}

