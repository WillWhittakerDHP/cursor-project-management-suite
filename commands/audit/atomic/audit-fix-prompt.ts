/**
 * Atomic Command: /audit-fix [report-path]
 * Output a prompt with @ refs to governance docs, optional tier-appropriate context (guide + planning doc), and optional audit report.
 * Instructs the agent to read the attached context first to avoid duplication and maintain governance patterns.
 *
 * Tier: N/A (utility for audit-fix workflow)
 * Reads: .project-manager/AUDIT_FIX_CONTEXT.md for the copy-paste block of @ paths.
 * Tier context requires explicit scope (featureName + tier + identifier) in the command.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';
import {
  getPlaybooksForAudit,
  getPlaybooksForTier,
  reportPathToAuditName,
} from '../../utils/tier-context-config';
import type { TierName } from '../../tiers/shared/types';

const AUDIT_FIX_CONTEXT_PATH = join(PROJECT_ROOT, '.project-manager', 'AUDIT_FIX_CONTEXT.md');

const DEFAULT_INSTRUCTION =
  'Read the attached governance and audit context before making changes. Fix only the issues called out in the audit report (using playbooks\' thresholds and decision trees). Reuse existing patterns; do not duplicate logic or introduce patterns that conflict with governance. Do not run typecheck, regenerate audit JSON, or inspect raw audit files unless the report explicitly says the fix is to regenerate or fix the audit pipeline.';

/** Build paths for tier-appropriate context (guide + planning doc) so the agent has current scope. */
function buildTierContextPaths(
  featureName: string,
  tier: 'feature' | 'phase' | 'session' | 'task',
  identifier: string
): string[] {
  const base = `.project-manager/features/${featureName}`;
  const paths: string[] = [];
  if (tier === 'feature') {
    paths.push(`${base}/feature-planning.md`, `${base}/feature-${featureName}-guide.md`);
    return paths;
  }
  if (tier === 'phase') {
    paths.push(`${base}/phases/phase-${identifier}-guide.md`, `${base}/phases/phase-${identifier}-planning.md`);
    return paths;
  }
  if (tier === 'session') {
    paths.push(`${base}/sessions/session-${identifier}-guide.md`, `${base}/sessions/session-${identifier}-planning.md`);
    return paths;
  }
  // task: task planning doc + session guide (session id = task id without last segment)
  const sessionId = identifier.split('.').slice(0, 3).join('.');
  paths.push(`${base}/sessions/task-${identifier}-planning.md`, `${base}/sessions/session-${sessionId}-guide.md`);
  return paths;
}

/**
 * Extract the first line from the doc that contains @.project-manager (the copy-paste block).
 * Looks for a fenced code block (```) and returns the first line inside it that starts with @.
 */
function parseCopyPasteBlock(content: string): string | null {
  const codeBlockMatch = content.match(/```\s*\n?([\s\S]*?)```/);
  if (!codeBlockMatch) return null;
  const block = codeBlockMatch[1].trim();
  const line = block.split('\n').find((l) => l.trim().startsWith('@.project-manager'));
  return line?.trim() ?? null;
}

/**
 * Build the full prompt: instruction line, blank line, then @ refs (governance + optional tier context + optional report path).
 */
export function buildAuditFixPrompt(
  governanceRefs: string,
  options?: { reportPath?: string; tierContextRefs?: string }
): string {
  let refsLine = governanceRefs;
  if (options?.tierContextRefs?.trim()) {
    refsLine = `${refsLine} ${options.tierContextRefs.trim()}`;
  }
  if (options?.reportPath?.trim()) {
    refsLine = `${refsLine} @${options.reportPath.replace(/^@/, '').trim()}`;
  }
  return `${DEFAULT_INSTRUCTION}\n\n${refsLine}\n`;
}

/**
 * Load governance @ refs from AUDIT_FIX_CONTEXT.md (copy-paste block).
 * Falls back to a hardcoded list if the doc is missing or unparseable.
 */
const FALLBACK_REFS =
  '@.project-manager/COMPONENT_AUTHORING_PLAYBOOK.md @.project-manager/COMPOSABLE_AUTHORING_PLAYBOOK.md @.project-manager/FUNCTION_AUTHORING_PLAYBOOK.md @.project-manager/TYPE_AUTHORING_PLAYBOOK.md @client/.audit-reports/audit-global-config.json';

/** Governance @ refs from tier-context-config (sync). Returns empty string when tier/reportPath resolve to no paths. */
function getGovernanceRefsFromConfig(tier?: TierName, reportPath?: string): string {
  if (reportPath) {
    const auditName = reportPathToAuditName(reportPath);
    if (auditName) {
      const paths = getPlaybooksForAudit(auditName);
      if (paths.length > 0) return paths.map((p) => `@${p}`).join(' ');
    }
  }
  if (tier) {
    const paths = getPlaybooksForTier(tier);
    if (paths.length > 0) return paths.map((p) => `@${p}`).join(' ');
  }
  return '';
}

/**
 * Governance refs for the prompt: tier/report-pertinent from config when tier or reportPath present;
 * otherwise full list from AUDIT_FIX_CONTEXT. When tier is feature, use full list (feature fixes are rare).
 */
async function getGovernanceRefsForPrompt(params: {
  tier?: TierName;
  reportPath?: string;
}): Promise<string> {
  const { tier, reportPath } = params;
  if (tier === 'feature') return loadGovernanceRefs();
  if (tier != null || (reportPath != null && reportPath.trim() !== '')) {
    const refs = getGovernanceRefsFromConfig(tier, reportPath);
    if (refs) return refs;
  }
  return loadGovernanceRefs();
}

export async function loadGovernanceRefs(): Promise<string> {
  try {
    const content = await readFile(AUDIT_FIX_CONTEXT_PATH, 'utf-8');
    const refs = parseCopyPasteBlock(content);
    return refs ?? FALLBACK_REFS;
  } catch {
    return FALLBACK_REFS;
  }
}

/** Load tier-appropriate @ refs (guide + planning doc). Requires explicit scope (featureName + tier + identifier). */
export async function loadTierContextRefs(params: {
  featureName?: string;
  tier?: 'feature' | 'phase' | 'session' | 'task';
  identifier?: string;
}): Promise<string> {
  const { featureName, tier, identifier } = params;
  if (!featureName || !tier || !identifier) return '';
  const paths = buildTierContextPaths(featureName, tier, identifier);
  return paths.map((p) => `@${p}`).join(' ');
}

export interface AuditFixPromptParams {
  /** Optional path to the audit report (e.g. client/.audit-reports/component-health-audit.md) */
  reportPath?: string;
  /** Feature name for tier context (required for tier refs). */
  featureName?: string;
  /** Tier for tier-appropriate context (required for tier refs). */
  tier?: 'feature' | 'phase' | 'session' | 'task';
  /** Tier identifier, e.g. session 6.10.1, task 6.9.1.1 (required for tier refs). */
  identifier?: string;
}

/**
 * Generate and return the audit-fix prompt string (instruction + governance + tier context + report @ refs).
 * Use this from composite commands or when invoking programmatically.
 */
export async function auditFixPrompt(params: AuditFixPromptParams = {}): Promise<string> {
  const [governanceRefs, tierContextRefs] = await Promise.all([
    getGovernanceRefsForPrompt({ tier: params.tier, reportPath: params.reportPath }),
    loadTierContextRefs({
      featureName: params.featureName,
      tier: params.tier,
      identifier: params.identifier,
    }),
  ]);
  return buildAuditFixPrompt(governanceRefs, {
    reportPath: params.reportPath,
    tierContextRefs,
  });
}

/** Result for direct execution: agent reads these paths then fixes per the instruction. */
export interface AuditFixContext {
  instruction: string;
  /** Repo-relative paths to read (governance playbooks, tier guide/planning, audit report). */
  paths: string[];
}

/**
 * Return instruction + paths for direct execution. Agent should read each path, then fix findings
 * per the instruction. Use this instead of pasting the prompt—read the context and fix directly.
 */
export async function getAuditFixContext(params: AuditFixPromptParams = {}): Promise<AuditFixContext> {
  const [governanceRefs, tierContextRefs] = await Promise.all([
    getGovernanceRefsForPrompt({ tier: params.tier, reportPath: params.reportPath }),
    loadTierContextRefs({
      featureName: params.featureName,
      tier: params.tier,
      identifier: params.identifier,
    }),
  ]);
  const refsLine = [governanceRefs, tierContextRefs, params.reportPath ? `@${params.reportPath.replace(/^@/, '').trim()}` : '']
    .filter(Boolean)
    .join(' ');
  const paths = refsLine
    .split(/\s+/)
    .map((s) => s.replace(/^@/, '').trim())
    .filter(Boolean);
  const dedup = [...new Set(paths)];
  return { instruction: DEFAULT_INSTRUCTION, paths: dedup };
}

/**
 * CLI entry: run with optional report path as first arg.
 * Outputs the prompt to stdout for copy-paste into chat.
 */
async function main(): Promise<void> {
  const reportPath = process.argv[2];
  const prompt = await auditFixPrompt({ reportPath });
  process.stdout.write(prompt);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
