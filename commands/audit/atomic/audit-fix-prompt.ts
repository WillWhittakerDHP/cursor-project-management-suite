/**
 * Atomic Command: /audit-fix [report-path]
 * Output a prompt with governance context (harness-injected markdown + @ refs), optional tier guide/planning, and optional audit report.
 * Uses the same primitives as tier-start: classifyWorkProfile(audit_fix), buildGovernanceContext, readArchitectureExcerptForPlanning.
 *
 * Tier: N/A (utility for audit-fix workflow)
 * Reads: .project-manager/AUDIT_FIX_CONTEXT.md for fallback copy-paste block when tier/report cannot narrow paths.
 * Tier context requires explicit scope (featureName + tier + identifier) in the command.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT, readProjectFile } from '../../utils/utils';
import { getPlaybooksForAudit, reportPathToAuditName } from '../../utils/tier-context-config';
import type { TierName } from '../../tiers/shared/types';
import type { Tier } from '../../harness/contracts';
import type { GovernanceDomain } from '../../harness/work-profile';
import { classifyWorkProfile } from '../../harness/work-profile-classifier';
import { readArchitectureExcerptForPlanning } from '../../harness/architecture-excerpt';
import { getPlaybooksForGovernanceDomains, AUDIT_GLOBAL_CONFIG } from '../../harness/governance-domain-map';
import { buildGovernanceContext } from '../governance-context';
import { parseDeliverablesFromPlanningDoc } from '../../utils/planning-doc-parse';
import { resolvePlanningDocRelativePath } from '../../utils/planning-doc-paths';

function getAuditFixContextPath(): string {
  return join(PROJECT_ROOT, '.project-manager', 'AUDIT_FIX_CONTEXT.md');
}

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
  const sessionId = identifier.split('.').slice(0, 3).join('.');
  paths.push(`${base}/sessions/task-${identifier}-planning.md`, `${base}/sessions/session-${sessionId}-guide.md`);
  return paths;
}

/**
 * Extract the first line from the doc that contains @.project-manager (the copy-paste block).
 */
function parseCopyPasteBlock(content: string): string | null {
  const codeBlockMatch = content.match(/```\s*\n?([\s\S]*?)```/);
  if (!codeBlockMatch) return null;
  const block = codeBlockMatch[1].trim();
  const line = block.split('\n').find((l) => l.trim().startsWith('@.project-manager'));
  return line?.trim() ?? null;
}

const FALLBACK_REFS =
  '@.project-manager/COMPONENT_AUTHORING_PLAYBOOK.md @.project-manager/COMPOSABLE_AUTHORING_PLAYBOOK.md @.project-manager/FUNCTION_AUTHORING_PLAYBOOK.md @.project-manager/TYPE_AUTHORING_PLAYBOOK.md @client/.audit-reports/audit-global-config.json';

async function loadGovernanceRefsFallbackLine(): Promise<string> {
  try {
    const content = await readFile(getAuditFixContextPath(), 'utf-8');
    const refs = parseCopyPasteBlock(content);
    return refs ?? FALLBACK_REFS;
  } catch {
    return FALLBACK_REFS;
  }
}

/** Classifier + shared builders; single source for audit-fix rich context (audit-fix + tier-end). */
export async function buildAuditFixContextEnvelope(params: {
  tier: TierName;
  taskFiles?: string[];
}): Promise<{
  governanceBlock: string;
  architectureExcerpt: string | null;
  playbookPaths: string[];
}> {
  const { tier, taskFiles } = params;
  const workProfile = classifyWorkProfile({
    tier: tier as Tier,
    action: 'end',
    reasonCode: 'audit_fix',
  });

  const governanceBlock = await buildGovernanceContext({
    tier,
    taskFiles: taskFiles ?? [],
  });

  const domainsForAuditFix: GovernanceDomain[] = [
    ...new Set([...workProfile.governanceDomains, 'architecture']),
  ];
  const architectureExcerpt = await readArchitectureExcerptForPlanning(
    PROJECT_ROOT,
    domainsForAuditFix
  );

  const playbookPaths = getPlaybooksForGovernanceDomains(domainsForAuditFix);

  return { governanceBlock, architectureExcerpt, playbookPaths };
}

/**
 * Resolve task-scoped files: explicit param, else parse Deliverables from task planning doc.
 */
export async function resolveTaskFilesForAuditFix(params: {
  tier?: TierName;
  featureName?: string;
  identifier?: string;
  explicit?: string[];
}): Promise<string[] | undefined> {
  if (params.explicit !== undefined) {
    return params.explicit;
  }
  if (params.tier !== 'task' || !params.featureName?.trim() || !params.identifier?.trim()) {
    return undefined;
  }
  const basePath = `.project-manager/features/${params.featureName.trim()}`;
  const rel = resolvePlanningDocRelativePath(basePath, 'task', params.identifier.trim());
  try {
    const content = await readProjectFile(rel);
    const files = parseDeliverablesFromPlanningDoc(content);
    return files.length > 0 ? files : undefined;
  } catch {
    return undefined;
  }
}

function mergeAuditFixPaths(params: {
  envelopePlaybooks: string[];
  reportPath?: string;
  tierContextPaths: string[];
}): string[] {
  const set = new Set<string>();
  for (const p of params.envelopePlaybooks) {
    if (p) set.add(p.replace(/^@/, '').trim());
  }
  if (params.reportPath?.trim()) {
    const auditName = reportPathToAuditName(params.reportPath);
    if (auditName) {
      for (const p of getPlaybooksForAudit(auditName)) {
        set.add(p);
      }
    }
  }
  for (const p of params.tierContextPaths) {
    if (p) set.add(p.replace(/^@/, '').trim());
  }
  const report = params.reportPath?.replace(/^@/, '').trim();
  if (report) set.add(report);
  set.add(AUDIT_GLOBAL_CONFIG);
  return [...set];
}

function buildRichInstruction(envelope: {
  governanceBlock: string;
  architectureExcerpt: string | null;
}): string {
  const parts: string[] = [DEFAULT_INSTRUCTION];
  if (envelope.architectureExcerpt?.trim()) {
    parts.push(
      `## Architecture context (harness-injected)\n\n${envelope.architectureExcerpt.trim()}`
    );
  }
  if (envelope.governanceBlock?.trim()) {
    parts.push(`## Governance context (harness-injected)\n\n${envelope.governanceBlock.trim()}`);
  }
  return parts.join('\n\n');
}

/**
 * Single assembly for programmatic + CLI audit-fix: rich instruction, merged paths.
 */
async function assembleAuditFixContext(params: AuditFixPromptParams): Promise<AuditFixContext> {
  const tier = params.tier ?? 'session';
  const taskFiles = await resolveTaskFilesForAuditFix({
    tier: params.tier,
    featureName: params.featureName,
    identifier: params.identifier,
    explicit: params.taskFiles,
  });

  const envelope = await buildAuditFixContextEnvelope({
    tier,
    taskFiles: taskFiles ?? [],
  });

  const tierContextPaths =
    params.featureName && params.tier && params.identifier
      ? buildTierContextPaths(params.featureName, params.tier, params.identifier)
      : [];

  let paths = mergeAuditFixPaths({
    envelopePlaybooks: envelope.playbookPaths,
    reportPath: params.reportPath,
    tierContextPaths,
  });

  if (paths.length === 0 || (tier === 'feature' && !params.reportPath)) {
    const fallbackLine = await loadGovernanceRefsFallbackLine();
    const fromFallback = fallbackLine
      .split(/\s+/)
      .map((s) => s.replace(/^@/, '').trim())
      .filter(Boolean);
    paths = [...new Set([...paths, ...fromFallback])];
  }

  const instruction = buildRichInstruction(envelope);
  return { instruction, paths };
}

function formatAuditFixPromptForPaste(context: AuditFixContext): string {
  const refs = context.paths.map((p) => `@${p.replace(/^@/, '').trim()}`).join(' ');
  return `${context.instruction}\n\n${refs}\n`;
}

export interface AuditFixPromptParams {
  /** Optional path to the audit report (e.g. client/.audit-reports/component-health-audit.md) */
  reportPath?: string;
  featureName?: string;
  tier?: 'feature' | 'phase' | 'session' | 'task';
  identifier?: string;
  /** When set, used for task-tier buildGovernanceContext file scope; else derived from task planning Deliverables when possible. */
  taskFiles?: string[];
}

/**
 * Generate paste string: same rich context as getAuditFixContext, formatted with @ refs.
 */
export async function auditFixPrompt(params: AuditFixPromptParams = {}): Promise<string> {
  const ctx = await assembleAuditFixContext(params);
  return formatAuditFixPromptForPaste(ctx);
}

/** Result for direct execution: agent reads instruction (includes injected markdown) and paths. */
export interface AuditFixContext {
  instruction: string;
  paths: string[];
}

export async function getAuditFixContext(params: AuditFixPromptParams = {}): Promise<AuditFixContext> {
  return assembleAuditFixContext(params);
}

async function main(): Promise<void> {
  const reportPath = process.argv[2];
  const prompt = await auditFixPrompt({ reportPath });
  process.stdout.write(prompt);
}

const isMainModule =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
