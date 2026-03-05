/**
 * Atomic Command: /audit-fix [report-path]
 * Output a prompt with @ refs to governance docs and optional audit report so the user can paste it into chat and get guaranteed context injection.
 *
 * Tier: N/A (utility for audit-fix workflow)
 * Reads: .project-manager/AUDIT_FIX_CONTEXT.md for the copy-paste block of @ paths.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';

const AUDIT_FIX_CONTEXT_PATH = join(PROJECT_ROOT, '.project-manager', 'AUDIT_FIX_CONTEXT.md');

const DEFAULT_INSTRUCTION =
  'Fix the audit findings in the attached report. Follow the governance playbooks and allowlist policy in the attached context.';

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
 * Build the full prompt: instruction line, blank line, then @ refs (governance paths + optional report path).
 */
export function buildAuditFixPrompt(governanceRefs: string, reportPath?: string): string {
  const refsLine = reportPath ? `${governanceRefs} @${reportPath.replace(/^@/, '')}` : governanceRefs;
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

export interface AuditFixPromptParams {
  /** Optional path to the audit report (e.g. .cursor/project-manager/features/<feature>/audits/session-6.7.2-audit.md) */
  reportPath?: string;
}

/**
 * Generate and return the audit-fix prompt string (instruction + @ refs).
 * Use this from composite commands or when invoking programmatically.
 */
export async function auditFixPrompt(params: AuditFixPromptParams = {}): Promise<string> {
  const governanceRefs = await loadGovernanceRefs();
  return buildAuditFixPrompt(governanceRefs, params.reportPath);
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
