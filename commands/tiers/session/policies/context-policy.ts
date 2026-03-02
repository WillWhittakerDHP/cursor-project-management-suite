/**
 * Session-tier context policy. Re-exports shared tier-agnostic context policy
 * with session-specific adapter for backward compatibility.
 * New code should use tiers/shared/context-policy (readTierUpContext, getTierContextSourcePolicy, gatherTierContext).
 */

import { WorkflowCommandContext } from '../../../utils/command-context';
import type { TierStartReadResult } from '../../shared/tier-start-workflow-types';
import {
  readTierUpContext,
  getTierContextSourcePolicy,
  gatherTierContext,
} from '../../shared/context-policy';

export interface SessionContextPolicyGatherParams {
  context: WorkflowCommandContext;
  sessionId: string;
  resolvedDescription: string;
}

export interface SessionContextPolicyReadParams {
  sessionId: string;
  resolvedDescription: string;
}

/** @deprecated Use readTierUpContext from tiers/shared/context-policy with tier: 'session'. */
export const sessionContextPolicy = {
  async readContext(params: SessionContextPolicyReadParams): Promise<TierStartReadResult> {
    const context = await WorkflowCommandContext.getCurrent();
    return readTierUpContext({
      tier: 'session',
      identifier: params.sessionId,
      resolvedDescription: params.resolvedDescription,
      context,
    });
  },

  async gatherContext(params: SessionContextPolicyGatherParams): Promise<string> {
    return gatherTierContext({
      tier: 'session',
      identifier: params.sessionId,
      resolvedDescription: params.resolvedDescription,
      context: params.context,
    });
  },
};
