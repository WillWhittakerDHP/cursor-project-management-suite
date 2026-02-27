/**
 * Session reopen: thin adapter for runTierReopenWorkflow.
 * Validates session ID and status === 'complete', ensures branch, scope, next action. No guide/log updates.
 */

import { WorkflowId } from '../../../utils/id-utils';
import { SESSION_CONFIG } from '../../configs/session';
import { resolveFeatureName } from '../../../utils/feature-context';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { ensureTierBranch } from '../../../git/shared/tier-branch-manager';
import { deriveSessionDescription } from '../../../planning/utils/resolve-planning-description';
import { tierDown } from '../../../utils/tier-navigation';
import type { TierReopenParams, TierReopenResult, TierReopenWorkflowContext, TierReopenWorkflowHooks } from '../../shared/tier-reopen-workflow';
import { runTierReopenWorkflow } from '../../shared/tier-reopen-workflow';

export async function sessionReopenImpl(
  params: TierReopenParams,
  modeGate: string
): Promise<TierReopenResult> {
  const featureName = await resolveFeatureName();
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  const ctx: TierReopenWorkflowContext = {
    config: SESSION_CONFIG,
    identifier: params.identifier,
    params,
    context,
    output,
    modeGate,
  };

  const hooks: TierReopenWorkflowHooks = {
    validate: async (c): Promise<TierReopenResult | null> => {
      const parsed = WorkflowId.parseSessionId(c.identifier);
      if (!parsed) {
        return {
          success: false,
          output: `Invalid session ID: ${c.identifier}. Expected X.Y.Z.`,
          previousStatus: '',
          newStatus: '',
          modeGate: c.modeGate,
        };
      }
      const currentStatus = await c.config.controlDoc.readStatus(c.context, c.identifier);
      if (currentStatus !== 'complete') {
        return {
          success: false,
          output: `Session ${c.identifier} is not marked complete in phase guide (status: ${currentStatus ?? 'unknown'}). Only completed sessions can be reopened.`,
          previousStatus: currentStatus ?? '',
          newStatus: '',
          modeGate: c.modeGate,
        };
      }
      return null;
    },
    getStatusUpdateMessage: (c) => `✅ Session ${c.identifier} unchecked in phase guide (Reopened)`,
    ensureBranch: async (c): Promise<void> => {
      const tierBranch = c.config.getBranchName(c.context, c.identifier);
      if (tierBranch) {
        const branchResult = await ensureTierBranch(c.config, c.identifier, c.context, { createIfMissing: false });
        if (branchResult.success) {
          c.output.push(`✅ Switched to branch: ${branchResult.finalBranch}`);
        }
      }
    },
    getScope: async (c): Promise<{ id: string; name: string }> => {
      const name = await deriveSessionDescription(c.identifier, c.context);
      return { id: c.identifier, name };
    },
    getNextActionChildTier: () => tierDown('session'),
  };

  return runTierReopenWorkflow(ctx, hooks);
}
