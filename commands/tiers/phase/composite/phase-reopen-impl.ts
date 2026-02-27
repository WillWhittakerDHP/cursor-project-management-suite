/**
 * Phase reopen: thin adapter for runTierReopenWorkflow.
 * Validates status === 'complete', updates phase log with reopen entry, ensures branch, scope, next action.
 */

import { PHASE_CONFIG } from '../../configs/phase';
import { resolveFeatureName } from '../../../utils/feature-context';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { ensureTierBranch } from '../../../git/shared/tier-branch-manager';
import { readProjectFile, writeProjectFile } from '../../../utils/utils';
import { derivePhaseDescription } from '../../../planning/utils/resolve-planning-description';
import { tierDown } from '../../../utils/tier-navigation';
import type { TierReopenParams, TierReopenResult, TierReopenWorkflowContext, TierReopenWorkflowHooks } from '../../shared/tier-reopen-workflow';
import { runTierReopenWorkflow } from '../../shared/tier-reopen-workflow';
import { flipCompleteToReopened, formatReopenEntry } from '../../shared/tier-reopen-steps';

export async function phaseReopenImpl(
  params: TierReopenParams,
  modeGate: string
): Promise<TierReopenResult> {
  const featureName = await resolveFeatureName();
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  const ctx: TierReopenWorkflowContext = {
    config: PHASE_CONFIG,
    identifier: params.identifier,
    params,
    context,
    output,
    modeGate,
  };

  const hooks: TierReopenWorkflowHooks = {
    validate: async (c): Promise<TierReopenResult | null> => {
      const currentStatus = await c.config.controlDoc.readStatus(c.context, c.identifier);
      if (currentStatus !== 'complete') {
        return {
          success: false,
          output: `Phase ${c.identifier} is not Complete (status: ${currentStatus ?? 'unknown'}). Only completed phases can be reopened.`,
          previousStatus: currentStatus ?? '',
          newStatus: '',
          modeGate: c.modeGate,
        };
      }
      return null;
    },
    getStatusUpdateMessage: (c) => `✅ Phase ${c.identifier} guide: Status → Reopened`,
    updateGuideAndLog: async (c): Promise<void> => {
      const phaseLogPath = c.context.paths.getPhaseLogPath(c.identifier);
      try {
        let logContent = await readProjectFile(phaseLogPath);
        logContent = flipCompleteToReopened(logContent);
        const reopenEntry = formatReopenEntry(c.params.reason);
        const idx = logContent.indexOf('## Change Requests');
        if (idx !== -1) {
          logContent = logContent.slice(0, idx) + reopenEntry + logContent.slice(idx);
        } else {
          logContent += reopenEntry;
        }
        await writeProjectFile(phaseLogPath, logContent);
        c.output.push(`✅ Phase ${c.identifier} log updated with reopen entry`);
      } catch (err) {
        console.warn('Phase reopen: log update skipped', err);
      }
    },
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
      const name = await derivePhaseDescription(c.identifier, c.context);
      return { id: c.identifier, name };
    },
    getNextActionChildTier: () => tierDown('phase'),
  };

  return runTierReopenWorkflow(ctx, hooks);
}
