/**
 * Session-tier git policy boundary.
 * Branch ensure and merge; preserves step order and parity.
 */

import type { WorkflowCommandContext } from '../../../utils/command-context';
import type { EnsureTierBranchResult } from '../../../git/shared/tier-branch-manager';
import { ensureTierBranch } from '../../../git/shared/tier-branch-manager';
import { updateTierScope } from '../../../utils/tier-scope';
import { SESSION_CONFIG } from '../../configs/session';

export interface SessionGitPolicyEnsureParams {
  context: WorkflowCommandContext;
  sessionId: string;
}

/** Session git policy: ensure branch and update scope. */
export const sessionGitPolicy = {
  async ensureBranch(params: SessionGitPolicyEnsureParams): Promise<EnsureTierBranchResult> {
    return ensureTierBranch(SESSION_CONFIG, params.sessionId, params.context);
  },

  async afterBranch(params: { sessionId: string; resolvedDescription: string }): Promise<void> {
    await updateTierScope('session', { id: params.sessionId, name: params.resolvedDescription });
  },
};
