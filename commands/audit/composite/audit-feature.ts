/**
 * Composite Command: /audit-feature [feature-name]
 * Run all audits for feature tier
 * 
 * Tier: Feature (Tier 0 - Highest Level)
 * Operates on: Complete feature audit
 */

import { TierAuditResult, AuditParams } from '../types';
import { auditComments } from '../atomic/audit-comments';
import { auditPlanning } from '../atomic/audit-planning';
import { auditTodos } from '../atomic/audit-todos';
import { auditSecurity } from '../atomic/audit-security';
import { auditCheckpoints } from '../atomic/audit-checkpoints';
import { auditTests } from '../atomic/audit-tests';
import { auditDocs } from '../atomic/audit-docs';
import { auditVueArchitecture } from '../atomic/audit-vue-architecture';
import { WorkflowCommandContext } from '../../utils/command-context';
import { writeAuditReport, calculateOverallStatus, getRelativePath, loadBaselineScore, compareBaselineToEnd } from '../utils';
import { importExternalAudits } from '../external/import-external-audits';

export interface AuditFeatureParams {
  featureName: string;
  modifiedFiles?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  testResults?: any;
}

/**
 * Run all audits for feature tier
 */
export async function auditFeature(params: AuditFeatureParams): Promise<{
  success: boolean;
  auditResult: TierAuditResult;
  reportPath: string;
  fullReportPath?: string; // Full path for file opening
  output: string;
}> {
  const context = new WorkflowCommandContext(params.featureName);
  
  const auditParams: AuditParams = {
    tier: 'feature',
    identifier: params.featureName,
    featureName: params.featureName,
    modifiedFiles: params.modifiedFiles,
    testResults: params.testResults
  };
  
  const results = [];
  const errors: string[] = [];
  
  // Run all 7 atomic audits
  try {
    results.push(await auditComments(auditParams));
  } catch (_error) {
    errors.push(`Comments audit failed: ${_error instanceof Error ? _error.message : String(_error)}`);
  }
  
  try {
    results.push(await auditPlanning(auditParams));
  } catch (_error) {
    errors.push(`Planning audit failed: ${_error instanceof Error ? _error.message : String(_error)}`);
  }
  
  try {
    results.push(await auditTodos(auditParams));
  } catch (_error) {
    errors.push(`Todos audit failed: ${_error instanceof Error ? _error.message : String(_error)}`);
  }
  
  try {
    results.push(await auditSecurity(auditParams));
  } catch (_error) {
    errors.push(`Security audit failed: ${_error instanceof Error ? _error.message : String(_error)}`);
  }
  
  try {
    results.push(await auditCheckpoints(auditParams));
  } catch (_error) {
    errors.push(`Checkpoints audit failed: ${_error instanceof Error ? _error.message : String(_error)}`);
  }
  
  try {
    results.push(await auditTests(auditParams));
  } catch (_error) {
    errors.push(`Tests audit failed: ${_error instanceof Error ? _error.message : String(_error)}`);
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
    tier: 'feature',
    identifier: params.featureName,
    overallStatus,
    results,
    timestamp,
    reportPath: '', // Will be set after writing report
    featureName: params.featureName
  };
  
  // Load baseline scores and compare
  let baselineComparison;
  try {
    const baseline = await loadBaselineScore('feature', params.featureName, params.featureName);
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
  outputLines.push(`# Feature Audit: ${params.featureName}`);
  outputLines.push('');
  outputLines.push(`**Overall Status:** ${overallStatus.toUpperCase()}`);
  outputLines.push(`**Report:** ${auditResult.reportPath || reportPath}`);
  outputLines.push('');

  // External signals import (no execution, only capture already-emitted artifacts)
  try {
    const external = await importExternalAudits(context, { tier: 'feature', identifier: params.featureName });
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

