/**
 * Shared helper to commit autofix changes after a tier-end audit.
 * Used by all tier-end runGit steps so impls stay thin.
 */

import type { AuditTier, AutofixResult } from '../types';
import { gitCommit } from '../../git/atomic/commit';
import { runCommand } from '../../utils/utils';

function formatCommitMessage(tier: AuditTier, identifier: string): string {
  const label = tier.charAt(0).toUpperCase() + tier.slice(1);
  return `${label} ${identifier}: Fix audit issues`;
}

export interface CommitAutofixOptions {
  skipGit?: boolean;
}

/**
 * If autofix produced changes (script fixes or agent directives with affected files),
 * check for uncommitted changes and commit them with a tier-scoped message.
 */
export async function commitAutofixChanges(
  tier: AuditTier,
  identifier: string,
  autofixResult: AutofixResult,
  options?: CommitAutofixOptions
): Promise<{ success: boolean; output: string }> {
  if (options?.skipGit) {
    return {
      success: true,
      output: 'Skipped (skipGit=true)',
    };
  }

  const hasFixes =
    autofixResult.scriptFixesApplied > 0 ||
    autofixResult.agentFixEntries.length > 0 ||
    autofixResult.affectedFiles.length > 0;

  if (!hasFixes) {
    return {
      success: true,
      output: 'No audit fixes to commit (no changes from autofix)',
    };
  }

  try {
    const statusResult = await runCommand('git status --porcelain');
    const hasUncommittedChanges =
      statusResult.success && statusResult.output.trim().length > 0;

    if (!hasUncommittedChanges) {
      return {
        success: true,
        output: 'No audit fixes to commit (no uncommitted changes)',
      };
    }

    const message = formatCommitMessage(tier, identifier);
    const result = await gitCommit(message);

    if (result.success) {
      return {
        success: true,
        output: `Audit fixes committed: ${message}`,
      };
    }

    return {
      success: false,
      output: `Failed to commit audit fixes: ${result.output}. You may need to commit manually.`,
    };
  } catch (err) {
    return {
      success: false,
      output: `Audit fix commit failed (non-critical): ${err instanceof Error ? err.message : String(err)}. You can commit manually later.`,
    };
  }
}
