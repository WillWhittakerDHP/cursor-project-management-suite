/**
 * Composite Command: /audit-task [task-id] [feature-name]
 * Run selected audits for task tier (security, vue-architecture)
 *
 * Tier: Task (Tier 3 - Low-Level)
 * Operates on: Complete task audit
 */

import { TierAuditResult, AuditParams, AutofixResult } from '../types';
import { auditTierQuality } from '../atomic/audit-tier-quality';
import { runTierAutofix } from '../autofix/run-tier-autofix';
import { WorkflowCommandContext } from '../../utils/command-context';
import { resolveFeatureName } from '../../utils';
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
  autofixResult?: AutofixResult;
}> {
  const featureName = await resolveFeatureName(params.featureName);
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

  let tierQualityResult;
  try {
    tierQualityResult = await auditTierQuality({ ...auditParams, tier: 'task' });
    results.push(tierQualityResult);
  } catch (_error) {
    errors.push(`Task tier quality audit failed: ${_error instanceof Error ? _error.message : String(_error)}`);
  }

  let autofixResult: AutofixResult | undefined;
  if (tierQualityResult) {
    autofixResult = await runTierAutofix('task', tierQualityResult, {
      maxCascadeDepth: 0,
      featureName,
    });
    // Summary appended below
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
  } catch (_error) {
    errors.push(`Failed to write audit report: ${_error instanceof Error ? _error.message : String(_error)}`);
  }
  
  // Generate output message
  const outputLines: string[] = [];
  outputLines.push(`# Task Audit: ${params.taskId}`);
  outputLines.push('');
  outputLines.push(`**Overall Status:** ${overallStatus.toUpperCase()}`);
  outputLines.push(`**Report:** ${auditResult.reportPath || reportPath}`);
  outputLines.push('');
  outputLines.push('*Note: Task audits run tier-task group (typecheck, loop-mutations, hardcoding, error-handling, naming-convention, security) with --changed-only.*');
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
  } catch (_error) {
    outputLines.push('## External Signals (captured)');
    outputLines.push('');
    outputLines.push(`- **⚠️ Import failed:** ${_error instanceof Error ? _error.message : String(_error)}`);
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

  if (autofixResult) {
    outputLines.push('');
    outputLines.push('## Autofix');
    outputLines.push('');
    outputLines.push(autofixResult.summary);
    if (autofixResult.agentFixEntries.length > 0) {
      outputLines.push('');
      outputLines.push('**Agent directives:**');
      for (const e of autofixResult.agentFixEntries) {
        if (e.agentDirective) outputLines.push(`- ${e.agentDirective}`);
      }
    }
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
    output: outputLines.join('\n'),
    autofixResult,
  };
}

