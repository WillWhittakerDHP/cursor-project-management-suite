/**
 * Commit emitted audit reports so client/.audit-reports/ (including
 * allowlist-prune-suggestions.json/.md) and optional feature audit dir are committed.
 * Used after tier-start (background-audit-runner) and tier-end (runEndAuditForTier).
 */

import { execSync } from 'child_process';
import { join } from 'path';
import { PROJECT_ROOT } from '../utils/utils';

const CLIENT_AUDIT_REPORTS = 'client/.audit-reports';

export interface CommitAuditReportsOptions {
  /** When set, also stage and include .cursor/project-manager/features/<featureName>/audits in the commit. */
  featureName?: string;
}

/**
 * Stage client/.audit-reports/ (and optionally feature audits dir), then commit if there are changes.
 * Non-fatal: returns on any failure (e.g. not a git repo, nothing to commit).
 */
export function commitAuditReports(options?: CommitAuditReportsOptions): void {
  try {
    execSync(`git add ${CLIENT_AUDIT_REPORTS}`, {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
    });
    if (options?.featureName) {
      const featureAuditsDir = join(
        '.cursor',
        'project-manager',
        'features',
        options.featureName,
        'audits'
      );
      execSync(`git add ${featureAuditsDir}`, {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
      });
    }
    try {
      execSync('git diff --cached --quiet', { cwd: PROJECT_ROOT, stdio: 'pipe' });
      return;
    } catch {
      // diff --quiet exits 1 when there are changes; proceed to commit
    }
    execSync('git commit -m "chore(audit): update audit reports"', {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
    });
  } catch (_err) {
    // Non-fatal: e.g. not a git repo, nothing to commit, or commit rejected
  }
}
