/**
 * Composite Planning Command: /planning-plan-complete
 * Complete planning workflow with all checks and features
 * 
 * Full workflow: parse → docs check → reuse check → alternatives (if required) → 
 * decision gate (if required) → critical checks → validate
 */

import { parsePlainLanguage } from '../atomic/parse-plain-language';
import { checkDocumentation } from '../atomic/check-documentation';
import { checkReuse } from '../atomic/check-reuse';
import { checkCriticalPoints, formatCriticalChecksResult } from '../atomic/check-critical-points';
import { generateAlternativesCommand } from '../atomic/generate-alternatives';
import { createDecisionGateCommand, enforceDecisionGateCommand } from '../atomic/enforce-decision-gate';
import { validatePlanningCommand } from '../atomic/validate-planning';
import { PlanningInput, PlanningTier, AlternativeType, CriticalCheckType } from '../../utils/planning-types';
import { CompletePlanningResult } from '../../utils/planning-types';

/**
 * Complete planning workflow
 * 
 * @param description Natural language description
 * @param tier Planning tier
 * @param feature Feature name context
 * @param phase Phase number context (optional)
 * @param sessionId Session ID context (optional)
 * @param taskId Task ID context (optional)
 * @param options Planning options
 * @returns Complete planning result
 */
export async function planComplete(
  description: string,
  tier: PlanningTier,
  feature?: string,
  phase?: number,
  sessionId?: string,
  taskId?: string,
  options: {
    docCheckType?: 'component' | 'transformer' | 'pattern' | 'migration';
    requireAlternatives?: boolean;
    alternativeType?: AlternativeType;
    requireDecision?: boolean;
    criticalChecks?: CriticalCheckType[];
    requireCriticalChecks?: boolean;
  } = {}
): Promise<string> {
  const output: string[] = [];
  const {
    docCheckType = 'migration',
    requireAlternatives = false,
    alternativeType = 'approach',
    requireDecision = false,
    criticalChecks = ['documentation', 'reuse'],
    requireCriticalChecks = true,
  } = options;
  
  output.push('# Complete Planning Workflow\n');
  output.push(`**Tier:** ${tier}\n`);
  output.push(`**Description:** ${description}\n`);
  output.push('\n---\n');
  
  const input: PlanningInput = {
    description,
    tier,
    feature,
    phase,
    sessionId,
    taskId,
  };
  
  // Step 1: Parse plain language
  output.push('## Step 1: Parse Planning Input\n');
  let planningOutput;
  try {
    const { parseNaturalLanguage } = await import('../../../project-manager/utils/planning-parser');
    const parseResult = parseNaturalLanguage(input);
    
    if (!parseResult.success || !parseResult.output) {
      output.push('**ERROR:** Failed to parse planning input\n');
      if (parseResult.errors) {
        parseResult.errors.forEach(error => {
          output.push(`- ${error.message}\n`);
        });
      }
      return output.join('\n');
    }
    
    planningOutput = parseResult.output;
    const parseOutput = await parsePlainLanguage(description, tier, feature, phase, sessionId, taskId);
    output.push(parseOutput);
    output.push('\n---\n');
  } catch (error) {
    output.push(`**ERROR:** Failed to parse planning input\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    return output.join('\n');
  }
  
  // Step 2: Check documentation
  output.push('## Step 2: Documentation Check\n');
  try {
    const docCheckResult = await checkDocumentation(docCheckType);
    output.push(docCheckResult);
    output.push('\n---\n');
  } catch (error) {
    output.push(`**WARNING:** Documentation check failed\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push('\n---\n');
  }
  
  // Step 3: Check reuse
  output.push('## Step 3: Pattern Reuse Check\n');
  try {
    const reuseCheckResult = await checkReuse(description);
    output.push(reuseCheckResult);
    output.push('\n---\n');
  } catch (error) {
    output.push(`**WARNING:** Reuse check failed\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push('\n---\n');
  }
  
  // Step 4: Generate alternatives (if required)
  let alternatives: import('../../../project-manager/utils/planning-types').Alternative[] = [];
  let alternativesResult;
  if (requireAlternatives) {
    output.push('## Step 4: Generate Alternatives\n');
    try {
      const altResultOutput = await generateAlternativesCommand(planningOutput, alternativeType, 3);
      output.push(altResultOutput);
      output.push('\n---\n');
      
      const { generateAlternatives } = await import('../../../project-manager/utils/alternatives-generator');
      const altResult = generateAlternatives(planningOutput, alternativeType, 3);
      if (altResult.success) {
        alternatives = altResult.alternatives;
        alternativesResult = altResult;
      }
    } catch (error) {
      output.push(`**ERROR:** Failed to generate alternatives\n`);
      output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
      output.push('\n---\n');
    }
  }
  
  // Step 5: Decision gate (if required)
  let decisionGate;
  if (requireDecision && alternatives.length > 0) {
    output.push('## Step 5: Decision Gate\n');
    try {
      const gate = createDecisionGateCommand(
        `Choose ${alternativeType} for ${tier}`,
        alternatives,
        `Which ${alternativeType} should be used for this ${tier}?`,
        requireDecision
      );
      
      const gateResult = await enforceDecisionGateCommand(gate);
      output.push(gateResult);
      decisionGate = gateResult;
      
      if (!gateResult.canProceed) {
        output.push('\n---\n');
        output.push('## ⚠️ Cannot Proceed\n');
        output.push('**A decision must be made before continuing.**\n');
      }
      output.push('\n---\n');
    } catch (error) {
      output.push(`**ERROR:** Failed to create decision gate\n`);
      output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
      output.push('\n---\n');
    }
  }
  
  // Step 6: Critical checks
  output.push('## Step 6: Critical Checks\n');
  try {
    const criticalChecksResult = await checkCriticalPoints(criticalChecks, requireCriticalChecks, description);
    const checksOutput = formatCriticalChecksResult(criticalChecksResult);
    output.push(checksOutput);
    output.push('\n---\n');
    
    if (!criticalChecksResult.canProceed && requireCriticalChecks) {
      output.push('## ⚠️ Cannot Proceed\n');
      output.push('**Critical checks must pass before continuing.**\n');
    }
  } catch (error) {
    output.push(`**WARNING:** Critical checks failed\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push('\n---\n');
  }
  
  // Step 7: Validate planning
  output.push('## Step 7: Planning Validation\n');
  try {
    const validationResult = await validatePlanningCommand(
      planningOutput,
      tier,
      decisionGate?.gate ? [decisionGate.gate] : undefined,
      requireAlternatives
    );
    output.push(validationResult);
  } catch (error) {
    output.push(`**WARNING:** Validation failed\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  output.push('\n---\n');
  output.push('## Summary\n');
  output.push('Complete planning workflow finished. Review all results above before proceeding.\n');
  
  return output.join('\n');
}

