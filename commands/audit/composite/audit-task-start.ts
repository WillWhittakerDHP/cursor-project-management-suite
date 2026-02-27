/**
 * Composite Command: /audit-task-start [task-id] [feature-name]
 * Run baseline audits for task tier start (mirrors task end: tier-task audits)
 *
 * Tier: Task (Tier 3 - Low-Level)
 * Operates on: Baseline quality assessment before task work begins
 *
 * LEARNING: Start audits establish baseline scores for comparison with end audits
 * PATTERN: Mirror task-end audits (audit:tier-task)
 */

import { TierAuditResult, AuditParams } from '../types';
import { auditTierQuality } from '../atomic/audit-tier-quality';
import { WorkflowCommandContext } from '../../utils/command-context';
import { resolveFeatureName } from '../../utils';
import { writeAuditReport, calculateOverallStatus, getRelativePath, storeBaselineScore } from '../utils';

export interface AuditTaskStartParams {
  taskId: string; // Format: X.Y.Z (e.g., "1.3.1")
  featureName?: string;
}

/**
 * Run baseline audits for task tier start (mirrors task-end: tier-task group)
 */
export async function auditTaskStart(params: AuditTaskStartParams): Promise<{
  success: boolean;
  auditResult: TierAuditResult;
  reportPath: string;
  fullReportPath?: string;
  output: string;
}> {
  const featureName = await resolveFeatureName(params.featureName);
  const context = new WorkflowCommandContext(featureName);

  const auditParams: AuditParams = {
    tier: 'task',
    identifier: params.taskId,
    featureName,
    modifiedFiles: [],
  };

  const results = [];
  const errors: string[] = [];

  try {
    results.push(await auditTierQuality({ ...auditParams, tier: 'task' }));
  } catch (_error) {
    errors.push(`Task tier quality audit failed: ${_error instanceof Error ? _error.message : String(_error)}`);
  }

  const overallStatus = calculateOverallStatus(results);
  const timestamp = new Date().toISOString();

  const auditResult: TierAuditResult = {
    tier: 'task',
    identifier: params.taskId,
    overallStatus,
    results,
    timestamp,
    reportPath: '',
    featureName,
  };

  try {
    const scores: Record<string, number> = {};
    for (const result of results) {
      if (result.score !== undefined) {
        scores[result.category] = result.score;
      }
    }
    await storeBaselineScore('task', params.taskId, featureName, scores);
  } catch (_error) {
    errors.push(`Failed to store baseline scores: ${_error instanceof Error ? _error.message : String(_error)}`);
  }

  let reportPath = '';
  try {
    reportPath = await writeAuditReport(auditResult, context, 'start');
    auditResult.reportPath = getRelativePath(reportPath);
  } catch (_error) {
    errors.push(`Failed to write audit report: ${_error instanceof Error ? _error.message : String(_error)}`);
  }

  const outputLines: string[] = [];
  outputLines.push(`# Task Start Audit: ${params.taskId}`);
  outputLines.push('');
  outputLines.push(`**Purpose:** Baseline quality assessment before Task ${params.taskId} work begins`);
  outputLines.push(`**Timestamp:** ${timestamp}`);
  outputLines.push(`**Overall Status:** ${overallStatus.toUpperCase()}`);
  outputLines.push(`**Report:** ${auditResult.reportPath || reportPath}`);
  outputLines.push('');

  if (errors.length > 0) {
    outputLines.push('## Errors');
    outputLines.push('');
    for (const error of errors) {
      outputLines.push(`- ⚠️ ${error}`);
    }
    outputLines.push('');
  }

  outputLines.push('## Baseline Scores');
  outputLines.push('');
  for (const result of results) {
    const emoji = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
    const scoreText = result.score !== undefined ? ` (${result.score}/100)` : '';
    const categoryLabel = result.category.charAt(0).toUpperCase() + result.category.slice(1).replace(/-/g, ' ');
    outputLines.push(`- ${emoji} **${categoryLabel}**: ${result.status}${scoreText} (baseline)`);
  }

  const scores = results.filter(r => r.score !== undefined).map(r => r.score as number);
  if (scores.length > 0) {
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    outputLines.push('');
    outputLines.push(`**Overall Baseline:** ${avgScore}/100`);
  }

  outputLines.push('');
  outputLines.push('## Notes');
  outputLines.push('');
  outputLines.push('- Baseline scores will be compared with end audit scores');
  outputLines.push('- Focus areas identified for improvement tracking');

  const success = errors.length === 0;

  return {
    success,
    auditResult,
    reportPath: auditResult.reportPath || reportPath,
    fullReportPath: reportPath,
    output: outputLines.join('\n'),
  };
}
