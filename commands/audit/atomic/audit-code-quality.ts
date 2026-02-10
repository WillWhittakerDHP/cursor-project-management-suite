/**
 * Atomic Audit: Code Quality (Deterministic Audits)
 *
 * Goal:
 * - Run deterministic code quality audits (loop mutations, hardcoding, duplication, etc.)
 * - Report findings from audit JSON outputs
 * - Non-blocking: provides signals, doesn't fail phase-end
 *
 * Scope:
 * - Runs `npm run audit:all` in client directory
 * - Reads audit JSON outputs to generate findings
 * - Change detection means audits skip if < threshold files changed
 *
 * References:
 * - `client/.audit-reports/` - Audit outputs
 * - `client/.scripts/*audit*.mjs` - Audit scripts
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { AuditParams } from '../types';
import { AuditResult, AuditFinding } from '../types';

const PROJECT_ROOT = process.cwd();
const CLIENT_ROOT = join(PROJECT_ROOT, 'client');
const AUDIT_DIR = join(CLIENT_ROOT, '.audit-reports');
const TYPECHECK_DIR = join(CLIENT_ROOT, '.audit-reports', 'typecheck');

interface AuditJsonOutput {
  generatedAt?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  files?: Array<{ repoPath: string; score?: number; [key: string]: any }>;
  errors?: Array<{ repoPath: string; code: string; message: string }>;
  pools?: Array<{ priority: string; totalScore: number; errorCount: number }>;
  groups?: Array<{ uniqueFiles: number; occurrences: number }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

function toRepoPath(absPath: string): string {
  return absPath.replace(PROJECT_ROOT + '/', '');
}

function loadAuditJson(filePath: string): AuditJsonOutput | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function generateFindingsFromAudit(
  auditName: string,
  jsonPath: string,
  jsonData: AuditJsonOutput | null
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (!jsonData) {
    findings.push({
      type: 'info',
      message: `${auditName} audit not yet run (no JSON output found)`,
      location: jsonPath,
    });
    return findings;
  }

  // Typecheck audit: check for errors
  if (auditName === 'typecheck') {
    const errors = jsonData.errors || [];
    const pools = jsonData.pools || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p0Pools = pools.filter((p: any) => p.priority === 'P0');
    
    if (errors.length > 0) {
      findings.push({
        type: 'warning',
        message: `${errors.length} TypeScript error(s) found`,
        location: `${TYPECHECK_DIR}/typecheck-audit.json`,
        suggestion: `Review ${toRepoPath(join(TYPECHECK_DIR, 'typecheck-audit.md'))} for details`,
      });
    }
    
    if (p0Pools.length > 0) {
      findings.push({
        type: 'error',
        message: `${p0Pools.length} P0 type error pool(s) (high priority)`,
        location: `${TYPECHECK_DIR}/typecheck-audit.json`,
        suggestion: `Review ${toRepoPath(join(TYPECHECK_DIR, 'typecheck-audit.md'))} for P0 pools`,
      });
    }
  }

  // Component/composables logic audits: check for high-scoring files
  if (auditName === 'component-logic' || auditName === 'composables-logic') {
    const files = jsonData.files || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const highScoreFiles = files.filter((f: any) => {
      const score = f.score || f.complexityScore || 0;
      return score >= 20; // Threshold for "high complexity"
    });

    if (highScoreFiles.length > 0) {
      findings.push({
        type: 'warning',
        message: `${highScoreFiles.length} file(s) with high complexity scores`,
        location: `${AUDIT_DIR}/${auditName}-audit.json`,
        suggestion: `Review ${toRepoPath(join(AUDIT_DIR, `${auditName}-audit.md`))} for top hotspots`,
      });
    }
  }

  // Loop mutation audit: check for forEach→mutation hits
  if (auditName === 'loop-mutations') {
    const files = jsonData.files || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mutationHits = files.filter((f: any) => {
      const hits = f.forEachMutationHits || [];
      return hits.length > 0;
    });

    if (mutationHits.length > 0) {
      findings.push({
        type: 'info',
        message: `${mutationHits.length} file(s) with forEach→mutation patterns (refactor candidates)`,
        location: `${AUDIT_DIR}/loop-mutation-audit.json`,
        suggestion: `Review ${toRepoPath(join(AUDIT_DIR, 'loop-mutation-audit.md'))} for refactor opportunities`,
      });
    }
  }

  // Hardcoding audit: check for high-scoring files
  if (auditName === 'hardcoding') {
    const files = jsonData.files || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const highScoreFiles = files.filter((f: any) => {
      const score = f.score || 0;
      return score >= 15; // Threshold for "significant hardcoding"
    });

    if (highScoreFiles.length > 0) {
      findings.push({
        type: 'info',
        message: `${highScoreFiles.length} file(s) with hardcoding patterns (config-driven candidates)`,
        location: `${AUDIT_DIR}/hardcoding-audit.json`,
        suggestion: `Review ${toRepoPath(join(AUDIT_DIR, 'hardcoding-audit.md'))} for config-driven refactor opportunities`,
      });
    }
  }

  // Duplication audit: check for groups
  if (auditName === 'duplication') {
    const groups = jsonData.groups || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const highLeverageGroups = groups.filter((g: any) => {
      const leverage = (g.uniqueFiles || 0) * (g.lineCount || 0);
      return leverage >= 20; // Threshold for "high leverage consolidation"
    });

    if (highLeverageGroups.length > 0) {
      findings.push({
        type: 'info',
        message: `${highLeverageGroups.length} duplication group(s) with high consolidation leverage`,
        location: `${AUDIT_DIR}/duplication-audit.json`,
        suggestion: `Review ${toRepoPath(join(AUDIT_DIR, 'duplication-audit.md'))} for DRY opportunities`,
      });
    }
  }

  // Test audit: check for untested source files
  if (auditName === 'test') {
    const summary = jsonData.summary || {};
    const untestedCount = summary.untestedSourceFiles || 0;
    const orphanedCount = summary.orphanedTestFiles || 0;
    const coverage = summary.coveragePercentage || 0;
    
    const untestedSource = jsonData.untestedSource || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const highPriorityUntested = untestedSource.filter((s: any) => {
      const priority = s.priority?.bucket || s.priority?.overall || 0;
      return priority === 'P0' || (typeof priority === 'number' && priority >= 7.0);
    });

    if (untestedCount > 0) {
      findings.push({
        type: 'warning',
        message: `${untestedCount} untested source file(s) (${coverage}% coverage)`,
        location: `${AUDIT_DIR}/test-audit.json`,
        suggestion: `Review ${toRepoPath(join(AUDIT_DIR, 'test-audit.md'))} for test coverage gaps`,
      });
    }

    if (highPriorityUntested.length > 0) {
      findings.push({
        type: 'error',
        message: `${highPriorityUntested.length} P0/high-priority untested file(s)`,
        location: `${AUDIT_DIR}/test-audit.json`,
        suggestion: `Review ${toRepoPath(join(AUDIT_DIR, 'test-audit.md'))} for critical test gaps`,
      });
    }

    if (orphanedCount > 0) {
      findings.push({
        type: 'info',
        message: `${orphanedCount} orphaned test file(s) (no corresponding source)`,
        location: `${AUDIT_DIR}/test-audit.json`,
        suggestion: `Review ${toRepoPath(join(AUDIT_DIR, 'test-audit.md'))} for orphaned tests`,
      });
    }
  }

  // Fallback audit: check for defaults/fallbacks/legacy patterns
  if (auditName === 'fallback') {
    const issues = jsonData.issues || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const criticalIssues = issues.filter((i: any) => i.severity === 'critical' || i.severity === 'error');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const warningIssues = issues.filter((i: any) => i.severity === 'warning');

    if (criticalIssues.length > 0) {
      findings.push({
        type: 'error',
        message: `${criticalIssues.length} critical issue(s) found in session-tier commands (silent failures, empty catch blocks)`,
        location: `${AUDIT_DIR}/fallback-audit.json`,
        suggestion: `Review ${toRepoPath(join(AUDIT_DIR, 'fallback-audit.json'))} for critical fallback patterns`,
      });
    }

    if (warningIssues.length > 0) {
      findings.push({
        type: 'warning',
        message: `${warningIssues.length} warning(s) found in session-tier commands (defaults, fallbacks, legacy patterns)`,
        location: `${AUDIT_DIR}/fallback-audit.json`,
        suggestion: `Review ${toRepoPath(join(AUDIT_DIR, 'fallback-audit.json'))} for fallback/legacy patterns`,
      });
    }
  }

  // Unused code audit: check for unused exports/functions
  if (auditName === 'unused-code') {
    const files = jsonData.files || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const highPriorityFiles = files.filter((f: any) => {
      const priority = f.priority || 'P2';
      return priority === 'P0' || priority === 'P1';
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalIssues = files.reduce((sum: number, f: any) => sum + (f.issues?.length || 0), 0);

    if (highPriorityFiles.length > 0) {
      findings.push({
        type: 'warning',
        message: `${highPriorityFiles.length} file(s) with P0/P1 unused code (${totalIssues} total issues)`,
        location: `${AUDIT_DIR}/unused-code-audit.json`,
        suggestion: `Review ${toRepoPath(join(AUDIT_DIR, 'unused-code-audit.md'))} for unused exports/functions`,
      });
    }

    if (totalIssues > 50) {
      findings.push({
        type: 'info',
        message: `${totalIssues} unused code issues found (cleanup opportunity)`,
        location: `${AUDIT_DIR}/unused-code-audit.json`,
        suggestion: `Review ${toRepoPath(join(AUDIT_DIR, 'unused-code-audit.md'))} for cleanup candidates`,
      });
    }
  }

  // Security audit: check for security vulnerabilities
  if (auditName === 'security') {
    const summary = jsonData.summary || {};
    const categories = jsonData.categories || [];
    const files = jsonData.files || [];
    
    const totalErrors = summary.totalErrors || 0;
    const totalWarnings = summary.totalWarnings || 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p0Categories = categories.filter((c: any) => c.priority === 'P0');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p0Files = files.filter((f: any) => f.priority === 'P0');

    if (totalErrors > 0) {
      findings.push({
        type: 'error',
        message: `${totalErrors} security error(s) found (${p0Categories.length} P0 categories, ${p0Files.length} P0 files)`,
        location: `${AUDIT_DIR}/security-audit.json`,
        suggestion: `Review ${toRepoPath(join(AUDIT_DIR, 'security-audit.md'))} for critical security issues`,
      });
    }

    if (totalWarnings > 0 && totalErrors === 0) {
      findings.push({
        type: 'warning',
        message: `${totalWarnings} security warning(s) found`,
        location: `${AUDIT_DIR}/security-audit.json`,
        suggestion: `Review ${toRepoPath(join(AUDIT_DIR, 'security-audit.md'))} for security best practices`,
      });
    }

    // Check for specific critical categories
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csrfCategory = categories.find((c: any) => c.id === 'csrf');
    if (csrfCategory && csrfCategory.errors && csrfCategory.errors.length > 0) {
      findings.push({
        type: 'error',
        message: `${csrfCategory.errors.length} CSRF protection issue(s) found`,
        location: `${AUDIT_DIR}/security-audit.json`,
        suggestion: `Review ${toRepoPath(join(AUDIT_DIR, 'security-audit.md'))} for routes missing CSRF protection`,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secretsCategory = categories.find((c: any) => c.id === 'secrets');
    if (secretsCategory && secretsCategory.errors && secretsCategory.errors.length > 0) {
      findings.push({
        type: 'error',
        message: `${secretsCategory.errors.length} exposed secret(s) found`,
        location: `${AUDIT_DIR}/security-audit.json`,
        suggestion: `Review ${toRepoPath(join(AUDIT_DIR, 'security-audit.md'))} for exposed secrets`,
      });
    }
  }

  return findings;
}

export async function auditCodeQuality(_params: AuditParams): Promise<AuditResult> {
  const findings: AuditFinding[] = [];
  const recommendations: string[] = [];

  // Check if client directory exists
  if (!existsSync(CLIENT_ROOT)) {
    return {
      category: 'vue-architecture', // Reuse category for now
      status: 'pass',
      findings: [{
        type: 'info',
        message: 'client directory not found - skipping code quality audits',
      }],
      recommendations: [],
      summary: 'Skipped (client not found)',
    };
  }

  // Run audits (non-blocking - they have change detection)
  try {
    const auditCommand = 'npm run audit:all';
    execSync(auditCommand, {
      cwd: CLIENT_ROOT,
      stdio: 'pipe', // Suppress output (we'll read JSON instead)
      timeout: 300000, // 5 minute timeout
    });
  } catch (error) {
    // Non-fatal: audits may skip if below threshold, or may have errors
    // We'll still read whatever JSON outputs exist
  }

  // Load and analyze audit outputs
  const audits = [
    { name: 'typecheck', path: join(TYPECHECK_DIR, 'typecheck-audit.json') },
    { name: 'component-logic', path: join(AUDIT_DIR, 'component-logic-audit.json') },
    { name: 'composables-logic', path: join(AUDIT_DIR, 'composables-logic-audit.json') },
    { name: 'loop-mutations', path: join(AUDIT_DIR, 'loop-mutation-audit.json') },
    { name: 'hardcoding', path: join(AUDIT_DIR, 'hardcoding-audit.json') },
    { name: 'duplication', path: join(AUDIT_DIR, 'duplication-audit.json') },
    { name: 'test', path: join(AUDIT_DIR, 'test-audit.json') },
    { name: 'fallback', path: join(AUDIT_DIR, 'fallback-audit.json') },
    { name: 'unused-code', path: join(AUDIT_DIR, 'unused-code-audit.json') },
    { name: 'security', path: join(AUDIT_DIR, 'security-audit.json') },
    { name: 'error-logging', path: join(AUDIT_DIR, 'error-logging-audit.json') },
  ];

  for (const audit of audits) {
    const jsonData = loadAuditJson(audit.path);
    const auditFindings = generateFindingsFromAudit(audit.name, audit.path, jsonData);
    findings.push(...auditFindings);
  }

  // Generate recommendations
  const errorCount = findings.filter(f => f.type === 'error').length;
  const warningCount = findings.filter(f => f.type === 'warning').length;

  if (errorCount > 0) {
    recommendations.push('Review typecheck audit for P0 type errors');
  }
  if (warningCount > 0) {
    recommendations.push('Review component/composables logic audits for high-complexity hotspots');
  }
  if (findings.some(f => f.message.includes('forEach→mutation'))) {
    recommendations.push('Consider refactoring forEach→mutation patterns to functional transforms (map/reduce/filter)');
  }
  if (findings.some(f => f.message.includes('hardcoding'))) {
    recommendations.push('Consider moving hardcoded patterns to config-driven approaches');
  }
  if (findings.some(f => f.message.includes('duplication'))) {
    recommendations.push('Review duplication audit for consolidation opportunities');
  }

  // Score based on findings
  let score = 100;
  for (const f of findings) {
    if (f.type === 'error') score -= 20;
    if (f.type === 'warning') score -= 10;
    if (f.type === 'info') score -= 2;
  }
  if (score < 0) score = 0;

  const status = errorCount > 0 ? 'fail' : warningCount > 0 ? 'warn' : 'pass';

  return {
    category: 'vue-architecture', // Reuse category (or add 'code-quality' to types)
    status,
    score,
    findings,
    recommendations,
    summary: `Ran 11 deterministic audits; found ${errorCount} error(s), ${warningCount} warning(s), ${findings.length - errorCount - warningCount} info signal(s).`,
  };
}

