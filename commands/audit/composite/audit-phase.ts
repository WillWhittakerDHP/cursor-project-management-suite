/**
 * Composite Command: /audit-phase [phase] [feature-name]
 * Run tier-optimized audits for phase (typecheck, type-similarity, duplication, unused-code, pattern-detection, import-graph, file-cohesion, deprecation, api-contract, data-flow)
 *
 * Tier: Phase (Tier 1 - High-Level)
 * Operates on: Complete phase audit (full scan)
 */

import { TierAuditResult, AuditParams, AutofixResult } from '../types';
import { auditTierQuality } from '../atomic/audit-tier-quality';
import { runTierAutofix } from '../autofix/run-tier-autofix';
import { WorkflowCommandContext } from '../../utils/command-context';
import { resolveFeatureName } from '../../utils';
import { writeAuditReport, calculateOverallStatus, getRelativePath, loadBaselineScore, compareBaselineToEnd } from '../utils';
import { importExternalAudits } from '../external/import-external-audits';

export interface AuditPhaseParams {
  phase: string; // Format: X.Y (e.g., "4.1")
  featureName?: string;
  modifiedFiles?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  testResults?: any;
}

/**
 * Run all audits for phase tier
 */
export async function auditPhase(params: AuditPhaseParams): Promise<{
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
    tier: 'phase',
    identifier: params.phase,
    featureName,
    modifiedFiles: params.modifiedFiles,
    testResults: params.testResults,
  };

  const results = [];
  const errors: string[] = [];
  let tierQualityResult;

  try {
    tierQualityResult = await auditTierQuality({ ...auditParams, tier: 'phase' });
    results.push(tierQualityResult);
  } catch (_error) {
    errors.push(`Phase tier quality audit failed: ${_error instanceof Error ? _error.message : String(_error)}`);
  }

  let autofixResult: AutofixResult | undefined;
  if (tierQualityResult) {
    autofixResult = await runTierAutofix('phase', tierQualityResult, {
      maxCascadeDepth: 2,
      featureName,
    });
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
  
  // Load baseline scores and compare
  let baselineComparison;
  try {
    const baseline = await loadBaselineScore('phase', params.phase, featureName);
    if (baseline) {
      const endScores: Record<string, number> = {};
      for (const result of results) {
        if (result.score !== undefined) {
          endScores[result.category] = result.score;
        }
      }
      baselineComparison = compareBaselineToEnd(baseline, endScores);
    }
  } catch (_error) {
    // Non-fatal - just log warning
    console.warn(`Failed to load baseline for comparison: ${_error instanceof Error ? _error.message : String(_error)}`);
  }
  
  // Write audit report with baseline comparison
  let reportPath = '';
  try {
    reportPath = await writeAuditReport(auditResult, context, 'end', baselineComparison);
    auditResult.reportPath = getRelativePath(reportPath);
  } catch (_error) {
    errors.push(`Failed to write audit report: ${_error instanceof Error ? _error.message : String(_error)}`);
  }
  
  // Generate output message
  const outputLines: string[] = [];
  outputLines.push(`# Phase Audit: ${params.phase}`);
  outputLines.push('');
  outputLines.push(`**Overall Status:** ${overallStatus.toUpperCase()}`);
  outputLines.push(`**Report:** ${auditResult.reportPath || reportPath}`);
  outputLines.push('');

  // External signals import (no execution, only capture already-emitted artifacts)
  try {
    const external = await importExternalAudits(context, { tier: 'phase', identifier: params.phase });
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
  
  // Add baseline comparison summary if available
  if (baselineComparison && baselineComparison.length > 0) {
    outputLines.push('## Score Comparison');
    outputLines.push('');
    for (const comp of baselineComparison) {
      if (comp.delta !== undefined) {
        const deltaText = comp.delta >= 0 ? `+${comp.delta}` : `${comp.delta}`;
        const statusEmoji = comp.status === 'improved' ? '✅' : comp.status === 'regressed' ? '❌' : '➡️';
        outputLines.push(`- ${statusEmoji} **${comp.category}**: ${comp.startScore} → ${comp.endScore} (${deltaText})`);
      }
    }
    outputLines.push('');
  }
  
  outputLines.push('## Results Summary');
  outputLines.push('');
  for (const result of results) {
    const emoji = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
    let scoreText = result.score !== undefined ? `(${result.score}/100)` : '';
    if (baselineComparison) {
      const comp = baselineComparison.find(c => c.category === result.category);
      if (comp && comp.startScore !== undefined && comp.delta !== undefined) {
        const deltaText = comp.delta >= 0 ? `+${comp.delta}` : `${comp.delta}`;
        scoreText = `${scoreText} ${deltaText} from baseline`;
      }
    }
    outputLines.push(`- ${emoji} **${result.category}**: ${result.status} ${scoreText}`);
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

