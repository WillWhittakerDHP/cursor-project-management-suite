/**
 * Atomic Audit: Tier-Quality (Tier-Optimized Deterministic Audits)
 *
 * Goal:
 * - Run the subset of deterministic audits appropriate for the given tier
 * - Report findings from audit JSON outputs
 * - Each tier runs only the audits where it has the highest impact-to-cost ratio
 *
 * Scope:
 * - Runs tier-specific npm script (audit:tier-task, audit:tier-session, etc.) in client directory
 * - Reads audit JSON outputs to generate findings
 *
 * References:
 * - client/.audit-reports/ - Audit outputs
 * - client/package.json audit:tier-* scripts
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { AuditParams, AuditResult, AuditFinding, AuditTier } from '../types';
import { PROJECT_ROOT, FRONTEND_ROOT } from '../../utils/utils';
import { runArchitectureAlignmentAuditFromGitManager } from '../architecture-alignment-audit';
import { listWorkingTreeChangedRepoPaths } from '../../git/shared/git-manager';

function getClientRoot(): string { return join(PROJECT_ROOT, FRONTEND_ROOT); }
function getAuditDir(): string { return join(getClientRoot(), '.audit-reports'); }
function getTypecheckDir(): string { return join(getClientRoot(), '.audit-reports', 'typecheck'); }

type AuditJsonFileEntry = Record<string, unknown> & {
  repoPath: string;
  score?: number;
  priority?: string;
  complexityScore?: number;
  forEachMutationHits?: unknown[];
  issues?: unknown[];
};

type AuditJsonFindingEntry = Record<string, unknown> & { ruleId?: string };

/** Parsed audit JSON: known fields typed; audit scripts may add more keys over time. */
interface AuditJsonOutput {
  generatedAt?: string;
  files?: AuditJsonFileEntry[];
  errors?: Array<{ repoPath: string; code: string; message: string }>;
  pools?: Array<{ priority: string; totalScore: number; errorCount: number }>;
  groups?: Array<{ uniqueFiles: number; occurrences: number; lineCount?: number; action?: string }>;
  summary?: { totalErrors?: number; totalWarnings?: number; untestedSourceFiles?: number; orphanedTestFiles?: number; coveragePercentage?: number };
  issues?: Array<{ severity: string }>;
  categories?: Array<{ id?: string; priority?: string; errors?: unknown[] }>;
  untestedSource?: Array<{ priority?: { bucket?: string; overall?: number } }>;
  findings?: AuditJsonFindingEntry[];
  repairWaves?: Record<string, unknown>;
  fanInViolations?: unknown[];
  composableChainDepthViolations?: unknown[];
}

interface TierAuditEntry {
  auditName: string;
  jsonRelativePath: string;
  /** When omitted, no npm script is spawned (harness-only audit writes the JSON). */
  npmRun?: string;
}

const TIER_AUDIT_CONFIG: Record<
  AuditTier,
  { npmScript: string; changedOnly: boolean; audits: TierAuditEntry[] }
> = {
  task: {
    npmScript: 'audit:tier-task',
    changedOnly: true,
    audits: [
      { auditName: 'typecheck', jsonRelativePath: 'typecheck/typecheck-audit.json', npmRun: 'typecheck:audit' },
      { auditName: 'loop-mutations', jsonRelativePath: 'loop-mutation-audit.json', npmRun: 'audit:loop-mutations' },
      { auditName: 'hardcoding', jsonRelativePath: 'hardcoding-audit.json', npmRun: 'audit:hardcoding' },
      { auditName: 'error-handling', jsonRelativePath: 'error-handling-audit.json', npmRun: 'audit:error-handling' },
      { auditName: 'naming-convention', jsonRelativePath: 'naming-convention-audit.json', npmRun: 'audit:naming-convention' },
      { auditName: 'security', jsonRelativePath: 'security-audit.json', npmRun: 'audit:security' },
    ],
  },
  session: {
    npmScript: 'audit:tier-session',
    changedOnly: true,
    audits: [
      { auditName: 'component-logic', jsonRelativePath: 'component-logic-audit.json', npmRun: 'audit:component-logic' },
      { auditName: 'composables-logic', jsonRelativePath: 'composables-logic-audit.json', npmRun: 'audit:composables-logic' },
      { auditName: 'function-complexity', jsonRelativePath: 'function-complexity-audit.json', npmRun: 'audit:function-complexity' },
      { auditName: 'constants-consolidation', jsonRelativePath: 'constants-consolidation-audit.json', npmRun: 'audit:constants-consolidation' },
      { auditName: 'todo-aging', jsonRelativePath: 'todo-aging-audit.json', npmRun: 'audit:todo-aging' },
      { auditName: 'component-health', jsonRelativePath: 'component-health-audit.json', npmRun: 'audit:component-health' },
      { auditName: 'composable-health', jsonRelativePath: 'composable-health-audit.json', npmRun: 'audit:composable-health' },
      { auditName: 'type-escape', jsonRelativePath: 'type-escape-audit.json', npmRun: 'audit:type-escape' },
      { auditName: 'type-constant-inventory', jsonRelativePath: 'type-constant-inventory-audit.json', npmRun: 'audit:type-constant-inventory' },
      { auditName: 'architecture-alignment', jsonRelativePath: 'architecture-alignment-audit.json' },
    ],
  },
  phase: {
    npmScript: 'audit:tier-phase',
    changedOnly: false,
    audits: [
      { auditName: 'typecheck', jsonRelativePath: 'typecheck/typecheck-audit.json', npmRun: 'typecheck:audit' },
      { auditName: 'type-similarity', jsonRelativePath: 'type-similarity-audit.json', npmRun: 'audit:type-similarity' },
      { auditName: 'duplication', jsonRelativePath: 'duplication-audit.json', npmRun: 'audit:duplication' },
      { auditName: 'unused-code', jsonRelativePath: 'unused-code-audit.json', npmRun: 'audit:unused-code' },
      { auditName: 'pattern-detection', jsonRelativePath: 'pattern-detection-audit.json', npmRun: 'audit:pattern-detection' },
      { auditName: 'import-graph', jsonRelativePath: 'import-graph-audit.json', npmRun: 'audit:import-graph' },
      { auditName: 'file-cohesion', jsonRelativePath: 'file-cohesion-audit.json', npmRun: 'audit:file-cohesion' },
      { auditName: 'deprecation', jsonRelativePath: 'deprecation-audit.json', npmRun: 'audit:deprecation' },
      { auditName: 'api-contract', jsonRelativePath: 'api-contract-audit.json', npmRun: 'audit:api-contract' },
      { auditName: 'data-flow', jsonRelativePath: 'data-flow-audit.json', npmRun: 'audit:data-flow' },
      { auditName: 'type-health', jsonRelativePath: 'type-health-audit.json', npmRun: 'audit:type-health' },
      { auditName: 'data-flow-health', jsonRelativePath: 'data-flow-health-audit.json', npmRun: 'audit:data-flow-health' },
    ],
  },
  feature: {
    npmScript: 'audit:tier-feature',
    changedOnly: false,
    audits: [
      { auditName: 'test', jsonRelativePath: 'test-audit.json', npmRun: 'audit:test' },
      { auditName: 'coverage-risk-crossref', jsonRelativePath: 'coverage-risk-crossref-audit.json', npmRun: 'audit:coverage-risk-crossref' },
      { auditName: 'bundle-size-budget', jsonRelativePath: 'bundle-size-budget-audit.json', npmRun: 'audit:bundle-size-budget' },
      { auditName: 'api-versioning', jsonRelativePath: 'api-versioning-audit.json', npmRun: 'audit:api-versioning' },
      { auditName: 'dep-freshness', jsonRelativePath: 'dep-freshness-audit.json', npmRun: 'audit:dep-freshness' },
      { auditName: 'security', jsonRelativePath: 'security-audit.json', npmRun: 'audit:security' },
      { auditName: 'meta', jsonRelativePath: 'audit-meta-report.json', npmRun: 'audit:meta' },
    ],
  },
};

/** Returns the list of audit names that run at the given tier. Used by tier-context-config for tier → playbooks. */
export function getAuditNamesForTier(tier: AuditTier): string[] {
  return TIER_AUDIT_CONFIG[tier].audits.map((a) => a.auditName);
}

function toRepoPath(absPath: string): string {
  return absPath.replace(PROJECT_ROOT + '/', '');
}

function loadAuditJson(filePath: string): AuditJsonOutput | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Audit tier quality: analysis failed', err);
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

  if (auditName === 'typecheck') {
    const errors = jsonData.errors || [];
    const pools = jsonData.pools || [];
    const p0Pools = pools.filter((p: { priority: string }) => p.priority === 'P0');
    if (errors.length > 0) {
      findings.push({
        type: 'warning',
        message: `${errors.length} TypeScript error(s) found`,
        location: join(getTypecheckDir(), 'typecheck-audit.json'),
        suggestion: `Review ${toRepoPath(join(getTypecheckDir(), 'typecheck-audit.md'))} for details`,
      });
    }
    if (p0Pools.length > 0) {
      findings.push({
        type: 'error',
        message: `${p0Pools.length} P0 type error pool(s) (high priority)`,
        location: join(getTypecheckDir(), 'typecheck-audit.json'),
        suggestion: `Review ${toRepoPath(join(getTypecheckDir(), 'typecheck-audit.md'))} for P0 pools`,
      });
    }
  }

  if (auditName === 'component-logic' || auditName === 'composables-logic') {
    const files = jsonData.files || [];
    const highScoreFiles = files.filter((f: { score?: number; complexityScore?: number }) => {
      const score = f.score ?? f.complexityScore ?? 0;
      return score >= 20;
    });
    if (highScoreFiles.length > 0) {
      findings.push({
        type: 'warning',
        message: `${highScoreFiles.length} file(s) with high complexity scores`,
        location: join(getAuditDir(), `${auditName}-audit.json`),
        suggestion: `Review ${toRepoPath(join(getAuditDir(), `${auditName}-audit.md`))} for top hotspots`,
      });
    }
  }

  if (auditName === 'loop-mutations') {
    const files = jsonData.files || [];
    const mutationHits = files.filter((f) => (f.forEachMutationHits?.length ?? 0) > 0);
    if (mutationHits.length > 0) {
      findings.push({
        type: 'info',
        message: `${mutationHits.length} file(s) with forEach→mutation patterns (refactor candidates)`,
        location: join(getAuditDir(), 'loop-mutation-audit.json'),
        suggestion: `Review ${toRepoPath(join(getAuditDir(), 'loop-mutation-audit.md'))} for refactor opportunities`,
      });
    }
  }

  if (auditName === 'hardcoding') {
    const files = jsonData.files || [];
    const highScoreFiles = files.filter((f: { score?: number }) => (f.score ?? 0) >= 15);
    if (highScoreFiles.length > 0) {
      findings.push({
        type: 'info',
        message: `${highScoreFiles.length} file(s) with hardcoding patterns (config-driven candidates)`,
        location: join(getAuditDir(), 'hardcoding-audit.json'),
        suggestion: `Review ${toRepoPath(join(getAuditDir(), 'hardcoding-audit.md'))} for config-driven refactor opportunities`,
      });
    }
  }

  if (auditName === 'error-handling') {
    const issues = jsonData.issues || [];
    const criticalIssues = issues.filter((i: { severity: string }) => i.severity === 'critical' || i.severity === 'error');
    const warningIssues = issues.filter((i: { severity: string }) => i.severity === 'warning');
    if (criticalIssues.length > 0) {
      findings.push({
        type: 'error',
        message: `${criticalIssues.length} critical issue(s) (silent failures, empty catch blocks)`,
        location: join(getAuditDir(), 'error-handling-audit.json'),
        suggestion: `Review ${toRepoPath(join(getAuditDir(), 'error-handling-audit.json'))} for critical patterns`,
      });
    }
    if (warningIssues.length > 0) {
      findings.push({
        type: 'warning',
        message: `${warningIssues.length} warning(s) (defaults, fallbacks, legacy patterns)`,
        location: join(getAuditDir(), 'error-handling-audit.json'),
        suggestion: `Review ${toRepoPath(join(getAuditDir(), 'error-handling-audit.json'))} for fallback patterns`,
      });
    }
  }

  if (auditName === 'naming-convention') {
    const files = jsonData.files || [];
    if (files.length > 0) {
      findings.push({
        type: 'info',
        message: `${files.length} file(s) with naming convention findings`,
        location: join(getAuditDir(), 'naming-convention-audit.json'),
        suggestion: `Review ${toRepoPath(join(getAuditDir(), 'naming-convention-audit.md'))} for convention fixes`,
      });
    }
  }

  if (auditName === 'duplication') {
    const groups = jsonData.groups || [];
    const highLeverageGroups = groups.filter((g: { uniqueFiles?: number; lineCount?: number }) => {
      const leverage = (g.uniqueFiles ?? 0) * (g.lineCount ?? 0);
      return leverage >= 20;
    });
    if (highLeverageGroups.length > 0) {
      findings.push({
        type: 'info',
        message: `${highLeverageGroups.length} duplication group(s) with high consolidation leverage`,
        location: join(getAuditDir(), 'duplication-audit.json'),
        suggestion: `Review ${toRepoPath(join(getAuditDir(), 'duplication-audit.md'))} for DRY opportunities`,
      });
    }
  }

  if (auditName === 'test') {
    const summary = jsonData.summary || {};
    const untestedCount = summary.untestedSourceFiles ?? 0;
    const orphanedCount = summary.orphanedTestFiles ?? 0;
    const coverage = summary.coveragePercentage ?? 0;
    const untestedSource = jsonData.untestedSource || [];
    const highPriorityUntested = untestedSource.filter((s: { priority?: { bucket?: string; overall?: number } }) => {
      const priority = s.priority?.bucket ?? s.priority?.overall ?? 0;
      return priority === 'P0' || (typeof priority === 'number' && priority >= 7.0);
    });
    if (untestedCount > 0) {
      findings.push({
        type: 'warning',
        message: `${untestedCount} untested source file(s) (${coverage}% coverage)`,
        location: join(getAuditDir(), 'test-audit.json'),
        suggestion: `Review ${toRepoPath(join(getAuditDir(), 'test-audit.md'))} for test coverage gaps`,
      });
    }
    if (highPriorityUntested.length > 0) {
      findings.push({
        type: 'error',
        message: `${highPriorityUntested.length} P0/high-priority untested file(s)`,
        location: join(getAuditDir(), 'test-audit.json'),
        suggestion: `Review ${toRepoPath(join(getAuditDir(), 'test-audit.md'))} for critical test gaps`,
      });
    }
    if (orphanedCount > 0) {
      findings.push({
        type: 'info',
        message: `${orphanedCount} orphaned test file(s) (no corresponding source)`,
        location: join(getAuditDir(), 'test-audit.json'),
        suggestion: `Review ${toRepoPath(join(getAuditDir(), 'test-audit.md'))} for orphaned tests`,
      });
    }
  }

  if (auditName === 'type-health') {
    const findingsList = jsonData.findings || [];
    const waves = jsonData.repairWaves || {};
    const highFanIn = (waves.highFanIn as number[] | undefined)?.length ?? 0;
    const p0Findings = findingsList.filter(
      (f: { ruleId?: string }) => f.ruleId === 'nested-partial' || f.ruleId === 'record-string-any'
    );
    if (p0Findings.length > 0) {
      findings.push({
        type: 'warning',
        message: `${p0Findings.length} P0 type health finding(s) (nested utility types, Record<string,any>)`,
        location: join(getAuditDir(), 'type-health-audit.json'),
        suggestion: `Review type-health-audit.md for repair wave 1 (local fixes)`,
      });
    }
    if (highFanIn > 0) {
      findings.push({
        type: 'info',
        message: `${highFanIn} high-fan-in type finding(s) requiring coordinated repair`,
        location: join(getAuditDir(), 'type-health-audit.json'),
        suggestion: `Review type-health-audit.md wave 3 for multi-file repair planning`,
      });
    }
  }

  if (auditName === 'component-health') {
    const componentFindings = jsonData.findings || [];
    const componentWaves = jsonData.repairWaves || {};
    const propCouplingFindings = componentFindings.filter(
      (f: { ruleId?: string }) =>
        f.ruleId === 'excessive-prop-count' || f.ruleId === 'component-coupling'
    );
    if (propCouplingFindings.length > 0) {
      findings.push({
        type: 'warning',
        message: `${propCouplingFindings.length} component(s) with excessive props or coupling`,
        location: join(getAuditDir(), 'component-health-audit.json'),
        suggestion: 'Review component-health-audit.md for decomposition opportunities',
      });
    }
    const highFanIn = (componentWaves.highFanIn as unknown[] | undefined)?.length ?? 0;
    if (highFanIn > 0) {
      findings.push({
        type: 'info',
        message: `${highFanIn} high-fan-in component finding(s) requiring coordinated refactor`,
        location: join(getAuditDir(), 'component-health-audit.json'),
        suggestion: 'Review component-health-audit.md wave 3 for multi-file planning',
      });
    }
  }

  if (auditName === 'composable-health') {
    const composableFindings = jsonData.findings || [];
    const composableWaves = jsonData.repairWaves || {};
    const p0Findings = composableFindings.filter(
      (f: { ruleId?: string }) => f.ruleId === 'missing-return-type'
    );
    if (p0Findings.length > 0) {
      findings.push({
        type: 'warning',
        message: `${p0Findings.length} composable(s) missing explicit return type`,
        location: join(getAuditDir(), 'composable-health-audit.json'),
        suggestion: 'Review composable-health-audit.md wave 1 for local fixes',
      });
    }
    const composableHighFanIn = (composableWaves.highFanIn as unknown[] | undefined)?.length ?? 0;
    if (composableHighFanIn > 0) {
      findings.push({
        type: 'info',
        message: `${composableHighFanIn} high-fan-in composable finding(s) requiring coordinated repair`,
        location: join(getAuditDir(), 'composable-health-audit.json'),
        suggestion: 'Review composable-health-audit.md wave 3 for multi-file planning',
      });
    }
  }

  if (auditName === 'unused-code') {
    const files = jsonData.files || [];
    const highPriorityFiles = files.filter((f) => {
      const p = f.priority ?? 'P2';
      return p === 'P0' || p === 'P1';
    });
    const totalIssues = files.reduce((sum: number, f) => sum + (f.issues?.length ?? 0), 0);
    if (highPriorityFiles.length > 0) {
      findings.push({
        type: 'warning',
        message: `${highPriorityFiles.length} file(s) with P0/P1 unused code (${totalIssues} total issues)`,
        location: join(getAuditDir(), 'unused-code-audit.json'),
        suggestion: `Review ${toRepoPath(join(getAuditDir(), 'unused-code-audit.md'))} for unused exports/functions`,
      });
    }
    if (totalIssues > 50) {
      findings.push({
        type: 'info',
        message: `${totalIssues} unused code issues found (cleanup opportunity)`,
        location: join(getAuditDir(), 'unused-code-audit.json'),
        suggestion: `Review ${toRepoPath(join(getAuditDir(), 'unused-code-audit.md'))} for cleanup candidates`,
      });
    }
  }

  if (auditName === 'security') {
    const summary = jsonData.summary || {};
    const categories = jsonData.categories || [];
    const files = jsonData.files || [];
    const totalErrors = summary.totalErrors ?? 0;
    const totalWarnings = summary.totalWarnings ?? 0;
    const p0Categories = categories.filter((c) => c.priority === 'P0');
    const p0Files = files.filter((f) => f.priority === 'P0');
    if (totalErrors > 0) {
      findings.push({
        type: 'error',
        message: `${totalErrors} security error(s) found (${p0Categories.length} P0 categories, ${p0Files.length} P0 files)`,
        location: join(getAuditDir(), 'security-audit.json'),
        suggestion: `Review ${toRepoPath(join(getAuditDir(), 'security-audit.md'))} for critical security issues`,
      });
    }
    if (totalWarnings > 0 && totalErrors === 0) {
      findings.push({
        type: 'warning',
        message: `${totalWarnings} security warning(s) found`,
        location: join(getAuditDir(), 'security-audit.json'),
        suggestion: `Review ${toRepoPath(join(getAuditDir(), 'security-audit.md'))} for security best practices`,
      });
    }
    const csrfCategory = categories.find((c: { id?: string }) => c.id === 'csrf') as { errors?: unknown[] } | undefined;
    if (csrfCategory?.errors && csrfCategory.errors.length > 0) {
      findings.push({
        type: 'error',
        message: `${csrfCategory.errors.length} CSRF protection issue(s) found`,
        location: join(getAuditDir(), 'security-audit.json'),
        suggestion: `Review ${toRepoPath(join(getAuditDir(), 'security-audit.md'))} for routes missing CSRF protection`,
      });
    }
    const secretsCategory = categories.find((c: { id?: string }) => c.id === 'secrets') as { errors?: unknown[] } | undefined;
    if (secretsCategory?.errors && secretsCategory.errors.length > 0) {
      findings.push({
        type: 'error',
        message: `${secretsCategory.errors.length} exposed secret(s) found`,
        location: join(getAuditDir(), 'security-audit.json'),
        suggestion: `Review ${toRepoPath(join(getAuditDir(), 'security-audit.md'))} for exposed secrets`,
      });
    }
  }

  if (auditName === 'data-flow-health') {
    const tierFindings: AuditFinding[] = [];
    const dfFindings = jsonData.findings || [];
    const untypedInjects = dfFindings.filter((f: { ruleId?: string }) => f.ruleId === 'untyped-inject');
    const depthFindings = dfFindings.filter((f: { ruleId?: string }) => f.ruleId === 'provide-inject-depth');
    const gapFindings = dfFindings.filter((f: { ruleId?: string }) => f.ruleId === 'type-boundary-gap');
    if (untypedInjects.length > 0 || depthFindings.length > 0) {
      tierFindings.push({
        type: 'warning',
        message: `${untypedInjects.length} untyped inject(s), ${depthFindings.length} deep provide/inject chain(s)`,
        location: join(getAuditDir(), 'data-flow-health-audit.json'),
        suggestion: 'Review data-flow-health-audit.md for provide/inject hygiene',
      });
    }
    if (gapFindings.length > 0) {
      tierFindings.push({
        type: 'info',
        message: `${gapFindings.length} type boundary gap(s) in data flow`,
        location: join(getAuditDir(), 'data-flow-health-audit.json'),
        suggestion: 'Review data-flow-health-audit.md for type alignment opportunities',
      });
    }
    findings.push(...tierFindings);
  }

  if (auditName === 'type-similarity') {
    const groups = jsonData.groups || [];
    const criticalActions = groups.filter(
      (g) => g.action === 'UNIFY' || g.action === 'BRAND'
    );
    if (criticalActions.length > 0) {
      findings.push({
        type: 'info',
        message: `${criticalActions.length} type-similarity group(s) with UNIFY/BRAND action`,
        location: jsonPath,
        suggestion: `Review ${toRepoPath(jsonPath)} for type consolidation`,
      });
    }
  }

  if (auditName === 'architecture-alignment') {
    const files = jsonData.files || [];
    const warns = files.filter((f: { priority?: string }) => f.priority === 'P1' || f.priority === 'P2');
    if (warns.length > 0) {
      findings.push({
        type: 'warning',
        message: `${warns.length} architecture-alignment finding(s) (domain boundaries / imports)`,
        location: jsonPath,
        suggestion: `Review ${toRepoPath(jsonPath)} and .project-manager/ARCHITECTURE.md`,
      });
    }
  }

  if (auditName === 'import-graph') {
    const fanIn = (jsonData.fanInViolations as unknown[] | undefined)?.length ?? 0;
    const depth = (jsonData.composableChainDepthViolations as unknown[] | undefined)?.length ?? 0;
    const critical = fanIn > 10 || depth > 10;
    if (critical) {
      findings.push({
        type: 'info',
        message: `${fanIn} fan-in violation(s), ${depth} composable chain depth violation(s)`,
        location: jsonPath,
        suggestion: `Review ${toRepoPath(jsonPath)} for import structure`,
      });
    }
  }

  if (auditName === 'file-cohesion') {
    const files = jsonData.files || [];
    const p0Files = files.filter((f) => f.priority === 'P0');
    if (p0Files.length > 2) {
      findings.push({
        type: 'info',
        message: `${p0Files.length} file(s) with P0 cohesion violations`,
        location: jsonPath,
        suggestion: `Review ${toRepoPath(jsonPath)} for decomposition`,
      });
    }
  }

  if (auditName === 'deprecation') {
    const files = jsonData.files || [];
    const p0P1Files = files.filter(
      (f) => f.priority === 'P0' || f.priority === 'P1'
    );
    if (p0P1Files.length > 0) {
      findings.push({
        type: 'info',
        message: `${p0P1Files.length} file(s) with P0/P1 deprecation findings`,
        location: jsonPath,
        suggestion: `Review ${toRepoPath(jsonPath)} for deprecation cleanup`,
      });
    }
  }

  // Generic: audits without specific handlers above
  const hasSpecificHandler = [
    'typecheck', 'component-logic', 'composables-logic', 'loop-mutations', 'hardcoding',
    'error-handling', 'naming-convention', 'duplication', 'test', 'unused-code', 'security',
    'type-health', 'component-health', 'composable-health', 'data-flow-health',
    'type-similarity', 'import-graph', 'file-cohesion', 'deprecation', 'architecture-alignment',
  ].includes(auditName);
  if (!hasSpecificHandler && jsonData) {
    const hasFiles = (jsonData.files?.length ?? 0) > 0;
    const hasErrors = (jsonData.errors?.length ?? 0) > 0 || (jsonData.summary?.totalErrors ?? 0) > 0;
    const hasGroups = (jsonData.groups?.length ?? 0) > 0;
    if (hasFiles || hasErrors || hasGroups) {
      findings.push({
        type: 'info',
        message: `${auditName} audit produced output (review JSON for details)`,
        location: jsonPath,
        suggestion: `Review ${toRepoPath(jsonPath)} for findings`,
      });
    }
  }

  return findings;
}

/**
 * Spawn a single audit script and return a promise that resolves when it exits.
 * Non-fatal: resolves (not rejects) on non-zero exit so one failing audit
 * doesn't prevent reading the JSONs from the others.
 */
function spawnAuditScript(npmRun: string | undefined, changedOnly: boolean): Promise<void> {
  if (npmRun == null || npmRun === '') {
    return Promise.resolve();
  }
  const args = ['run', npmRun];
  if (changedOnly) args.push('--', '--changed-only');
  return new Promise((resolve) => {
    const child = spawn('npm', args, {
      cwd: getClientRoot(),
      stdio: 'ignore',
    });
    const timer = setTimeout(() => { child.kill(); resolve(); }, 120000);
    child.on('close', () => { clearTimeout(timer); resolve(); });
    child.on('error', () => { clearTimeout(timer); resolve(); });
  });
}

/**
 * Run all audit scripts for a tier in parallel.
 * Returns a promise that resolves when every script has finished (or timed out).
 * Each script writes its JSON to .audit-reports/ independently.
 */
export function runTierAuditsParallel(tier: AuditTier): Promise<void> {
  const config = TIER_AUDIT_CONFIG[tier];
  if (!config) return Promise.resolve();
  const promises = config.audits.map(a => spawnAuditScript(a.npmRun, config.changedOnly));
  if (tier === 'session') {
    promises.push(
      runArchitectureAlignmentAuditFromGitManager(listWorkingTreeChangedRepoPaths).catch(() => {})
    );
  }
  return Promise.all(promises).then(() => {});
}

/**
 * Run allowlist-cleanup so allowlist-prune-suggestions.json and .md are emitted.
 * Non-fatal: resolves even on failure so tier-end commit still includes other reports.
 */
function runAllowlistCleanup(): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', 'audit:allowlist-cleanup'], {
      cwd: getClientRoot(),
      stdio: 'ignore',
    });
    const timer = setTimeout(() => { child.kill(); resolve(); }, 60_000);
    child.on('close', () => { clearTimeout(timer); resolve(); });
    child.on('error', () => { clearTimeout(timer); resolve(); });
  });
}

export async function auditTierQuality(
  params: AuditParams & { tier: AuditTier },
  auditsComplete?: Promise<void>
): Promise<AuditResult> {
  const { tier } = params;
  const findings: AuditFinding[] = [];
  const recommendations: string[] = [];

  if (!existsSync(getClientRoot())) {
    return {
      category: 'tier-quality',
      status: 'pass',
      findings: [{ type: 'info', message: 'frontend-root directory not found - skipping tier quality audits' }],
      recommendations: [],
      summary: 'Skipped (frontend-root not found)',
    };
  }

  const config = TIER_AUDIT_CONFIG[tier];
  if (!config) {
    return {
      category: 'tier-quality',
      status: 'pass',
      findings: [{ type: 'info', message: `Unknown tier: ${tier}` }],
      recommendations: [],
      summary: `No config for tier ${tier}`,
    };
  }

  if (auditsComplete) {
    await auditsComplete;
  } else {
    // Fallback: run in parallel if no pre-warmed promise was provided
    await runTierAuditsParallel(tier);
  }

  await runAllowlistCleanup();

  for (const audit of config.audits) {
    const absPath = join(getAuditDir(), audit.jsonRelativePath);
    const jsonData = loadAuditJson(absPath);
    const auditFindings = generateFindingsFromAudit(audit.auditName, absPath, jsonData);
    findings.push(...auditFindings);
  }

  const errorCount = findings.filter(f => f.type === 'error').length;
  const warningCount = findings.filter(f => f.type === 'warning').length;

  if (errorCount > 0) recommendations.push('Review audit reports for errors');
  if (warningCount > 0) recommendations.push('Review audit reports for warnings');
  if (findings.some(f => f.message.includes('forEach→mutation'))) {
    recommendations.push('Consider refactoring forEach→mutation patterns to functional transforms (map/reduce/filter)');
  }
  if (findings.some(f => f.message.includes('hardcoding'))) {
    recommendations.push('Consider moving hardcoded patterns to config-driven approaches');
  }
  if (findings.some(f => f.message.includes('duplication'))) {
    recommendations.push('Review duplication audit for consolidation opportunities');
  }

  let score = 100;
  for (const f of findings) {
    if (f.type === 'error') score -= 20;
    if (f.type === 'warning') score -= 10;
    if (f.type === 'info') score -= 2;
  }
  if (score < 0) score = 0;

  const status = errorCount > 0 ? 'fail' : warningCount > 0 ? 'warn' : 'pass';

  return {
    category: 'tier-quality',
    status,
    score,
    findings,
    recommendations,
    summary: `Ran ${config.audits.length} ${tier}-tier audits; found ${errorCount} error(s), ${warningCount} warning(s), ${findings.length - errorCount - warningCount} info signal(s).`,
  };
}