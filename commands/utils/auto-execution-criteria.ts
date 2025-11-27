/**
 * Atomic Command: Auto-Execution Criteria
 * 
 * Purpose: Centralized logic for determining if change is safe to auto-execute
 * 
 * This is a pure function that checks auto-execution criteria.
 * Used by scope-and-change to decide whether to execute immediately or kickout.
 * 
 * LEARNING: Centralizing criteria logic makes it easier to maintain and test
 * WHY: Criteria might change - better to have it in one place
 * PATTERN: Pure function pattern - no side effects, predictable output
 */

import { TierAnalysis } from './tier-discriminator';

export interface AutoExecutionCheckResult {
  safe: boolean;
  reasons: string[];
}

/**
 * Check if change is safe for auto-execution
 * 
 * Criteria (ALL must be met):
 * - Tier confidence: HIGH
 * - Tier level: Session or Task (not Feature/Phase)
 * - Complexity: LOW
 * - Files affected: ≤ 3 files
 * - No dependencies mentioned
 * - No research needed
 */
export function isSafeForAutoExecution(
  tierAnalysis: TierAnalysis,
  filesAffected: string[]
): AutoExecutionCheckResult {
  const reasons: string[] = [];
  
  // Check confidence
  if (tierAnalysis.confidence !== 'high') {
    reasons.push(`Tier confidence is ${tierAnalysis.confidence} (requires HIGH)`);
  }
  
  // Check tier level (only Session/Task allowed)
  if (tierAnalysis.tier === 'feature' || tierAnalysis.tier === 'phase') {
    reasons.push(`Tier is ${tierAnalysis.tier} (only Session/Task allowed for auto-execution)`);
  }
  
  // Check complexity
  if (tierAnalysis.scopeAssessment.complexity !== 'low') {
    reasons.push(`Complexity is ${tierAnalysis.scopeAssessment.complexity} (requires LOW)`);
  }
  
  // Check files affected
  if (filesAffected.length > 3) {
    reasons.push(`Too many files affected (${filesAffected.length}, max 3)`);
  }
  
  // Check dependencies
  if (tierAnalysis.scopeAssessment.dependencies.length > 0) {
    reasons.push(`Dependencies mentioned: ${tierAnalysis.scopeAssessment.dependencies.join(', ')}`);
  }
  
  // Check research needed
  if (tierAnalysis.scopeAssessment.researchNeeded) {
    reasons.push('Research needed (requires manual review)');
  }
  
  const safe = reasons.length === 0;
  return { safe, reasons };
}

