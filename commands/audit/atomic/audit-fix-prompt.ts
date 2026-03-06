/**
 * Atomic Command: /audit-fix [report-path]
 * Output a prompt with @ refs to governance docs, optional tier-appropriate context (guide + planning doc), and optional audit report.
 * Instructs the agent to read the attached context first to avoid duplication and maintain governance patterns.
 *
 * Tier: N/A (utility for audit-fix workflow)
 * Reads: .project-manager/AUDIT_FIX_CONTEXT.md for the copy-paste block of @ paths; .project-manager/.tier-scope for tier context when not passed.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';
import { readTierScope } from '../../utils/tier-scope';

const AUDIT_FIX_CONTEXT_PATH = join(PROJECT_ROOT, '.project-manager', 'AUDIT_FIX_CONTEXT.md');

const DEFAULT_INSTRUCTION =
  'Read the attached governance and audit context before making changes. Fix the audit findings per the playbooks\' thresholds and decision trees. Reuse existing patterns in the codebase and playbooks; do not duplicate logic or introduce patterns that conflict with governance.';

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

export async function loadGovernanceRefs(): Promise<string> {
  try {
    const content = await readFile(AUDIT_FIX_CONTEXT_PATH, 'utf-8');
    const refs = parseCopyPasteBlock(content);
    return refs ?? FALLBACK_REFS;
  } catch {
    return FALLBACK_REFS;
  }
}

/** Load tier-appropriate @ refs (guide + planning doc) from .tier-scope or from explicit params. */
export async function loadTierContextRefs(params: {
  featureName?: string;
  tier?: 'feature' | 'phase' | 'session' | 'task';
  identifier?: string;
}): Promise<string> {
  let featureName = params.featureName;
  let tier = params.tier;
  let identifier = params.identifier;
  if (!featureName || !tier || !identifier) {
    const scope = await readTierScope();
    featureName = featureName ?? scope.feature?.id ?? '';
    if (!tier && scope.task?.id) {
      tier = 'task';
      identifier = scope.task.id;
    } else if (!tier && scope.session?.id) {
      tier = 'session';
      identifier = scope.session.id;
    } else if (!tier && scope.phase?.id) {
      tier = 'phase';
      identifier = scope.phase.id;
    } else if (!tier && scope.feature?.id) {
      tier = 'feature';
      identifier = scope.feature.id;
    }
  }
  if (!featureName || !tier || !identifier) return '';
  const paths = buildTierContextPaths(featureName, tier, identifier);
  return paths.map((p) => `@${p}`).join(' ');
}

export interface AuditFixPromptParams {
  /** Optional path to the audit report (e.g. client/.audit-reports/component-health-audit.md) */
  reportPath?: string;
  /** Optional: feature name for tier context (otherwise from .tier-scope) */
  featureName?: string;
  /** Optional: tier for tier-appropriate context (otherwise from .tier-scope) */
  tier?: 'feature' | 'phase' | 'session' | 'task';
  /** Optional: tier identifier (e.g. session 6.10.1, task 6.9.1.1) */
  identifier?: string;
}

/**
 * Generate and return the audit-fix prompt string (instruction + governance + tier context + report @ refs).
 * Use this from composite commands or when invoking programmatically.
 */
export async function auditFixPrompt(params: AuditFixPromptParams = {}): Promise<string> {
  const [governanceRefs, tierContextRefs] = await Promise.all([
    loadGovernanceRefs(),
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
