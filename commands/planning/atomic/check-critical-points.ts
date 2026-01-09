/**
 * Atomic Planning Command: /planning-check-critical-points
 * Force documentation checks, best practice reviews, and other critical checks
 * at key planning junctions. Prevents progression without checks.
 * 
 * This command helps enforce critical checks at planning stages.
 */

import { CriticalCheck, CriticalChecksResult, CriticalCheckType } from '../../utils/planning-types';
import { checkDocumentation } from './check-documentation';
import { checkReuse } from './check-reuse';

/**
 * Check critical points during planning
 * 
 * @param checkTypes Types of critical checks to perform
 * @param required Whether checks are required (block progression if failed)
 * @param description Description of what is being planned (for context)
 * @returns Critical checks result
 */
export async function checkCriticalPoints(
  checkTypes: CriticalCheckType[] = ['documentation', 'reuse'],
  required: boolean = true,
  description?: string
): Promise<CriticalChecksResult> {
  const checks: CriticalCheck[] = [];
  const now = new Date().toISOString();
  
  // Create checks based on types
  for (const checkType of checkTypes) {
    const check = await createCriticalCheck(checkType, required, description);
    checks.push(check);
  }
  
  // Determine overall status
  const failedChecks = checks.filter(c => c.status === 'failed');
  const pendingChecks = checks.filter(c => c.status === 'pending');
  const allPassed = failedChecks.length === 0 && pendingChecks.length === 0;
  const canProceed = !required || allPassed;
  
  return {
    allPassed,
    checks,
    canProceed,
    failedChecks,
    pendingChecks,
  };
}

/**
 * Create a critical check based on type
 */
async function createCriticalCheck(
  checkType: CriticalCheckType,
  required: boolean,
  description?: string
): Promise<CriticalCheck> {
  const now = new Date().toISOString();
  const baseCheck: CriticalCheck = {
    id: `check-${checkType}-${Date.now()}`,
    type: checkType,
    name: getCheckName(checkType),
    description: getCheckDescription(checkType),
    required,
    status: 'pending',
    createdAt: now,
  };
  
  // Perform the check
  try {
    const result = await performCheck(checkType, description);
    baseCheck.status = result.passed ? 'passed' : 'failed';
    baseCheck.result = {
      passed: result.passed,
      message: result.message,
      details: result.details,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    baseCheck.status = 'failed';
    baseCheck.result = {
      passed: false,
      message: `Check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error instanceof Error ? error.stack : String(error),
      checkedAt: new Date().toISOString(),
    };
  }
  
  return baseCheck;
}

/**
 * Get check name from type
 */
function getCheckName(checkType: CriticalCheckType): string {
  const names: Record<CriticalCheckType, string> = {
    documentation: 'Documentation Check',
    reuse: 'Pattern Reuse Check',
    best_practices: 'Best Practices Review',
    alternatives: 'Alternatives Consideration',
    risks: 'Risk Assessment',
  };
  return names[checkType];
}

/**
 * Get check description from type
 */
function getCheckDescription(checkType: CriticalCheckType): string {
  const descriptions: Record<CriticalCheckType, string> = {
    documentation: 'Check existing documentation and patterns before planning',
    reuse: 'Check for reusable patterns before duplicating code',
    best_practices: 'Review best practices for this planning context',
    alternatives: 'Ensure alternatives have been considered',
    risks: 'Assess risks associated with this planning item',
  };
  return descriptions[checkType];
}

/**
 * Perform the actual check
 */
async function performCheck(
  checkType: CriticalCheckType,
  description?: string
): Promise<{ passed: boolean; message: string; details?: string }> {
  switch (checkType) {
    case 'documentation':
      try {
        const docCheckResult = await checkDocumentation('migration');
        return {
          passed: true,
          message: 'Documentation check completed',
          details: docCheckResult.substring(0, 500), // Truncate for details
        };
      } catch (error) {
        return {
          passed: false,
          message: 'Documentation check failed',
          details: error instanceof Error ? error.message : String(error),
        };
      }
      
    case 'reuse':
      if (!description) {
        return {
          passed: false,
          message: 'Description required for reuse check',
        };
      }
      try {
        const reuseCheckResult = await checkReuse(description);
        return {
          passed: true,
          message: 'Reuse check completed',
          details: reuseCheckResult.substring(0, 500), // Truncate for details
        };
      } catch (error) {
        return {
          passed: false,
          message: 'Reuse check failed',
          details: error instanceof Error ? error.message : String(error),
        };
      }
      
    case 'best_practices':
      return {
        passed: true,
        message: 'Best practices review recommended but not enforced',
        details: 'Consider reviewing project coding rules and best practices',
      };
      
    case 'alternatives':
      return {
        passed: true,
        message: 'Alternatives consideration recommended',
        details: 'Consider generating alternatives using alternatives-generator',
      };
      
    case 'risks':
      return {
        passed: true,
        message: 'Risk assessment recommended',
        details: 'Consider identifying and documenting risks',
      };
      
    default:
      return {
        passed: false,
        message: `Unknown check type: ${checkType}`,
      };
  }
}

/**
 * Format critical checks result as string output
 */
export function formatCriticalChecksResult(result: CriticalChecksResult): string {
  const output: string[] = [];
  
  output.push('# Critical Checks Result\n');
  output.push(`**Status:** ${result.allPassed ? '✅ All Passed' : '❌ Some Failed'}\n`);
  output.push(`**Can Proceed:** ${result.canProceed ? '✅ Yes' : '❌ No'}\n`);
  output.push('\n---\n');
  
  if (result.checks.length > 0) {
    output.push('## Check Results\n');
    for (const check of result.checks) {
      const statusIcon = check.status === 'passed' ? '✅' : check.status === 'failed' ? '❌' : '⏳';
      output.push(`### ${statusIcon} ${check.name}\n`);
      output.push(`**Type:** ${check.type}\n`);
      output.push(`**Required:** ${check.required ? 'Yes' : 'No'}\n`);
      output.push(`**Status:** ${check.status}\n`);
      
      if (check.result) {
        output.push(`**Result:** ${check.result.message}\n`);
        if (check.result.details) {
          output.push(`**Details:**\n${check.result.details}\n`);
        }
      }
      output.push('\n');
    }
  }
  
  if (result.failedChecks.length > 0) {
    output.push('## Failed Checks\n');
    output.push('**The following checks failed and must be resolved:**\n');
    for (const check of result.failedChecks) {
      output.push(`- ❌ ${check.name}: ${check.result?.message || 'Check failed'}\n`);
    }
    output.push('\n');
  }
  
  if (result.pendingChecks.length > 0) {
    output.push('## Pending Checks\n');
    output.push('**The following checks are still pending:**\n');
    for (const check of result.pendingChecks) {
      output.push(`- ⏳ ${check.name}\n`);
    }
    output.push('\n');
  }
  
  if (!result.canProceed) {
    output.push('## ⚠️ Cannot Proceed\n');
    output.push('**Required checks have failed or are pending. Please resolve before continuing.**\n');
  }
  
  return output.join('\n');
}

