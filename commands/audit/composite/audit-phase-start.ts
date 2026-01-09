/**
 * Composite Command: /audit-phase-start [phase] [feature-name]
 * Run baseline audits for phase tier start
 * 
 * Tier: Phase (Tier 1 - High-Level)
 * Operates on: Baseline quality assessment before phase work begins
 * 
 * LEARNING: Start audits establish baseline scores for comparison with end audits
 * WHY: Enables tracking improvement/regression during the phase
 * PATTERN: Lightweight audit subset (comments, security, planning, docs)
 */

import { TierAuditResult, AuditParams } from '../types';
import { auditComments } from '../atomic/audit-comments';
import { auditPlanning } from '../atomic/audit-planning';
import { auditSecurity } from '../atomic/audit-security';
import { auditDocs } from '../atomic/audit-docs';
import { auditVueArchitecture } from '../atomic/audit-vue-architecture';
import { WorkflowCommandContext } from '../../utils/command-context';
import { writeAuditReport, calculateOverallStatus, getRelativePath, storeBaselineScore } from '../utils';

export interface AuditPhaseStartParams {
  phase: string; // Format: N (e.g., "1")
  featureName?: string;
}

/**
 * Run baseline audits for phase tier start
 * Only runs: comments, security, planning, docs
 * Skips: todos (not applicable at start), checkpoints (none yet), tests (no new tests)
 */
export async function auditPhaseStart(params: AuditPhaseStartParams): Promise<{
  success: boolean;
  auditResult: TierAuditResult;
  reportPath: string;
  fullReportPath?: string;
  output: string;
}> {
  const featureName = params.featureName || 'vue-migration';
  const context = new WorkflowCommandContext(featureName);
  
  const auditParams: AuditParams = {
    tier: 'phase',
    identifier: params.phase,
    featureName,
    modifiedFiles: [] // Start audits don't have modified files yet
  };
  
  const results = [];
  const errors: string[] = [];
  
  // Run only baseline audits (subset of full audit suite)
  try {
    results.push(await auditComments(auditParams));
  } catch (error) {
    errors.push(`Comments audit failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  try {
    results.push(await auditSecurity(auditParams));
  } catch (error) {
    errors.push(`Security audit failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  try {
    results.push(await auditPlanning(auditParams));
  } catch (error) {
    errors.push(`Planning audit failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  try {
    results.push(await auditDocs(auditParams));
  } catch (error) {
    errors.push(`Docs audit failed: ${error instanceof Error ? error.message : String(error)}`);
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
  } catch (error) {
    errors.push(`Failed to store baseline scores: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Write audit report (marked as start audit)
  let reportPath = '';
  try {
    reportPath = await writeAuditReport(auditResult, context, 'start');
    auditResult.reportPath = getRelativePath(reportPath);
  } catch (error) {
    errors.push(`Failed to write audit report: ${error instanceof Error ? error.message : String(error)}`);
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

