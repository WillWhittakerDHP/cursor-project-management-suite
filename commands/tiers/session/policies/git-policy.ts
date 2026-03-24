/**
 * Session-tier git policy boundary.
 * Branch ensure and merge; preserves step order and parity.
 * Scope derived from context (tier + identifier) per command.
 */

import type { WorkflowCommandContext } from '../../../utils/command-context';
import type { EnsureTierBranchResult, EnsureTierBranchOptions } from '../../../git/shared/git-manager';
import { ensureTierBranch } from '../../../git/shared/git-manager';
import { SESSION_CONFIG } from '../../configs/session';

export interface SessionGitPolicyEnsureParams {
  context: WorkflowCommandContext;
  sessionId: string;
  resolvedDescription?: string;
  /** Passed through to ensureTierBranch (e.g. submoduleCursor from tier-start options). */
  ensureOptions?: Pick<EnsureTierBranchOptions, 'submoduleCursor'>;
}

/** Session git policy: ensure branch. */
export const sessionGitPolicy = {
  async ensureBranch(params: SessionGitPolicyEnsureParams): Promise<EnsureTierBranchResult> {
    const { context, sessionId, ensureOptions } = params;
    return ensureTierBranch(SESSION_CONFIG, sessionId, context, ensureOptions);
  },

  async afterBranch(_params: { sessionId: string; resolvedDescription: string }): Promise<void> {
    // Scope from context; no file write
  },
};
