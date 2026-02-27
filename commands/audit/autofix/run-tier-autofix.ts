/**
 * Tier autofix: single entry point for script fixes, agent fix plan, and downward re-audit cascade.
 * Tier-end composites call runTierAutofix(tier, auditResult) after their audit.
 */

import { execSync } from 'child_process';
import { join } from 'path';
import type { AuditFinding, AuditResult, AuditTier, AutofixEntry, AutofixResult } from '../types';
import { tierDown } from '../../utils/tier-navigation';
import { auditTierQuality } from '../atomic/audit-tier-quality';
import { PROJECT_ROOT, FRONTEND_ROOT } from '../../utils/utils';

const CLIENT_ROOT = join(PROJECT_ROOT, FRONTEND_ROOT);

const SCRIPT_FIX_REGISTRY: Array<{
  auditName: string;
  findingPattern: RegExp;
  getCommand: (finding: AuditFinding) => string;
  getAffectedFiles: (finding: AuditFinding) => string[];
}> = [
  {
    auditName: 'naming-convention',
    findingPattern: /naming convention findings?/i,
    getCommand: () => `cd "${CLIENT_ROOT}" && npm run lint -- --fix`,
    getAffectedFiles: (f) => (f.location ? [f.location] : []),
  },
  {
    auditName: 'loop-mutations',
    findingPattern: /forEach→mutation|forEach.*mutation/i,
    getCommand: () => `cd "${CLIENT_ROOT}" && npm run lint -- --fix`,
    getAffectedFiles: (f) => (f.location ? [f.location] : []),
  },
  {
    auditName: 'error-handling',
    findingPattern: /critical issue|warning.*defaults?.*fallback/i,
    getCommand: () => `cd "${CLIENT_ROOT}" && npm run lint -- --fix`,
    getAffectedFiles: (f) => (f.location ? [f.location] : []),
  },
];

const AGENT_FIX_REGISTRY: Array<{
  auditName: string;
  findingPattern: RegExp;
  getDirective: (finding: AuditFinding) => string;
}> = [
  {
    auditName: 'component-logic',
    findingPattern: /high complexity|complexity scores?/i,
    getDirective: (f) =>
      `Extract complex logic from ${f.location ?? 'affected file'} into composables. Target: reduce complexity score below 20.`,
  },
  {
    auditName: 'composables-logic',
    findingPattern: /high complexity|complexity scores?/i,
    getDirective: (f) =>
      `Reduce composable complexity in ${f.location ?? 'affected file'}. Split or simplify to keep score below 20.`,
  },
  {
    auditName: 'duplication',
    findingPattern: /duplication group|consolidation leverage|DRY/i,
    getDirective: (f) =>
      `Consolidate duplicated code identified in ${f.location ?? 'audit report'}. Create shared utility or composable.`,
  },
  {
    auditName: 'hardcoding',
    findingPattern: /hardcoding|config-driven/i,
    getDirective: (f) =>
      `Move hardcoded patterns in ${f.location ?? 'affected file'} to config or constants.`,
  },
  {
    auditName: 'unused-code',
    findingPattern: /unused code|P0\/P1 unused/i,
    getDirective: (f) =>
      `Remove or allowlist unused exports/functions in ${f.location ?? 'affected file'}. Verify before remove.`,
  },
  {
    auditName: 'typecheck',
    findingPattern: /TypeScript error|P0 type error/i,
    getDirective: (f) =>
      `Fix type errors reported in ${f.location ?? 'typecheck-audit'}. Address P0 pools first.`,
  },
  {
    auditName: 'security',
    findingPattern: /security error|CSRF|exposed secret/i,
    getDirective: (f) =>
      `Remediate security issues in ${f.location ?? 'security-audit'}. Do not ship with P0 security findings.`,
  },
  {
    auditName: 'vue-architecture',
    findingPattern: /data fetching|logic creep|composable naming|extract to composable/i,
    getDirective: (f) =>
      f.suggestion ?? `Apply Vue architecture guidance for ${f.location ?? 'file'}.`,
  },
  {
    auditName: 'test',
    findingPattern: /untested source|P0\/high-priority untested|test coverage/i,
    getDirective: (f) =>
      `Add or update tests for high-priority untested files. See ${f.location ?? 'test-audit'}.`,
  },
  {
    auditName: 'type-health',
    findingPattern: /type health|nested utility|Record<string,\s*any>/i,
    getDirective: (f) =>
      `Fix type health findings in ${f.location ?? 'type-health-audit'}. Follow repair waves in type-health-audit.md: wave 1 for local fixes (nested utilities, Record<string,any>), wave 3 for multi-file planning.`,
  },
  {
    auditName: 'component-health',
    findingPattern: /excessive prop|component.coupling|high-fan-in component/i,
    getDirective: (f) =>
      `Address component health issues in ${f.location ?? 'component-health-audit'}. Review component-health-audit.md for decomposition opportunities and coordinated refactors.`,
  },
  {
    auditName: 'composable-health',
    findingPattern: /missing explicit return type|high-fan-in composable/i,
    getDirective: (f) =>
      `Fix composable health findings in ${f.location ?? 'composable-health-audit'}. Add explicit return types (wave 1) and plan high-fan-in refactors (wave 3) per composable-health-audit.md.`,
  },
  {
    auditName: 'data-flow-health',
    findingPattern: /untyped inject|provide\/inject|type boundary gap/i,
    getDirective: (f) =>
      `Resolve data-flow health issues in ${f.location ?? 'data-flow-health-audit'}. Add types to untyped inject() calls, reduce provide/inject depth, and close type boundary gaps per data-flow-health-audit.md.`,
  },
];

function applyScriptFixes(
  tier: AuditTier,
  findings: AuditFinding[]
): { entries: AutofixEntry[]; remainingFindings: AuditFinding[] } {
  const applied = new Set<number>();
  const entries: AutofixEntry[] = [];

  for (let i = 0; i < findings.length; i++) {
    const finding = findings[i];
    const msg = `${finding.message} ${finding.suggestion ?? ''}`;
    for (const reg of SCRIPT_FIX_REGISTRY) {
      if (!reg.findingPattern.test(msg)) continue;
      const command = reg.getCommand(finding);
      const affectedFiles = reg.getAffectedFiles(finding);
      let appliedOk = false;
      try {
        execSync(command, {
          cwd: PROJECT_ROOT,
          stdio: 'pipe',
          timeout: 60000,
        });
        appliedOk = true;
      } catch (_err) {
        // non-fatal
      }
      entries.push({
        action: 'script',
        auditName: reg.auditName,
        finding,
        command,
        affectedFiles,
        applied: appliedOk,
      });
      applied.add(i);
      break;
    }
  }

  const remainingFindings = findings.filter((_, i) => !applied.has(i));
  return { entries, remainingFindings };
}

function buildAgentFixPlan(findings: AuditFinding[]): AutofixEntry[] {
  const entries: AutofixEntry[] = [];
  for (const finding of findings) {
    const msg = `${finding.message} ${finding.suggestion ?? ''}`;
    for (const reg of AGENT_FIX_REGISTRY) {
      if (!reg.findingPattern.test(msg)) continue;
      const directive = reg.getDirective(finding);
      const location = finding.location;
      entries.push({
        action: 'agent',
        auditName: reg.auditName,
        finding,
        agentDirective: directive,
        affectedFiles: location ? [location] : [],
        applied: false,
      });
      break;
    }
  }
  return entries;
}

async function cascadeDownwardReaudit(
  currentTier: AuditTier,
  affectedFiles: string[],
  depth: number,
  maxDepth: number,
  featureName?: string
): Promise<AutofixResult[]> {
  const childTier = tierDown(currentTier);
  if (!childTier || depth >= maxDepth || affectedFiles.length === 0) return [];

  const reauditResult = await auditTierQuality({
    tier: childTier,
    identifier: 'cascade-reaudit',
    featureName,
    modifiedFiles: affectedFiles,
  });

  if (reauditResult.findings.length === 0) return [];

  const childFixResult = await runTierAutofix(childTier, reauditResult, {
    maxCascadeDepth: maxDepth,
    cascadeDepth: depth + 1,
    changedFiles: affectedFiles,
    featureName,
  });

  return [childFixResult, ...childFixResult.cascadeResults];
}

export interface RunTierAutofixOptions {
  maxCascadeDepth?: number;
  /** Current cascade depth (0 = top-level). Used internally for recursion. */
  cascadeDepth?: number;
  changedFiles?: string[];
  featureName?: string;
}

/**
 * Run script fixes, build agent fix plan, then cascade downward re-audits on affected files.
 */
export async function runTierAutofix(
  tier: AuditTier,
  auditResult: AuditResult,
  options?: RunTierAutofixOptions
): Promise<AutofixResult> {
  const maxDepth = options?.maxCascadeDepth ?? 0;
  const depth = options?.cascadeDepth ?? 0;
  const featureName = options?.featureName;
  const findings = auditResult.findings ?? [];

  const { entries: scriptEntries, remainingFindings } = applyScriptFixes(tier, findings);
  const scriptFixesApplied = scriptEntries.filter((e) => e.applied).length;
  const scriptAffected = scriptEntries.flatMap((e) => e.affectedFiles);

  const agentFixEntries = buildAgentFixPlan(remainingFindings);
  const agentAffected = agentFixEntries.flatMap((e) => e.affectedFiles);

  const allAffected = [...new Set([...scriptAffected, ...agentAffected])].filter(Boolean);

  const cascadeResults = await cascadeDownwardReaudit(
    tier,
    allAffected,
    depth,
    maxDepth,
    featureName
  );

  const summaryParts: string[] = [];
  summaryParts.push(
    `Tier ${tier}: ${scriptFixesApplied} script fix(es) applied, ${agentFixEntries.length} agent directive(s).`
  );
  if (allAffected.length > 0) {
    summaryParts.push(`Affected files: ${allAffected.length}.`);
  }
  if (cascadeResults.length > 0) {
    summaryParts.push(`Cascade: ${cascadeResults.length} lower-tier re-audit(s) run.`);
  }

  return {
    tier,
    scriptFixesApplied,
    agentFixEntries,
    affectedFiles: allAffected,
    cascadeResults,
    summary: summaryParts.join(' '),
  };
}
