/**
 * Composite Command: /audit-fix [report-path]
 * Generate a prompt with @ refs to governance docs and optional audit report for copy-paste into chat.
 *
 * Invocation: auditFix(reportPath?) returns the prompt string. Print it so the user can paste into chat.
 * CLI alternative: npx tsx .cursor/commands/audit/atomic/audit-fix-prompt.ts [report-path]
 */

import { auditFixPrompt } from '../atomic/audit-fix-prompt';

export interface AuditFixParams {
  /** Optional path to the audit report (e.g. from tier-end message). */
  reportPath?: string;
}

/**
 * Build the audit-fix prompt (instruction + @ refs). Use when the user chooses "Fix audit with governance context (/audit-fix)" after audit_failed.
 */
export async function auditFix(params: AuditFixParams = {}): Promise<string> {
  return auditFixPrompt({ reportPath: params.reportPath });
}
