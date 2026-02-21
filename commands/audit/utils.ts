/**
 * Audit System Utilities
 * 
 * Shared utilities for audit commands
 */

import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { TierAuditResult, AuditResult } from './types';
import { WorkflowCommandContext } from '../utils/command-context';
import { AuditTier } from './types';

const PROJECT_ROOT = process.cwd();

/**
 * Baseline score storage interface
 */
export interface BaselineScores {
  tier: AuditTier;
  identifier: string;
  featureName: string;
  timestamp: string;
  scores: Record<string, number>;
}

/**
 * Comparison result for baseline vs end scores
 */
export interface ComparisonResult {
  category: string;
  startScore?: number;
  endScore?: number;
  delta?: number;
  status: 'improved' | 'regressed' | 'unchanged' | 'new' | 'missing';
}

/**
 * Generate audit report markdown content
 */
export function generateAuditReport(
  auditResult: TierAuditResult,
  auditType: 'start' | 'end' = 'end',
  baselineComparison?: ComparisonResult[]
): string {
  const lines: string[] = [];
  
  const titlePrefix = auditType === 'start' ? `${auditResult.tier.charAt(0).toUpperCase() + auditResult.tier.slice(1)} Start Audit` : `Audit Report: ${auditResult.tier} ${auditResult.identifier}`;
  
  lines.push(`# ${titlePrefix}: ${auditResult.identifier}`);
  lines.push('');
  
  if (auditType === 'start') {
    lines.push(`**Purpose:** Baseline quality assessment before ${auditResult.tier} work begins`);
  }
  
  lines.push(`**Feature:** ${auditResult.featureName}`);
  lines.push(`**Tier:** ${auditResult.tier}`);
  lines.push(`**Identifier:** ${auditResult.identifier}`);
  lines.push(`**Timestamp:** ${auditResult.timestamp}`);
  lines.push(`**Overall Status:** ${getStatusEmoji(auditResult.overallStatus)} ${auditResult.overallStatus.toUpperCase()}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // Summary
  lines.push('## Summary');
  lines.push('');
  const passCount = auditResult.results.filter(r => r.status === 'pass').length;
  const warnCount = auditResult.results.filter(r => r.status === 'warn').length;
  const failCount = auditResult.results.filter(r => r.status === 'fail').length;
  
  lines.push(`- **Pass:** ${passCount}`);
  lines.push(`- **Warn:** ${warnCount}`);
  lines.push(`- **Fail:** ${failCount}`);
  lines.push('');
  
  // Overall score if available
  const scores = auditResult.results.filter(r => r.score !== undefined).map(r => r.score!);
  if (scores.length > 0) {
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const scoreLabel = auditType === 'start' ? 'Baseline Score' : 'Average Score';
    lines.push(`**${scoreLabel}:** ${avgScore}/100`);
    lines.push('');
  }
  
  // Baseline comparison section for end audits
  if (auditType === 'end' && baselineComparison && baselineComparison.length > 0) {
    lines.push('## Score Comparison');
    lines.push('');
    lines.push('| Category | Start | End | Delta | Status |');
    lines.push('|----------|-------|-----|-------|--------|');
    
    for (const comp of baselineComparison) {
      const startText = comp.startScore !== undefined ? `${comp.startScore}` : 'N/A';
      const endText = comp.endScore !== undefined ? `${comp.endScore}` : 'N/A';
      const deltaText = comp.delta !== undefined ? (comp.delta >= 0 ? `+${comp.delta}` : `${comp.delta}`) : 'N/A';
      const statusEmoji = comp.status === 'improved' ? '✅ Improved' : comp.status === 'regressed' ? '❌ Regressed' : comp.status === 'unchanged' ? '➡️ Unchanged' : comp.status === 'new' ? '🆕 New' : '⚠️ Missing';
      lines.push(`| ${comp.category} | ${startText} | ${endText} | ${deltaText} | ${statusEmoji} |`);
    }
    
    // Calculate overall delta
    const overallDelta = baselineComparison
      .filter(c => c.delta !== undefined)
      .reduce((sum, c) => sum + (c.delta || 0), 0);
    const overallStart = baselineComparison
      .filter(c => c.startScore !== undefined)
      .reduce((sum, c) => sum + (c.startScore || 0), 0) / baselineComparison.filter(c => c.startScore !== undefined).length;
    const overallEnd = baselineComparison
      .filter(c => c.endScore !== undefined)
      .reduce((sum, c) => sum + (c.endScore || 0), 0) / baselineComparison.filter(c => c.endScore !== undefined).length;
    
    if (baselineComparison.filter(c => c.delta !== undefined).length > 0) {
      lines.push('');
      const deltaText = overallDelta >= 0 ? `+${Math.round(overallDelta)}` : `${Math.round(overallDelta)}`;
      lines.push(`**Overall:** ${Math.round(overallStart)} → ${Math.round(overallEnd)} (${deltaText} points ${overallDelta >= 0 ? 'improvement' : 'regression'})`);
    }
    
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  
  lines.push('---');
  lines.push('');
  
  // Individual audit results
  for (const result of auditResult.results) {
    lines.push(`## ${result.category.charAt(0).toUpperCase() + result.category.slice(1)} Audit`);
    lines.push('');
    lines.push(`**Status:** ${getStatusEmoji(result.status)} ${result.status.toUpperCase()}`);
    if (result.score !== undefined) {
      const scoreLabel = auditType === 'start' ? 'Baseline Score' : 'Score';
      // Add baseline comparison if available
      if (auditType === 'end' && baselineComparison) {
        const comp = baselineComparison.find(c => c.category === result.category);
        if (comp && comp.startScore !== undefined) {
          const delta = comp.delta !== undefined ? (comp.delta >= 0 ? `+${comp.delta}` : `${comp.delta}`) : '';
          lines.push(`**Score:** ${result.score}/100 (${delta} from baseline)`);
          lines.push(`**Baseline:** ${comp.startScore}/100`);
        } else {
          lines.push(`**Score:** ${result.score}/100`);
        }
      } else {
        lines.push(`**${scoreLabel}:** ${result.score}/100`);
      }
    }
    lines.push('');
    
    if (result.summary) {
      lines.push(result.summary);
      lines.push('');
    }
    
    if (result.findings.length > 0) {
      lines.push('### Findings');
      lines.push('');
      for (const finding of result.findings) {
        const icon = finding.type === 'error' ? '❌' : finding.type === 'warning' ? '⚠️' : 'ℹ️';
        lines.push(`- ${icon} **${finding.type.toUpperCase()}**: ${finding.message}`);
        if (finding.location) {
          lines.push(`  - Location: ${finding.location}`);
        }
        if (finding.suggestion) {
          lines.push(`  - Suggestion: ${finding.suggestion}`);
        }
      }
      lines.push('');
    }
    
    if (result.recommendations.length > 0) {
      lines.push('### Recommendations');
      lines.push('');
      for (const rec of result.recommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push('');
    }
    
    lines.push('---');
    lines.push('');
  }
  
  // Overall recommendations
  const allRecommendations = auditResult.results
    .flatMap(r => r.recommendations)
    .filter((v, i, a) => a.indexOf(v) === i); // Unique
  
  if (allRecommendations.length > 0) {
    lines.push('## Overall Recommendations');
    lines.push('');
    for (const rec of allRecommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Get status emoji
 */
function getStatusEmoji(status: 'pass' | 'warn' | 'fail'): string {
  switch (status) {
    case 'pass':
      return '✅';
    case 'warn':
      return '⚠️';
    case 'fail':
      return '❌';
  }
}

/**
 * Write audit report to file
 */
export async function writeAuditReport(
  auditResult: TierAuditResult,
  context: WorkflowCommandContext,
  auditType: 'start' | 'end' = 'end',
  baselineComparison?: ComparisonResult[]
): Promise<string> {
  const reportContent = generateAuditReport(auditResult, auditType, baselineComparison);
  
  // Determine report path
  const auditDir = join(
    PROJECT_ROOT,
    '.cursor',
    'project-manager',
    'features',
    context.feature.name,
    'audits'
  );
  
  // Ensure directory exists
  await mkdir(auditDir, { recursive: true });
  
  // Generate filename based on audit type
  const suffix = auditType === 'start' ? '-start-audit' : '-audit';
  const filename = `${auditResult.tier}-${auditResult.identifier}${suffix}.md`;
  const reportPath = join(auditDir, filename);
  
  // Write file
  await writeFile(reportPath, reportContent, 'utf-8');

  // Deterministic machine output (JSON) alongside Markdown
  const jsonFilename = `${auditResult.tier}-${auditResult.identifier}${suffix}.json`;
  const jsonPath = join(auditDir, jsonFilename);
  const jsonPayload = {
    ...auditResult,
    auditType,
    baselineComparison: baselineComparison || [],
  };
  await writeFile(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf-8');
  
  return reportPath;
}

/**
 * Calculate overall status from results
 */
export function calculateOverallStatus(results: AuditResult[]): 'pass' | 'warn' | 'fail' {
  if (results.length === 0) {
    return 'warn';
  }
  
  const hasFail = results.some(r => r.status === 'fail');
  const hasWarn = results.some(r => r.status === 'warn');
  
  if (hasFail) {
    return 'fail';
  }
  if (hasWarn) {
    return 'warn';
  }
  return 'pass';
}

/**
 * Get relative path from project root
 */
export function getRelativePath(absolutePath: string): string {
  return absolutePath.replace(PROJECT_ROOT + '/', '');
}

/**
 * Store baseline scores for comparison
 */
export async function storeBaselineScore(
  tier: AuditTier,
  identifier: string,
  featureName: string,
  scores: Record<string, number>
): Promise<void> {
  const baselineDir = join(
    PROJECT_ROOT,
    '.cursor',
    'project-manager',
    'features',
    featureName,
    'audits',
    'baselines'
  );
  
  // Ensure directory exists
  await mkdir(baselineDir, { recursive: true });
  
  const baseline: BaselineScores = {
    tier,
    identifier,
    featureName,
    timestamp: new Date().toISOString(),
    scores
  };
  
  const filename = `${tier}-${identifier}-baseline.json`;
  const filePath = join(baselineDir, filename);
  
  await writeFile(filePath, JSON.stringify(baseline, null, 2), 'utf-8');
}

/**
 * Load baseline scores for comparison
 */
export async function loadBaselineScore(
  tier: AuditTier,
  identifier: string,
  featureName: string
): Promise<BaselineScores | null> {
  const baselineDir = join(
    PROJECT_ROOT,
    '.cursor',
    'project-manager',
    'features',
    featureName,
    'audits',
    'baselines'
  );
  
  const filename = `${tier}-${identifier}-baseline.json`;
  const filePath = join(baselineDir, filename);
  
  if (!existsSync(filePath)) {
    return null;
  }
  
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as BaselineScores;
  } catch (_error) {
    console.warn(`Failed to load baseline score from ${filePath}: ${_error instanceof Error ? _error.message : String(_error)}`);
    return null;
  }
}

/**
 * Compare baseline scores to end scores
 */
export function compareBaselineToEnd(
  baseline: BaselineScores | null,
  endScores: Record<string, number>
): ComparisonResult[] {
  const comparisons: ComparisonResult[] = [];
  
  if (!baseline) {
    // No baseline - all scores are new
    for (const [category, score] of Object.entries(endScores)) {
      comparisons.push({
        category,
        endScore: score,
        status: 'new'
      });
    }
    return comparisons;
  }
  
  // Get all categories from both baseline and end
  const allCategories = new Set([
    ...Object.keys(baseline.scores),
    ...Object.keys(endScores)
  ]);
  
  for (const category of allCategories) {
    const startScore = baseline.scores[category];
    const endScore = endScores[category];
    
    if (startScore === undefined && endScore !== undefined) {
      comparisons.push({
        category,
        endScore,
        status: 'new'
      });
    } else if (startScore !== undefined && endScore === undefined) {
      comparisons.push({
        category,
        startScore,
        status: 'missing'
      });
    } else if (startScore !== undefined && endScore !== undefined) {
      const delta = endScore - startScore;
      comparisons.push({
        category,
        startScore,
        endScore,
        delta,
        status: delta > 0 ? 'improved' : delta < 0 ? 'regressed' : 'unchanged'
      });
    }
  }
  
  return comparisons;
}

