/**
 * Composite Command: /security-audit [path] [--strict]
 * Run all security checks and provide comprehensive report
 * 
 * Tier: Cross-tier utility
 * Operates on: Complete security audit
 */

import { checkDependencies } from '../atomic/check-dependencies';
import { checkSecrets } from '../atomic/check-secrets';
import { checkConfig } from '../atomic/check-config';
import { checkCSRF } from '../atomic/check-csrf';
import { checkAuth } from '../atomic/check-auth';
import { checkIDOR } from '../atomic/check-idor';

export interface SecurityAuditParams {
  path?: string;
  strict?: boolean;
}

/**
 * Run comprehensive security audit
 * 
 * @param params Audit parameters
 * @returns Formatted security audit report
 */
export async function securityAudit(params: SecurityAuditParams = {}): Promise<string> {
  const output: string[] = [];
  output.push('# Security Audit Report\n');
  output.push('---\n\n');
  output.push(`**Path:** ${params.path || 'entire codebase'}\n`);
  output.push(`**Strict Mode:** ${params.strict ? 'enabled' : 'disabled'}\n\n`);
  output.push('---\n\n');
  
  const results: {
    name: string;
    output: string;
    hasErrors: boolean;
  }[] = [];
  
  // Run all checks
  try {
    output.push('## Running Security Checks...\n\n');
    
    // 1. Dependencies
    output.push('### 1. Dependency Vulnerabilities\n\n');
    const depsResult = await checkDependencies({ path: params.path, strict: params.strict });
    results.push({
      name: 'Dependencies',
      output: depsResult,
      hasErrors: depsResult.includes('❌'),
    });
    output.push(depsResult);
    output.push('\n---\n\n');
    
    // 2. Secrets
    output.push('### 2. Exposed Secrets\n\n');
    const secretsResult = await checkSecrets({ path: params.path, strict: params.strict });
    results.push({
      name: 'Secrets',
      output: secretsResult,
      hasErrors: secretsResult.includes('❌'),
    });
    output.push(secretsResult);
    output.push('\n---\n\n');
    
    // 3. Configuration
    output.push('### 3. Security Configuration\n\n');
    const configResult = await checkConfig({ path: params.path });
    results.push({
      name: 'Configuration',
      output: configResult,
      hasErrors: configResult.includes('❌'),
    });
    output.push(configResult);
    output.push('\n---\n\n');
    
    // 4. CSRF
    output.push('### 4. CSRF Protection\n\n');
    const csrfResult = await checkCSRF({ path: params.path });
    results.push({
      name: 'CSRF',
      output: csrfResult,
      hasErrors: csrfResult.includes('❌'),
    });
    output.push(csrfResult);
    output.push('\n---\n\n');
    
    // 5. Authentication
    output.push('### 5. Authentication Patterns\n\n');
    const authResult = await checkAuth({ path: params.path });
    results.push({
      name: 'Authentication',
      output: authResult,
      hasErrors: authResult.includes('❌'),
    });
    output.push(authResult);
    output.push('\n---\n\n');
    
    // 6. IDOR
    output.push('### 6. IDOR Vulnerabilities\n\n');
    const idorResult = await checkIDOR({ path: params.path });
    results.push({
      name: 'IDOR',
      output: idorResult,
      hasErrors: idorResult.includes('❌'),
    });
    output.push(idorResult);
    output.push('\n---\n\n');
    
    // Summary
    output.push('## Audit Summary\n\n');
    
    const totalErrors = results.filter(r => r.hasErrors).length;
    const allPassed = totalErrors === 0;
    
    if (allPassed) {
      output.push('✅ **All security checks passed**\n\n');
    } else {
      output.push(`❌ **${totalErrors} security check(s) found issues**\n\n`);
    }
    
    output.push('| Check | Status |\n');
    output.push('|-------|--------|\n');
    for (const result of results) {
      const status = result.hasErrors ? '❌ Issues Found' : '✅ Passed';
      output.push(`| ${result.name} | ${status} |\n`);
    }
    
    output.push('\n---\n\n');
    output.push('## Next Steps\n\n');
    
    if (allPassed) {
      output.push('All security checks passed. Continue with regular development workflow.\n');
    } else {
      output.push('**Action Required:**\n');
      output.push('1. Review the detailed results above\n');
      output.push('2. Fix critical security issues before proceeding\n');
      output.push('3. Address warnings as time permits\n');
      output.push('4. Re-run security audit after fixes\n\n');
      output.push('**Note:** Some checks may have false positives. Review flagged items carefully.\n');
    }
    
    return output.join('\n');
  } catch (error) {
    output.push(`**ERROR: Security audit failed**\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    return output.join('\n');
  }
}

/**
 * Security audit (programmatic API)
 * 
 * @param params Audit parameters
 * @returns Structured audit result
 */
export async function securityAuditProgrammatic(
  params: SecurityAuditParams = {}
): Promise<{ success: boolean; hasErrors: boolean; error?: string }> {
  try {
    const output = await securityAudit(params);
    const hasErrors = output.includes('❌');
    
    return {
      success: true,
      hasErrors,
    };
  } catch (error) {
    return {
      success: false,
      hasErrors: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

