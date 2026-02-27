/**
 * Composite Command: /audit-session-start [session-id] [feature-name]
 * Run baseline audits for session tier start (mirrors session end: tier-session + docs + vue-architecture)
 *
 * Tier: Session (Tier 2 - Medium-Level)
 * Operates on: Baseline quality assessment before session work begins
 *
 * LEARNING: Start audits establish baseline scores for comparison with end audits
 * PATTERN: Mirror session-end audits (audit:tier-session, docs, vue-architecture)
 */

import { TierAuditResult, AuditParams } from '../types';
import { auditTierQuality } from '../atomic/audit-tier-quality';
import { auditDocs } from '../atomic/audit-docs';
import { auditVueArchitecture } from '../atomic/audit-vue-architecture';
import { WorkflowCommandContext } from '../../utils/command-context';
import { resolveFeatureName } from '../../utils';
import { writeAuditReport, calculateOverallStatus, getRelativePath, storeBaselineScore, getTypeConstantInventoryScore, getComposableGovernanceScore, getFunctionGovernanceScore, getComponentGovernanceScore } from '../utils';

export interface AuditSessionStartParams {
  sessionId: string; // Format: X.Y (e.g., "1.3")
  featureName?: string;
}

/**
 * Run baseline audits for session tier start (mirrors session-end: tier-session + docs + vue-architecture)
 */
export async function auditSessionStart(params: AuditSessionStartParams): Promise<{
  success: boolean;
  auditResult: TierAuditResult;
  reportPath: string;
  fullReportPath?: string;
  output: string;
}> {
  const featureName = await resolveFeatureName(params.featureName);
  const context = new WorkflowCommandContext(featureName);

  const auditParams: AuditParams = {
    tier: 'session',
    identifier: params.sessionId,
    featureName,
    modifiedFiles: [],
  };

  const results = [];
  const errors: string[] = [];

  try {
    results.push(await auditTierQuality({ ...auditParams, tier: 'session' }));
  } catch (_error) {
    errors.push(`Session tier quality audit failed: ${_error instanceof Error ? _error.message : String(_error)}`);
  }

  try {
    results.push(await auditDocs(auditParams));
  } catch (_error) {
    errors.push(`Docs audit failed: ${_error instanceof Error ? _error.message : String(_error)}`);
  }

  try {
    results.push(await auditVueArchitecture(auditParams));
  } catch (_error) {
    errors.push(`Vue architecture audit failed: ${_error instanceof Error ? _error.message : String(_error)}`);
  }

  // Create audit result
  const overallStatus = calculateOverallStatus(results);
  const timestamp = new Date().toISOString();
  
  const auditResult: TierAuditResult = {
    tier: 'session',
    identifier: params.sessionId,
    overallStatus,
    results,
    timestamp,
    reportPath: '', // Will be set after writing report
    featureName
  };
  
  // Store baseline scores for comparison (includes type-constant-inventory, composable-governance, function-governance, component-governance from JSON)
  let typeInventoryScore: number | undefined;
  let composableGovernanceScore: number | undefined;
  let functionGovernanceScore: number | undefined;
  let componentGovernanceScore: number | undefined;
  try {
    const scores: Record<string, number> = {};
    for (const result of results) {
      if (result.score !== undefined) {
        scores[result.category] = result.score;
      }
    }
    typeInventoryScore = await getTypeConstantInventoryScore();
    if (typeInventoryScore !== undefined) {
      scores['type-constant-inventory'] = typeInventoryScore;
    }
    composableGovernanceScore = await getComposableGovernanceScore();
    if (composableGovernanceScore !== undefined) {
      scores['composable-governance'] = composableGovernanceScore;
    }
    functionGovernanceScore = await getFunctionGovernanceScore();
    if (functionGovernanceScore !== undefined) {
      scores['function-governance'] = functionGovernanceScore;
    }
    componentGovernanceScore = await getComponentGovernanceScore();
    if (componentGovernanceScore !== undefined) {
      scores['component-governance'] = componentGovernanceScore;
    }
    await storeBaselineScore('session', params.sessionId, featureName, scores);
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
  outputLines.push(`# Session Start Audit: ${params.sessionId}`);
  outputLines.push('');
  outputLines.push(`**Purpose:** Baseline quality assessment before Session ${params.sessionId} work begins`);
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
  if (typeInventoryScore !== undefined) {
    outputLines.push(`- **Type constant inventory**: ${typeInventoryScore}/100 (baseline)`);
  }
  if (composableGovernanceScore !== undefined) {
    outputLines.push(`- **Composable governance**: ${composableGovernanceScore}/100 (baseline)`);
  }
  if (functionGovernanceScore !== undefined) {
    outputLines.push(`- **Function governance**: ${functionGovernanceScore}/100 (baseline)`);
  }
  if (componentGovernanceScore !== undefined) {
    outputLines.push(`- **Component governance**: ${componentGovernanceScore}/100 (baseline)`);
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

