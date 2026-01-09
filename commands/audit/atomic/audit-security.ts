/**
 * Atomic Command: /audit-security [tier] [identifier] [feature-name]
 * Audit security standards compliance
 * 
 * Tier: Cross-tier utility
 * Operates on: Security compliance evaluation
 */

import { AuditResult, AuditFinding, AuditParams } from '../types';
import { securityAudit } from '../../security/composite/security-audit';

/**
 * Audit security for a tier
 * Wraps existing security-audit command with tier-specific context
 */
export async function auditSecurity(params: AuditParams): Promise<AuditResult> {
  const findings: AuditFinding[] = [];
  const recommendations: string[] = [];
  let score = 100;
  
  try {
    // Determine audit path - if path is server/src, use server/ for dependency checks
    let auditPath: string | undefined;
    
    if (params.modifiedFiles && params.modifiedFiles.length > 0) {
      // If we have modified files, check if any are server files
      const hasServerFiles = params.modifiedFiles.some(f => f.startsWith('server/'));
      const hasClientFiles = params.modifiedFiles.some(f => f.startsWith('client/'));
      
      if (hasServerFiles && !hasClientFiles) {
        // Only server files - use server/ for dependency checks
        auditPath = 'server';
      } else if (hasClientFiles && !hasServerFiles) {
        // Only client files - skip server-specific checks
        auditPath = undefined;
      } else {
        // Mixed or no preference - default to server
        auditPath = 'server';
      }
    } else {
      // Default to server code, but use server/ not server/src
      auditPath = 'server';
    }
    
    const securityReport = await securityAudit({ path: auditPath });
    
    // Parse security report for issues
    const hasErrors = securityReport.includes('❌');
    const hasWarnings = securityReport.includes('⚠️');
    
    // Count issues by category
    const errorMatches = securityReport.match(/❌/g);
    const warningMatches = securityReport.match(/⚠️/g);
    const errorCount = errorMatches ? errorMatches.length : 0;
    const warningCount = warningMatches ? warningMatches.length : 0;
    
    // Extract specific findings from report
    const lines = securityReport.split('\n');
    let currentCategory = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect category headers
      if (line.startsWith('###')) {
        currentCategory = line.replace('###', '').trim();
        continue;
      }
      
      // Detect errors
      if (line.includes('❌')) {
        const message = line.replace('❌', '').trim();
        findings.push({
          type: 'error',
          message: `${currentCategory}: ${message}`,
          location: currentCategory,
          suggestion: 'Review security guidelines and fix security issues'
        });
        score -= 10;
      }
      
      // Detect warnings
      if (line.includes('⚠️')) {
        const message = line.replace('⚠️', '').trim();
        findings.push({
          type: 'warning',
          message: `${currentCategory}: ${message}`,
          location: currentCategory,
          suggestion: 'Review security best practices'
        });
        score -= 5;
      }
    }
    
    // Check for common security patterns in modified files
    if (params.modifiedFiles && params.modifiedFiles.length > 0) {
      // Note: Detailed file-level security checks would require reading files
      // For now, we rely on the security-audit command output
    }
    
    // Generate recommendations
    if (errorCount > 0) {
      recommendations.push(`Fix ${errorCount} security error(s) immediately`);
      recommendations.push('Review SECURITY_GUIDELINES.md for best practices');
    }
    
    if (warningCount > 0) {
      recommendations.push(`Address ${warningCount} security warning(s)`);
    }
    
    if (errorCount === 0 && warningCount === 0) {
      recommendations.push('Security audit passed - maintain security standards');
    }
    
    // Additional recommendations based on tier and phase context
    if (params.tier === 'feature' || params.tier === 'phase') {
      // Check if this is Phase 3 (frontend work) - auth is deferred
      const isPhase3 = params.tier === 'phase' && params.identifier === '3';
      const hasOnlyClientFiles = params.modifiedFiles && params.modifiedFiles.length > 0 &&
        params.modifiedFiles.every(f => f.startsWith('client/'));
      
      if (isPhase3 || hasOnlyClientFiles) {
        findings.push({
          type: 'info',
          message: 'Authentication is deferred to future phase - frontend work in Phase 3',
          location: 'Phase 3',
          suggestion: 'Authentication will be implemented in later phase when backend API is integrated'
        });
        recommendations.push('Note: Authentication is deferred - Phase 3 focuses on frontend property system refactoring');
      } else {
      recommendations.push('Ensure all API endpoints have proper authentication');
      recommendations.push('Validate all user inputs on server side');
      }
    }
    
    // Determine status
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    if (hasErrors || errorCount > 0) {
      status = 'fail';
    } else if (hasWarnings || warningCount > 0) {
      status = 'warn';
    }
    
    score = Math.max(0, score);
    
    const summary = `Security audit ${status === 'pass' ? 'passed' : status === 'warn' ? 'passed with warnings' : 'failed'}. ${errorCount} error(s), ${warningCount} warning(s).`;
    
    return {
      category: 'security',
      status,
      score,
      findings,
      recommendations,
      summary
    };
    
  } catch (error) {
    return {
      category: 'security',
      status: 'fail',
      score: 0,
      findings: [{
        type: 'error',
        message: `Security audit failed: ${error instanceof Error ? error.message : String(error)}`,
        location: params.tier
      }],
      recommendations: ['Run /security-audit manually to review security issues'],
      summary: 'Security audit encountered an error'
    };
  }
}

