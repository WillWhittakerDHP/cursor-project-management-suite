/**
 * Shared types for command audit system
 */

export interface AuditIssue {
  severity: 'critical' | 'warning' | 'info' | 'error';
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
  code?: string; // Code snippet or pattern
}

export interface AuditResult {
  check: string;
  status: 'pass' | 'warning' | 'error';
  issues: AuditIssue[];
  recommendations: string[];
  summary?: string;
}

export interface AuditReport {
  timestamp: string;
  summary: {
    totalIssues: number;
    critical: number;
    warnings: number;
    info: number;
    checksRun: number;
    checksPassed: number;
    checksWithWarnings: number;
    checksFailed: number;
  };
  results: AuditResult[];
  recommendations: string[];
}

