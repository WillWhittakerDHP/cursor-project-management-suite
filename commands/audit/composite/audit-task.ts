/**
 * Composite Command: /audit-task [task-id] [feature-name]
 * Run selected audits for task tier (excludes planning and docs)
 * 
 * Tier: Task (Tier 3 - Low-Level)
 * Operates on: Complete task audit
 */

import { TierAuditResult, AuditParams } from '../types';
import { auditComments } from '../atomic/audit-comments';
import { auditTodos } from '../atomic/audit-todos';
import { auditSecurity } from '../atomic/audit-security';
import { auditCheckpoints } from '../atomic/audit-checkpoints';
import { auditTests } from '../atomic/audit-tests';
import { auditVueArchitecture } from '../atomic/audit-vue-architecture';
import { WorkflowCommandContext } from '../../utils/command-context';
import { writeAuditReport, calculateOverallStatus, getRelativePath } from '../utils';
import { importExternalAudits } from '../external/import-external-audits';

export interface AuditTaskParams {
  taskId: string; // Format: X.Y.Z (e.g., "1.3.1")
  featureName?: string;
  modifiedFiles?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  testResults?: any;
}

/**
 * Run selected audits for task tier (excludes planning and docs)
 */
export async function auditTask(params: AuditTaskParams): Promise<{
  success: boolean;
  auditResult: TierAuditResult;
  reportPath: string;
  fullReportPath?: string; // Full path for file opening
  output: string;
}> {
  const featureName = params.featureName || 'vue-migration';
  const context = new WorkflowCommandContext(featureName);
  
  const auditParams: AuditParams = {
    tier: 'task',
    identifier: params.taskId,
    featureName,
    modifiedFiles: params.modifiedFiles,
    testResults: params.testResults
  };
  
  const results = [];
  const errors: string[] = [];
  
  // Run 5 atomic audits (exclude planning and docs)
  try {
    results.push(await auditComments(auditParams));
  } catch (error) {
    errors.push(`Comments audit failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  try {
    results.push(await auditTodos(auditParams));
  } catch (error) {
    errors.push(`Todos audit failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  try {
    results.push(await auditSecurity(auditParams));
  } catch (error) {
    errors.push(`Security audit failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  try {
    results.push(await auditCheckpoints(auditParams));
  } catch (error) {
    errors.push(`Checkpoints audit failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  try {
    results.push(await auditTests(auditParams));
  } catch (error) {
    errors.push(`Tests audit failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    results.push(await auditVueArchitecture(auditParams));
  } catch (error) {
    errors.push(`Vue architecture audit failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Create audit result
  const overallStatus = calculateOverallStatus(results);
  const timestamp = new Date().toISOString();
  
  const auditResult: TierAuditResult = {
    tier: 'task',
    identifier: params.taskId,
    overallStatus,
    results,
    timestamp,
    reportPath: '', // Will be set after writing report
    featureName
  };
  
  // Write audit report
  let reportPath = '';
  try {
    reportPath = await writeAuditReport(auditResult, context);
    auditResult.reportPath = getRelativePath(reportPath);
  } catch (error) {
    errors.push(`Failed to write audit report: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Generate output message
  const outputLines: string[] = [];
  outputLines.push(`# Task Audit: ${params.taskId}`);
  outputLines.push('');
  outputLines.push(`**Overall Status:** ${overallStatus.toUpperCase()}`);
  outputLines.push(`**Report:** ${auditResult.reportPath || reportPath}`);
  outputLines.push('');
  outputLines.push('*Note: Task audits exclude planning and docs (tasks use session-level docs)*');
  outputLines.push('');

  // External signals import (no execution, only capture already-emitted artifacts)
  try {
    const external = await importExternalAudits(context, { tier: 'task', identifier: params.taskId });
    const copiedCount = external.items.reduce((sum, i) => sum + i.copied.length, 0);
    const missingCount = external.items.reduce((sum, i) => sum + i.missing.length, 0);
    const errorCount = external.items.reduce((sum, i) => sum + i.errors.length, 0);

    outputLines.push('## External Signals (captured)');
    outputLines.push('');
    outputLines.push(`- **Location:** \`${external.outputDir}\``);
    outputLines.push(`- **Copied:** ${copiedCount} file(s)`);
    if (missingCount > 0) outputLines.push(`- **Missing:** ${missingCount} file(s) (signals not present yet)`);
    if (errorCount > 0) outputLines.push(`- **Errors:** ${errorCount} (copy failures)`);
    outputLines.push('');
  } catch (error) {
    outputLines.push('## External Signals (captured)');
    outputLines.push('');
    outputLines.push(`- **⚠️ Import failed:** ${error instanceof Error ? error.message : String(error)}`);
    outputLines.push('');
  }
  
  if (errors.length > 0) {
    outputLines.push('## Errors');
    outputLines.push('');
    for (const error of errors) {
      outputLines.push(`- ⚠️ ${error}`);
    }
    outputLines.push('');
  }
  
  outputLines.push('## Results Summary');
  outputLines.push('');
  for (const result of results) {
    const emoji = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
    outputLines.push(`- ${emoji} **${result.category}**: ${result.status} ${result.score !== undefined ? `(${result.score}/100)` : ''}`);
  }
  
  // Add review prompt
  outputLines.push('');
  outputLines.push('---');
  outputLines.push('');
  outputLines.push('## 📋 Review Request');
  outputLines.push('');
  outputLines.push(`**Please review the audit report with me:**`);
  outputLines.push('');
  outputLines.push(`📄 **Report File:** \`${reportPath}\``);
  outputLines.push('');
  outputLines.push('**Questions to consider:**');
  outputLines.push('- Are the audit findings accurate?');
  outputLines.push('- Are there false positives or missing issues?');
  outputLines.push('- How can we improve the audit checks?');
  outputLines.push('- What workflow refinements do the audits suggest?');
  outputLines.push('');
  outputLines.push('*The audit report file should be open in your editor. Let\'s review it together to refine the workflow command tool.*');
  
  const success = errors.length === 0 && overallStatus !== 'fail';
  
  return {
    success,
    auditResult,
    reportPath: auditResult.reportPath || reportPath,
    fullReportPath: reportPath,
    output: outputLines.join('\n')
  };
}

