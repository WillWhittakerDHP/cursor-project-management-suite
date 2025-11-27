/**
 * Composite Planning Command: /planning-plan-with-checks
 * Plan with documentation checks, reuse checks, and validation
 * 
 * Combines: parse → docs check → reuse check → validate
 */

import { parsePlainLanguage } from '../atomic/parse-plain-language';
import { checkDocumentation } from '../atomic/check-documentation';
import { checkReuse } from '../atomic/check-reuse';
import { validatePlanningCommand } from '../atomic/validate-planning';
import { PlanningInput, PlanningTier } from '../../utils/planning-types';

/**
 * Plan with comprehensive checks
 * 
 * @param description Natural language description
 * @param tier Planning tier
 * @param feature Feature name context
 * @param phase Phase number context (optional)
 * @param sessionId Session ID context (optional)
 * @param taskId Task ID context (optional)
 * @param docCheckType Type of documentation check
 * @returns Comprehensive planning output with checks
 */
export async function planWithChecks(
  description: string,
  tier: PlanningTier,
  feature?: string,
  phase?: number,
  sessionId?: string,
  taskId?: string,
  docCheckType: 'component' | 'transformer' | 'pattern' | 'migration' = 'migration'
): Promise<string> {
  const output: string[] = [];
  
  output.push('# Planning with Checks\n');
  output.push(`**Tier:** ${tier}\n`);
  output.push(`**Description:** ${description}\n`);
  output.push('\n---\n');
  
  // Step 1: Parse plain language
  output.push('## Step 1: Parse Planning Input\n');
  try {
    const parseResult = await parsePlainLanguage(description, tier, feature, phase, sessionId, taskId);
    output.push(parseResult);
    output.push('\n---\n');
  } catch (error) {
    output.push(`**ERROR:** Failed to parse planning input\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push('\n---\n');
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
  
  // Step 4: Validate planning
  output.push('## Step 4: Planning Validation\n');
  try {
    // Parse again to get structured output for validation
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
    
    if (parseResult.success && parseResult.output) {
      const validationResult = await validatePlanningCommand(parseResult.output, tier);
      output.push(validationResult);
    } else {
      output.push('**WARNING:** Cannot validate - parsing failed\n');
      if (parseResult.errors) {
        output.push('**Parsing Errors:**\n');
        parseResult.errors.forEach(error => {
          output.push(`- ${error.message}\n`);
        });
      }
    }
  } catch (error) {
    output.push(`**WARNING:** Validation failed\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  output.push('\n---\n');
  
  // Step 5: Security Audit (optional but recommended)
  output.push('## Step 5: Security Validation\n');
  try {
    const { securityAudit } = await import('../../security/composite/security-audit');
    const securityResult = await securityAudit({ path: 'server/src' });
    output.push(securityResult);
  } catch (error) {
    output.push(`**WARNING:** Security check failed\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push('**Note:** Security checks are optional but recommended. You can run `/security-audit` manually.\n');
  }
  
  output.push('\n---\n');
  output.push('## Summary\n');
  output.push('Planning with checks completed. Review the results above before proceeding.\n');
  
  return output.join('\n');
}

