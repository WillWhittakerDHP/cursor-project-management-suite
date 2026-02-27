/**
 * Composite Command: /audit-phase-start [phase] [feature-name]
 * Run baseline audits for phase tier start (mirrors phase end: tier-phase audits)
 *
 * Tier: Phase (Tier 1 - High-Level)
 * Operates on: Baseline quality assessment before phase work begins
 *
 * LEARNING: Start audits establish baseline scores for comparison with end audits
 * PATTERN: Mirror phase-end audits (audit:tier-phase)
 */

import { TierAuditResult, AuditParams } from '../types';
import { auditTierQuality } from '../atomic/audit-tier-quality';
import { WorkflowCommandContext } from '../../utils/command-context';
import { resolveFeatureName } from '../../utils';
import { writeAuditReport, calculateOverallStatus, getRelativePath, storeBaselineScore } from '../utils';

export interface AuditPhaseStartParams {
  phase: string; // Format: X.Y (e.g., "4.1")
  featureName?: string;
}

/**
 * Run baseline audits for phase tier start (mirrors phase-end: tier-phase group)
 */
export async function auditPhaseStart(params: AuditPhaseStartParams): Promise<{
  success: boolean;
  auditResult: TierAuditResult;
  reportPath: string;
  fullReportPath?: string;
  output: string;
}> {
  const featureName = await resolveFeatureName(params.featureName);
  const context = new WorkflowCommandContext(featureName);

  const auditParams: AuditParams = {
    tier: 'phase',
    identifier: params.phase,
    featureName,
    modifiedFiles: [],
  };

  const results = [];
  const errors: string[] = [];

  try {
    results.push(await auditTierQuality({ ...auditParams, tier: 'phase' }));
  } catch (_error) {
    errors.push(`Phase tier quality audit failed: ${_error instanceof Error ? _error.message : String(_error)}`);
  }

  // Create audit result
  const overallStatus = calculateOverallStatus(results);
  const timestamp = new Date().toISOString();
  
  const auditResult: TierAuditResult = {
    tier: 'phase',
    identifier: params.phase,
    overallStatus,
    results,
    timestamp,
    reportPath: '', // Will be set after writing report
    featureName
  };
  
  // Store baseline scores for comparison
  try {
    const scores: Record<string, number> = {};
    for (const result of results) {
      if (result.score !== undefined) {
        scores[result.category] = result.score;
      }
    }
    await storeBaselineScore('phase', params.phase, featureName, scores);
  } catch (_error) {
    errors.push(`Failed to store baseline scores: ${_error instanceof Error ? _error.message : String(_error)}`);
  }
  
  // Write audit report (marked as start audit)
  let reportPath = '';
  try {
    reportPath = await writeAuditReport(auditResult, context, 'start');
    auditResult.reportPath = getRelativePath(reportPath);
  } catch (_error) {
    errors.push(`Failed to write audit report: ${_error instanceof Error ? _error.message : String(_error)}`);
  }
  
  // Generate output message
  const outputLines: string[] = [];
  outputLines.push(`# Phase Start Audit: ${params.phase}`);
  outputLines.push('');
  outputLines.push(`**Purpose:** Baseline quality assessment before Phase ${params.phase} work begins`);
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
    outputLines.push(`- ${emoji} **${result.category.charAt(0).toUpperCase() + result.category.slice(1)}**: ${result.status}${scoreText} (baseline)`);
  }
  
  // Calculate overall baseline score
  const scores = results.filter(r => r.score !== undefined).map(r => r.score!);
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
    output: outputLines.join('\n')
  };
}

