/**
 * Composite Command: /handoff-complete [tier] [identifier]
 * Complete handoff workflow (generate + review)
 * 
 * Tier: Cross-tier utility
 * Operates on: Complete handoff workflow
 */

import { resolveFeatureName } from '../../utils';
import { generateHandoff, HandoffTier, GenerateHandoffParams } from '../atomic/generate-handoff';
import { reviewHandoff, ReviewHandoffParams } from '../atomic/review-handoff';

/**
 * Complete handoff workflow
 * 
 * Generates handoff and then reviews it for completeness.
 * 
 * @param tier Handoff tier
 * @param identifier Optional identifier
 * @param featureName Optional feature name (from .current-feature or git branch if omitted)
 * @param nextIdentifier Optional next identifier
 * @param transitionNotes Optional transition notes
 * @returns Formatted handoff workflow output
 */
export async function handoffComplete(
  tier: HandoffTier,
  identifier?: string,
  featureName?: string,
  nextIdentifier?: string,
  transitionNotes?: string
): Promise<string> {
  const resolved = await resolveFeatureName(featureName);
  const output: string[] = [];
  
  output.push(`# Complete Handoff Workflow: ${tier}${identifier ? ` ${identifier}` : ''}\n`);
  output.push('---\n\n');
  
  // Step 1: Generate handoff
  output.push('## Step 1: Generate Handoff\n\n');
  const generateParams: GenerateHandoffParams = {
    tier,
    identifier,
    featureName: resolved,
    nextIdentifier,
    transitionNotes
  };
  
  const generateOutput = await generateHandoff(generateParams);
  output.push(generateOutput);
  output.push('\n---\n\n');
  
  // Step 2: Review handoff
  output.push('## Step 2: Review Handoff\n\n');
  const reviewParams: ReviewHandoffParams = {
    tier,
    identifier,
    featureName: resolved
  };
  
  const reviewOutput = await reviewHandoff(reviewParams);
  output.push(reviewOutput);
  output.push('\n---\n\n');
  
  // Summary
  output.push('## Summary\n\n');
  output.push('Handoff workflow completed. Review the results above and update as needed.\n');
  
  return output.join('\n');
}

