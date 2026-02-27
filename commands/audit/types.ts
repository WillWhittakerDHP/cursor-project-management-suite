/**
 * Audit System Types
 * 
 * Shared types for all audit commands
 */

export type AuditCategory =
  | 'security'
  | 'code-quality'
  | 'vue-architecture'
  | 'docs'
  | 'tier-quality';

export type AuditStatus = 'pass' | 'warn' | 'fail';

export type AuditFindingType = 'error' | 'warning' | 'info';

export interface AuditFinding {
  type: AuditFindingType;
  message: string;
  location?: string; // File path, line number, etc.
  suggestion?: string;
}

export interface AuditResult {
  category: AuditCategory;
  status: AuditStatus;
  score?: number; // 0-100
  findings: AuditFinding[];
  recommendations: string[];
  summary: string; // REQUIRED: Brief summary of audit results - must always be provided
}

export type AuditTier = 'session' | 'phase' | 'feature' | 'task';

export interface TierAuditResult {
  tier: AuditTier;
  identifier: string;
  overallStatus: AuditStatus;
  results: AuditResult[];
  timestamp: string;
  reportPath: string;
  featureName: string;
}

export interface AuditParams {
  tier: AuditTier;
  identifier: string;
  featureName?: string;
  modifiedFiles?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  testResults?: any; // Test results from test-end-workflow
}

export type AutofixAction = 'script' | 'agent';

export interface AutofixEntry {
  action: AutofixAction;
  auditName: string;
  finding: AuditFinding;
  /** For script fixes: the npm script or shell command to run */
  command?: string;
  /** For agent fixes: structured instruction for the agent */
  agentDirective?: string;
  /** Files this fix will/did touch */
  affectedFiles: string[];
  /** Whether the fix was successfully applied */
  applied: boolean;
}

export interface AutofixResult {
  tier: AuditTier;
  scriptFixesApplied: number;
  agentFixEntries: AutofixEntry[];
  affectedFiles: string[];
  /** Results from lower-tier re-audits */
  cascadeResults: AutofixResult[];
  summary: string;
}

