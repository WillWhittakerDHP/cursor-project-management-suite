/**
 * Audit System Types
 * 
 * Shared types for all audit commands
 */

export type AuditCategory = 
  | 'comments'
  | 'planning'
  | 'todos'
  | 'security'
  | 'checkpoints'
  | 'tests'
  | 'docs'
  | 'vue-architecture';

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
  summary?: string; // Brief summary of audit results
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
  testResults?: any; // Test results from test-end-workflow
}

