/**
 * Composite Command: /validate-complete [tier] [identifier]
 * Complete validation workflow
 * 
 * Tier: Cross-tier utility
 * Operates on: Complete validation workflow
 */

import { validateWorkflow, ValidationTier, ValidateWorkflowParams } from '../atomic/validate-workflow';
import { verifyCompleteness, VerifyCompletenessParams } from '../atomic/verify-completeness';

/**
 * Complete validation workflow
 * 
 * Validates workflow state and verifies completeness.
 * 
 * @param tier Validation tier
 * @param identifier Optional identifier
 * @param featureName Optional feature name
 * @returns Formatted validation output
 */
export async function validateComplete(
  tier: ValidationTier,
  identifier?: string,
  featureName: string = 'vue-migration'
): Promise<string> {
  const output: string[] = [];
  
  output.push(`# Complete Validation: ${tier}${identifier ? ` ${identifier}` : ''}\n`);
  output.push('---\n\n');
  
  // Step 1: Validate workflow state
  output.push('## Step 1: Validate Workflow State\n\n');
  const validateParams: ValidateWorkflowParams = {
    tier,
    identifier,
    featureName
  };
  
  const validateOutput = await validateWorkflow(validateParams);
  output.push(validateOutput);
  output.push('\n---\n\n');
  
  // Step 2: Verify completeness
  output.push('## Step 2: Verify Completeness\n\n');
  const completenessParams: VerifyCompletenessParams = {
    tier,
    identifier,
    featureName
  };
  
  const completenessOutput = await verifyCompleteness(completenessParams);
  output.push(completenessOutput);
  output.push('\n---\n\n');
  
  // Summary
  output.push('## Summary\n\n');
  const hasErrors = validateOutput.includes('❌') || completenessOutput.includes('❌');
  
  if (hasErrors) {
    output.push('❌ **Validation found issues**\n');
    output.push('Review the errors above and fix them before proceeding.\n');
  } else {
    output.push('✅ **Validation passed**\n');
    output.push('Workflow state is valid and complete.\n');
  }
  
  return output.join('\n');
}

