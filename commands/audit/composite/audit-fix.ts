/**
 * Composite Command: /audit-fix [report-path]
 * Governance + tier context + audit report. Prefer auditFixWithPaths so the agent reads paths and fixes directly.
 *
 * auditFixWithPaths: returns { instruction, paths }; agent reads each path then fixes per the instruction (no paste step).
 * auditFix: returns prompt string (for CLI or manual paste).
 * CLI: npx tsx .cursor/commands/audit/atomic/audit-fix-prompt.ts [report-path]
 */

import { auditFixPrompt, getAuditFixContext } from '../atomic/audit-fix-prompt';
import type { AuditFixContext } from '../atomic/audit-fix-prompt';

export type { AuditFixContext };

export interface AuditFixParams {
  /** Optional path to the audit report (e.g. from tier-end message). */
  reportPath?: string;
  /** Feature name for tier context (required for tier refs; scope is explicit per command). */
  featureName?: string;
  /** Tier for tier-appropriate refs (required for tier refs). */
  tier?: 'feature' | 'phase' | 'session' | 'task';
  /** Tier identifier, e.g. session 6.10.1, task 6.9.1.1 (required for tier refs). */
  identifier?: string;
}

/**
 * Direct execution: instruction + repo-relative paths. Agent should read each path, then fix findings per the instruction.
 * Do not output a prompt for the user to paste—read the context and fix directly.
 */
export async function auditFixWithPaths(params: AuditFixParams = {}): Promise<AuditFixContext> {
  return getAuditFixContext({
    reportPath: params.reportPath,
    featureName: params.featureName,
    tier: params.tier,
    identifier: params.identifier,
  });
}

/**
 * Build the audit-fix prompt string (instruction + @ refs). Use for CLI or when manual paste is desired.
 */
export async function auditFix(params: AuditFixParams = {}): Promise<string> {
  return auditFixPrompt({
    reportPath: params.reportPath,
    featureName: params.featureName,
    tier: params.tier,
    identifier: params.identifier,
  });
}
