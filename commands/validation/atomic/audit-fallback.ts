/**
 * Atomic Command: Audit Fallback
 * Checks for defaults, silent fallbacks, and legacy/backwards compatibility patterns
 * in session-tier command files that should be removed for dynamic/config-driven,
 * explicit failures, and fresh code.
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';
import { AuditResult, AuditIssue } from './audit-types';

const SESSION_TIER_PATH = join(PROJECT_ROOT, '.cursor/commands/tiers/session');

// Keywords to scan for
const KEYWORD_PATTERNS = [
  { keyword: 'default', label: 'Default values' },
  { keyword: 'fallback', label: 'Fallback patterns' },
  { keyword: 'legacy', label: 'Legacy code' },
  { keyword: 'compat', label: 'Backwards compatibility' },
  { keyword: 'deprecated', label: 'Deprecated code' },
  { keyword: 'silent', label: 'Silent failures' },
  { keyword: 'ignore', label: 'Error ignoring' },
] as const;

// Patterns that indicate problematic code
const PROBLEMATIC_PATTERNS = [
  { pattern: /\?\?\s*['"`]/, label: 'Nullish coalescing with default string', severity: 'warning' as const },
  { pattern: /\|\|\s*['"`]/, label: 'Logical OR with default string', severity: 'warning' as const },
  { pattern: /catch\s*\([^)]*\)\s*\{[^}]*\}/, label: 'Empty catch block', severity: 'critical' as const },
  { pattern: /catch\s*\([^)]*\)\s*\{[^}]*\/\/.*\}/, label: 'Catch block with only comment', severity: 'critical' as const },
  { pattern: /try\s*\{[^}]*\}\s*catch[^}]*\{\s*\}/, label: 'Silent catch block', severity: 'critical' as const },
  { pattern: /@ts-ignore|@ts-expect-error/, label: 'Type suppression', severity: 'warning' as const },
  { pattern: /eslint-disable/, label: 'ESLint suppression', severity: 'warning' as const },
] as const;

/**
 * Scan a file for keyword patterns and problematic code
 */
async function scanFile(filePath: string): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const repoPath = filePath.replace(PROJECT_ROOT + '/', '');
    
    // Scan for keywords
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      
      // Check keyword patterns (case-insensitive)
      for (const { keyword, label } of KEYWORD_PATTERNS) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(line)) {
          // Skip comments and strings to reduce false positives
          const trimmed = line.trim();
          if (!trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')) {
            issues.push({
              severity: 'warning',
              message: `Found "${label}" keyword: ${keyword}`,
              file: repoPath,
              line: lineNumber,
              code: trimmed.length > 100 ? trimmed.substring(0, 100) + '...' : trimmed,
              suggestion: `Review for removal - prefer dynamic/config-driven approach or explicit failures`,
            });
          }
        }
      }
      
      // Check problematic patterns
      const trimmed = line.trim();
      for (const { pattern, label, severity } of PROBLEMATIC_PATTERNS) {
        if (pattern.test(line)) {
          issues.push({
            severity,
            message: `Found ${label}`,
            file: repoPath,
            line: lineNumber,
            code: trimmed.length > 100 ? trimmed.substring(0, 100) + '...' : trimmed,
            suggestion: severity === 'critical' 
              ? 'Replace with explicit error handling - silent failures hide bugs'
              : 'Review for removal - prefer explicit error handling or type safety',
          });
        }
      }
    }
  } catch (_error) {
    issues.push({
      severity: 'critical',
      message: `Failed to scan file: ${_error instanceof Error ? _error.message : String(_error)}`,
      file: filePath.replace(PROJECT_ROOT + '/', ''),
    });
  }
  
  return issues;
}

/**
 * Recursively list all TypeScript files in a directory
 */
async function listTypeScriptFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        files.push(...await listTypeScriptFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  } catch (_error) {
    // Directory might not exist or be inaccessible
  }
  
  return files;
}

/**
 * Audit session-tier command files for fallback/legacy patterns
 */
export async function auditFallback(): Promise<AuditResult> {
  const issues: AuditIssue[] = [];
  const recommendations: string[] = [];
  
  try {
    // List all TypeScript files in session tier directory
    const files = await listTypeScriptFiles(SESSION_TIER_PATH);
    
    if (files.length === 0) {
      issues.push({
        severity: 'info',
        message: 'No TypeScript files found in session tier directory',
        file: SESSION_TIER_PATH.replace(PROJECT_ROOT + '/', ''),
      });
    }
    
    // Scan each file
    for (const file of files) {
      const fileIssues = await scanFile(file);
      issues.push(...fileIssues);
    }
    
    // Generate recommendations based on findings
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    
    if (criticalCount > 0) {
      recommendations.push(
        `Found ${criticalCount} critical issue(s) - silent failures should be replaced with explicit error handling`
      );
    }
    
    if (warningCount > 0) {
      recommendations.push(
        `Found ${warningCount} warning(s) - review defaults/fallbacks for removal in favor of dynamic/config-driven approaches`
      );
    }
    
    if (issues.length === 0) {
      recommendations.push('No fallback/legacy patterns found - session-tier commands are clean');
    }
    
  } catch (_error) {
    issues.push({
      severity: 'critical',
      message: `Failed to audit session-tier files: ${_error instanceof Error ? _error.message : String(_error)}`,
      file: SESSION_TIER_PATH.replace(PROJECT_ROOT + '/', ''),
    });
  }
  
  // Determine status
  const hasCritical = issues.some(i => i.severity === 'critical');
  const hasWarnings = issues.some(i => i.severity === 'warning');
  
  let status: 'pass' | 'warning' | 'error' = 'pass';
  if (hasCritical) {
    status = 'error';
  } else if (hasWarnings) {
    status = 'warning';
  }
  
  return {
    check: 'Fallback',
    status,
    issues,
    recommendations,
    summary: `Scanned ${await listTypeScriptFiles(SESSION_TIER_PATH).then(f => f.length)} file(s) in session tier. Found ${issues.length} issue(s): ${issues.filter(i => i.severity === 'critical').length} critical, ${issues.filter(i => i.severity === 'warning').length} warnings`,
  };
}
