/**
 * Composite Planning Command: /planning-plan-with-alternatives
 * Plan with alternatives generation and decision gate
 * 
 * Combines: parse → generate alternatives → analyze → decision gate
 */

import { parsePlainLanguage } from '../atomic/parse-plain-language';
import { generateAlternativesCommand, analyzeAlternativesCommand } from '../atomic/generate-alternatives';
import { createDecisionGateCommand, enforceDecisionGateCommand } from '../atomic/enforce-decision-gate';
import { PlanningInput, PlanningTier, AlternativeType } from '../../utils/planning-types';

/**
 * Plan with alternatives and decision gate
 * 
 * @param description Natural language description
 * @param tier Planning tier
 * @param feature Feature name context
 * @param phase Phase number context (optional)
 * @param sessionId Session ID context (optional)
 * @param taskId Task ID context (optional)
 * @param alternativeType Type of alternatives to generate
 * @param requireDecision Whether decision gate is required
 * @returns Planning output with alternatives and decision gate
 */
export async function planWithAlternatives(
  description: string,
  tier: PlanningTier,
  feature?: string,
  phase?: number,
  sessionId?: string,
  taskId?: string,
  alternativeType: AlternativeType = 'approach',
  requireDecision: boolean = true
): Promise<string> {
  const output: string[] = [];
  
  output.push('# Planning with Alternatives\n');
  output.push(`**Tier:** ${tier}\n`);
  output.push(`**Description:** ${description}\n`);
  output.push('\n---\n');
  
  // Step 1: Parse plain language
  output.push('## Step 1: Parse Planning Input\n');
  let planningOutput;
  try {
    const input: PlanningInput = {
      description,
      tier,
      feature,
      phase,
      sessionId,
      taskId,
    };
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
  
  // Step 2: Generate alternatives
  output.push('## Step 2: Generate Alternatives\n');
  let alternatives;
  try {
    const alternativesResult = await generateAlternativesCommand(planningOutput, alternativeType, 3);
    output.push(alternativesResult);
    output.push('\n---\n');
    
    // Extract alternatives from result (we need to get them from the generator)
    const { generateAlternatives } = await import('../../../project-manager/utils/alternatives-generator');
    const altResult = generateAlternatives(planningOutput, alternativeType, 3);
    alternatives = altResult.success ? altResult.alternatives : [];
  } catch (error) {
    output.push(`**ERROR:** Failed to generate alternatives\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push('\n---\n');
    alternatives = [];
  }
  
  // Step 3: Analyze alternatives
  if (alternatives.length > 0) {
    output.push('## Step 3: Analyze Alternatives\n');
    try {
      const analysisResult = await analyzeAlternativesCommand(alternatives);
      output.push(analysisResult);
      output.push('\n---\n');
    } catch (error) {
      output.push(`**WARNING:** Failed to analyze alternatives\n`);
      output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
      output.push('\n---\n');
    }
  }
  
  // Step 4: Create and enforce decision gate
  if (alternatives.length > 0) {
    output.push('## Step 4: Decision Gate\n');
    try {
      const gate = createDecisionGateCommand(
        `Choose ${alternativeType} for ${tier}`,
        alternatives,
        `Which ${alternativeType} should be used for this ${tier}?`,
        requireDecision
      );
      
      const gateResult = await enforceDecisionGateCommand(gate);
      output.push(gateResult);
      
      if (!gateResult.canProceed && requireDecision) {
        output.push('\n---\n');
        output.push('## ⚠️ Cannot Proceed\n');
        output.push('**A decision must be made before continuing.**\n');
        output.push('**Use:** `/planning-make-decision [gate-id] [alternative-id] [rationale]` to make a decision.\n');
      }
    } catch (error) {
      output.push(`**ERROR:** Failed to create decision gate\n`);
      output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    }
  } else {
    output.push('## Step 4: Decision Gate\n');
    output.push('**SKIPPED:** No alternatives generated, decision gate not needed\n');
  }
  
  output.push('\n---\n');
  output.push('## Summary\n');
  output.push('Planning with alternatives completed. Review alternatives and make a decision if required.\n');
  
  return output.join('\n');
}

