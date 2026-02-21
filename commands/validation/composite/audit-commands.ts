/**
 * Composite Command: /audit-commands
 * Complete audit of commands workflow
 * 
 * Tier: Cross-tier utility
 * Operates on: Complete commands workflow audit
 * 
 * Composition: Runs all audit checks and generates comprehensive report
 */

import { auditPatterns } from '../atomic/audit-patterns';
import { auditDependencies } from '../atomic/audit-dependencies';
import { auditExports } from '../atomic/audit-exports';
import { auditSignatures } from '../atomic/audit-signatures';
import { auditDocumentation } from '../atomic/audit-documentation';
import { auditRegistry } from '../atomic/audit-registry';
import { auditFallback } from '../atomic/audit-fallback';
import { generateAuditReport, formatAuditReport } from '../atomic/audit-report';
import { AuditResult } from '../atomic/audit-types';
import { writeProjectFile } from '../../utils/utils';

/**
 * Run complete commands workflow audit
 * 
 * @returns Formatted markdown report
 */
export async function auditCommands(): Promise<string> {
  const output: string[] = [];
  
  output.push('# Running Commands Workflow Audit\n\n');
  output.push(`**Started:** ${new Date().toISOString()}\n\n`);
  output.push('---\n\n');
  
  const results: AuditResult[] = [];
  
  // Run all audit checks
  try {
    output.push('## Running Pattern Consistency Check...\n');
    const patternResult = await auditPatterns();
    results.push(patternResult);
    output.push(`✅ Completed: ${patternResult.status} (${patternResult.issues.length} issues)\n\n`);
  } catch (_error) {
    output.push(`❌ Failed: ${_error instanceof Error ? _error.message : String(_error)}\n\n`);
  }
  
  try {
    output.push('## Running Dependency Check...\n');
    const dependencyResult = await auditDependencies();
    results.push(dependencyResult);
    output.push(`✅ Completed: ${dependencyResult.status} (${dependencyResult.issues.length} issues)\n\n`);
  } catch (_error) {
    output.push(`❌ Failed: ${_error instanceof Error ? _error.message : String(_error)}\n\n`);
  }
  
  try {
    output.push('## Running Export Usage Check...\n');
    const exportResult = await auditExports();
    results.push(exportResult);
    output.push(`✅ Completed: ${exportResult.status} (${exportResult.issues.length} issues)\n\n`);
  } catch (_error) {
    output.push(`❌ Failed: ${_error instanceof Error ? _error.message : String(_error)}\n\n`);
  }
  
  try {
    output.push('## Running Signature Consistency Check...\n');
    const signatureResult = await auditSignatures();
    results.push(signatureResult);
    output.push(`✅ Completed: ${signatureResult.status} (${signatureResult.issues.length} issues)\n\n`);
  } catch (_error) {
    output.push(`❌ Failed: ${_error instanceof Error ? _error.message : String(_error)}\n\n`);
  }
  
  try {
    output.push('## Running Documentation Check...\n');
    const docResult = await auditDocumentation();
    results.push(docResult);
    output.push(`✅ Completed: ${docResult.status} (${docResult.issues.length} issues)\n\n`);
  } catch (_error) {
    output.push(`❌ Failed: ${_error instanceof Error ? _error.message : String(_error)}\n\n`);
  }

  try {
    output.push('## Running Registry Drift Check...\n');
    const registryResult = await auditRegistry();
    results.push(registryResult);
    output.push(`✅ Completed: ${registryResult.status} (${registryResult.issues.length} issues)\n\n`);
  } catch (_error) {
    output.push(`❌ Failed: ${_error instanceof Error ? _error.message : String(_error)}\n\n`);
  }

  try {
    output.push('## Running Fallback Check...\n');
    const fallbackResult = await auditFallback();
    results.push(fallbackResult);
    output.push(`✅ Completed: ${fallbackResult.status} (${fallbackResult.issues.length} issues)\n\n`);
  } catch (_error) {
    output.push(`❌ Failed: ${_error instanceof Error ? _error.message : String(_error)}\n\n`);
  }
  
  output.push('---\n\n');
  
  // Generate report
  const report = generateAuditReport(results);
  const reportMarkdown = formatAuditReport(report);
  
  // Save report to file
  try {
    await writeProjectFile('.cursor/commands/validation/AUDIT_REPORT.md', reportMarkdown);
    output.push('## Report Saved\n\n');
    output.push('✅ Audit report saved to `.cursor/commands/validation/AUDIT_REPORT.md`\n\n');
  } catch (_error) {
    output.push(`⚠️ Failed to save report: ${_error instanceof Error ? _error.message : String(_error)}\n\n`);
  }
  
  output.push('---\n\n');
  output.push(reportMarkdown);
  
  return output.join('');
}

