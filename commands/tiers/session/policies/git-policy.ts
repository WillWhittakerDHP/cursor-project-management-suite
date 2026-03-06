/**
 * Session-tier git policy boundary.
 * Branch ensure and merge; preserves step order and parity.
 * Scope derived from context (tier + identifier) per command.
 */

import type { WorkflowCommandContext } from '../../../utils/command-context';
import type { EnsureTierBranchResult } from '../../../git/shared/git-manager';
import { ensureTierBranch } from '../../../git/shared/git-manager';
import { SESSION_CONFIG } from '../../configs/session';

export interface SessionGitPolicyEnsureParams {
  context: WorkflowCommandContext;
  sessionId: string;
  resolvedDescription?: string;
}

/** Session git policy: ensure branch. */
export const sessionGitPolicy = {
  async ensureBranch(params: SessionGitPolicyEnsureParams): Promise<EnsureTierBranchResult> {
    const { context, sessionId } = params;
    return ensureTierBranch(SESSION_CONFIG, sessionId, context);
  },

  async afterBranch(_params: { sessionId: string; resolvedDescription: string }): Promise<void> {
    // Scope from context; no file write
  },
};
