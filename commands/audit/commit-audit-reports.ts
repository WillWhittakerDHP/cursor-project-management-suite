/**
 * Commit emitted audit reports so client/.audit-reports/ (including
 * allowlist-prune-suggestions.json/.md) are committed.
 * Used after tier-start (background-audit-runner) and tier-end (runEndAuditForTier).
 *
 * Feature-level audits under .cursor/project-manager/features/<name>/audits
 * live inside the .cursor submodule and must be committed from within that
 * submodule — they cannot be staged from the parent repo.
 */

import { gitAdd, gitDiffCached, runGitCommand } from '../git/shared/git-manager';

const CLIENT_AUDIT_REPORTS = 'client/.audit-reports';

export interface CommitAuditReportsOptions {
  /** Retained for API compatibility; feature audits are inside the .cursor submodule and are not staged here. */
  featureName?: string;
}

/**
 * Stage client/.audit-reports/, then commit if there are changes.
 * Non-fatal: returns on any failure (e.g. not a git repo, nothing to commit).
 */
export async function commitAuditReports(_options?: CommitAuditReportsOptions): Promise<void> {
  try {
    await gitAdd(CLIENT_AUDIT_REPORTS);
    const diffResult = await gitDiffCached();
    if (diffResult.success) return;
    const msg = 'chore(audit): update audit reports';
    const safe = msg.replace(/'/g, "'\\''");
    await runGitCommand(`git commit -m '${safe}'`, 'commitAuditReports');
  } catch (_err) {
    // Non-fatal: e.g. not a git repo, nothing to commit, or commit rejected
  }
}
