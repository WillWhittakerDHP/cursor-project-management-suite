/**
 * Atomic Command: Audit Report Generator
 * Formats audit results into structured markdown report
 */

import { AuditResult, AuditReport } from './audit-types';
import { getCurrentDate } from '../../utils/utils';

// Re-export AuditReport for convenience
export type { AuditReport } from './audit-types';

/**
 * Generate markdown report from audit results
 */
export function generateAuditReport(results: AuditResult[]): AuditReport {
  const allIssues = results.flatMap(r => r.issues);
  
  const critical = allIssues.filter(i => i.severity === 'critical').length;
  const warnings = allIssues.filter(i => i.severity === 'warning').length;
  const info = allIssues.filter(i => i.severity === 'info').length;
  const errors = allIssues.filter(i => i.severity === 'error').length;
  
  const checksPassed = results.filter(r => r.status === 'pass').length;
  const checksWithWarnings = results.filter(r => r.status === 'warning').length;
  const checksFailed = results.filter(r => r.status === 'error').length;
  
  const allRecommendations = results.flatMap(r => r.recommendations);
  const uniqueRecommendations = Array.from(new Set(allRecommendations));
  
  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalIssues: allIssues.length,
      critical: critical + errors,
      warnings,
      info,
      checksRun: results.length,
      checksPassed,
      checksWithWarnings,
      checksFailed,
    },
    results,
    recommendations: uniqueRecommendations,
  };
}

/**
 * Format audit report as markdown
 */
export function formatAuditReport(report: AuditReport): string {
  const output: string[] = [];
  
  output.push('# Commands Workflow Audit Report\n');
  output.push(`**Generated:** ${new Date(report.timestamp).toLocaleString()}\n`);
  output.push(`**Date:** ${getCurrentDate()}\n`);
  output.push('\n---\n\n');
  
  // Summary
  output.push('## Summary\n\n');
  output.push(`- **Total Issues:** ${report.summary.totalIssues}`);
  output.push(`- **Critical/Errors:** ${report.summary.critical}`);
  output.push(`- **Warnings:** ${report.summary.warnings}`);
  output.push(`- **Info:** ${report.summary.info}`);
  output.push(`- **Checks Run:** ${report.summary.checksRun}`);
  output.push(`- **Checks Passed:** ${report.summary.checksPassed}`);
  output.push(`- **Checks with Warnings:** ${report.summary.checksWithWarnings}`);
  output.push(`- **Checks Failed:** ${report.summary.checksFailed}\n`);
  
  // Status overview
  const statusEmoji = (status: string) => {
    switch (status) {
      case 'pass': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return '❓';
    }
  };
  
  output.push('## Check Results\n\n');
  for (const result of report.results) {
    output.push(`### ${statusEmoji(result.status)} ${result.check}\n\n`);
    if (result.summary) {
      output.push(`*${result.summary}*\n\n`);
    }
    
    if (result.issues.length === 0) {
      output.push('No issues found.\n\n');
    } else {
      // Group issues by severity
      const criticalIssues = result.issues.filter(i => i.severity === 'critical' || i.severity === 'error');
      const warningIssues = result.issues.filter(i => i.severity === 'warning');
      const infoIssues = result.issues.filter(i => i.severity === 'info');
      
      if (criticalIssues.length > 0) {
        output.push('#### Critical Issues\n\n');
        for (const issue of criticalIssues) {
          output.push(`- **${issue.severity.toUpperCase()}:** ${issue.message}`);
          if (issue.file) {
            output.push(`  - File: \`${issue.file}\``);
            if (issue.line) {
              output.push(`  - Line: ${issue.line}`);
            }
          }
          if (issue.code) {
            output.push(`  - Code: \`${issue.code}\``);
          }
          if (issue.suggestion) {
            output.push(`  - Suggestion: ${issue.suggestion}`);
          }
          output.push('');
        }
        output.push('\n');
      }
      
      if (warningIssues.length > 0) {
        output.push('#### Warnings\n\n');
        for (const issue of warningIssues) {
          output.push(`- ${issue.message}`);
          if (issue.file) {
            output.push(`  - File: \`${issue.file}\``);
            if (issue.line) {
              output.push(`  - Line: ${issue.line}`);
            }
          }
          if (issue.suggestion) {
            output.push(`  - Suggestion: ${issue.suggestion}`);
          }
          output.push('');
        }
        output.push('\n');
      }
      
      if (infoIssues.length > 0) {
        output.push('#### Info\n\n');
        for (const issue of infoIssues) {
          output.push(`- ${issue.message}`);
          if (issue.file) {
            output.push(`  - File: \`${issue.file}\``);
          }
          if (issue.suggestion) {
            output.push(`  - Suggestion: ${issue.suggestion}`);
          }
          output.push('');
        }
        output.push('\n');
      }
    }
    
    if (result.recommendations.length > 0) {
      output.push('#### Recommendations\n\n');
      for (const rec of result.recommendations) {
        output.push(`- ${rec}\n`);
      }
      output.push('\n');
    }
    
    output.push('---\n\n');
  }
  
  // Overall recommendations
  if (report.recommendations.length > 0) {
    output.push('## Overall Recommendations\n\n');
    for (const rec of report.recommendations) {
      output.push(`- ${rec}\n`);
    }
    output.push('\n');
  }
  
  // Priority actions
  const criticalIssues = report.results.flatMap(r => r.issues.filter(i => i.severity === 'critical' || i.severity === 'error'));
  if (criticalIssues.length > 0) {
    output.push('## Priority Actions\n\n');
    output.push('The following critical issues should be addressed immediately:\n\n');
    for (const issue of criticalIssues.slice(0, 10)) { // Top 10
      output.push(`1. ${issue.message}`);
      if (issue.file) {
        output.push(`   - File: \`${issue.file}\``);
      }
      if (issue.suggestion) {
        output.push(`   - Fix: ${issue.suggestion}`);
      }
      output.push('');
    }
    if (criticalIssues.length > 10) {
      output.push(`\n... and ${criticalIssues.length - 10} more critical issues.\n`);
    }
    output.push('\n');
  }
  
  output.push('---\n\n');
  output.push('*Report generated by Commands Workflow Audit System*\n');
  
  return output.join('');
}

