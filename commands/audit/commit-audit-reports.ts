/**
 * Commit emitted audit reports so client/.audit-reports/ (including
 * allowlist-prune-suggestions.json/.md) and optional feature audit dir are committed.
 * Used after tier-start (background-audit-runner) and tier-end (runEndAuditForTier).
 */

import { join } from 'path';
import { gitAdd, gitDiffCached, runGitCommand } from '../git/shared/git-manager';

const CLIENT_AUDIT_REPORTS = 'client/.audit-reports';

export interface CommitAuditReportsOptions {
  /** When set, also stage and include .cursor/project-manager/features/<featureName>/audits in the commit. */
  featureName?: string;
}

/**
 * Stage client/.audit-reports/ (and optionally feature audits dir), then commit if there are changes.
 * Non-fatal: returns on any failure (e.g. not a git repo, nothing to commit).
 */
export async function commitAuditReports(options?: CommitAuditReportsOptions): Promise<void> {
  try {
    await gitAdd(CLIENT_AUDIT_REPORTS);
    if (options?.featureName) {
      const featureAuditsDir = join(
        '.cursor',
        'project-manager',
        'features',
        options.featureName,
        'audits'
      );
      await gitAdd(featureAuditsDir);
    }
    const diffResult = await gitDiffCached();
    if (diffResult.success) return;
    const msg = 'chore(audit): update audit reports';
    const safe = msg.replace(/'/g, "'\\''");
    await runGitCommand(`git commit -m '${safe}'`, 'commitAuditReports');
  } catch (_err) {
    // Non-fatal: e.g. not a git repo, nothing to commit, or commit rejected
  }
}
