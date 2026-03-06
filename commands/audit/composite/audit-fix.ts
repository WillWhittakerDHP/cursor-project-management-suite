/**
 * Composite Command: /audit-fix [report-path]
 * Generate a prompt with @ refs to governance docs, tier-appropriate context (guide + planning doc), and optional audit report.
 * Instruction directs the agent to read context first and maintain governance patterns.
 *
 * Invocation: auditFix({ reportPath?, featureName?, tier?, identifier? }) returns the prompt string. Print it so the user can paste into chat.
 * CLI alternative: npx tsx .cursor/commands/audit/atomic/audit-fix-prompt.ts [report-path]
 */

import { auditFixPrompt } from '../atomic/audit-fix-prompt';

export interface AuditFixParams {
  /** Optional path to the audit report (e.g. from tier-end message). */
  reportPath?: string;
  /** Optional: feature name for tier context (otherwise from .tier-scope). */
  featureName?: string;
  /** Optional: tier for tier-appropriate refs (otherwise from .tier-scope). */
  tier?: 'feature' | 'phase' | 'session' | 'task';
  /** Optional: tier identifier (e.g. session 6.10.1, task 6.9.1.1). */
  identifier?: string;
}

/**
 * Build the audit-fix prompt (instruction + governance + tier context + report @ refs). Use when the user chooses "Fix audit with governance context (/audit-fix)" after audit_failed.
 */
export async function auditFix(params: AuditFixParams = {}): Promise<string> {
  return auditFixPrompt({
    reportPath: params.reportPath,
    featureName: params.featureName,
    tier: params.tier,
    identifier: params.identifier,
  });
}
