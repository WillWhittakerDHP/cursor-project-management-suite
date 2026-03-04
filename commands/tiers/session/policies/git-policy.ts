/**
 * Session-tier git policy boundary.
 * Branch ensure and merge; preserves step order and parity.
 */

import type { WorkflowCommandContext } from '../../../utils/command-context';
import type { EnsureTierBranchResult } from '../../../git/shared/tier-branch-manager';
import { ensureTierBranch } from '../../../git/shared/tier-branch-manager';
import { updateTierScope, readTierScope, deriveSlugFromGuideTitle } from '../../../utils/tier-scope';
import { readProjectFile } from '../../../utils/utils';
import { SESSION_CONFIG } from '../../configs/session';

export interface SessionGitPolicyEnsureParams {
  context: WorkflowCommandContext;
  sessionId: string;
  resolvedDescription?: string;
}

/** Session git policy: ensure branch and update scope (with slug and branch name). */
export const sessionGitPolicy = {
  async ensureBranch(params: SessionGitPolicyEnsureParams): Promise<EnsureTierBranchResult> {
    const { context, sessionId } = params;
    const scope = await readTierScope();
    const name = params.resolvedDescription ?? sessionId;
    let slug: string | undefined;
    try {
      const guideContent = await readProjectFile(context.paths.getSessionGuidePath(sessionId));
      const firstLine = guideContent.split('\n')[0] ?? '';
      slug = deriveSlugFromGuideTitle(firstLine);
    } catch {
      slug = undefined;
    }
    context.scope = {
      ...scope,
      session: { id: sessionId, name, ...(slug && { slug }) },
    };
    const result = await ensureTierBranch(SESSION_CONFIG, sessionId, context);
    if (result.success && result.finalBranch) {
      await updateTierScope('session', {
        id: sessionId,
        name,
        branch: result.finalBranch,
        ...(slug && { slug }),
      });
    }
    return result;
  },

  async afterBranch(params: { sessionId: string; resolvedDescription: string }): Promise<void> {
    const scope = await readTierScope();
    const entry = scope.session?.id === params.sessionId ? scope.session : { id: params.sessionId, name: params.resolvedDescription };
    await updateTierScope('session', {
      id: entry.id,
      name: entry.name ?? params.resolvedDescription,
      ...(scope.session?.branch && { branch: scope.session.branch }),
      ...(scope.session?.slug && { slug: scope.session.slug }),
    });
  },
};
