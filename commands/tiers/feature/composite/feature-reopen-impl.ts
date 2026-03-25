/**
 * Feature reopen: thin adapter for runTierReopenWorkflow.
 * Validates status === 'complete', updates guide/log/handoff, ensures branch, scope, next action.
 */

import { FEATURE_CONFIG } from '../../configs/feature';
import type { WorkflowCommandContext } from '../../../utils/command-context';
import { readProjectFile, writeProjectFile } from '../../../utils/utils';
import { ensureTierBranch } from '../../../git/shared/git-manager';
import { deriveFeatureDescription } from '../../../planning/utils/resolve-planning-description';
import { tierDown } from '../../../utils/tier-navigation';
import type {
  TierReopenParams,
  TierReopenResult,
  TierReopenWorkflowContext,
  TierReopenWorkflowHooks,
} from '../../shared/tier-reopen-workflow';
import { runTierReopenWorkflow } from '../../shared/tier-reopen-workflow';
import { flipCompleteToReopened, formatReopenEntry } from '../../shared/tier-reopen-steps';

export async function featureReopenImpl(
  params: TierReopenParams,
  modeGate: string,
  context: WorkflowCommandContext
): Promise<TierReopenResult> {
  const output: string[] = [];
  const ctx: TierReopenWorkflowContext = {
    config: FEATURE_CONFIG,
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
          output: `Feature is not Complete (status: ${currentStatus ?? 'unknown'}). Only completed features can be reopened.`,
          previousStatus: currentStatus ?? '',
          newStatus: '',
          modeGate: c.modeGate,
        };
      }
      return null;
    },
    getStatusUpdateMessage: () => '✅ Feature PROJECT_PLAN: Status → Reopened',
    updateGuideAndLog: async (c): Promise<void> => {
      const featureGuidePath = c.context.paths.getFeatureGuidePath();
      if (!(await c.context.documents.guideExists('feature'))) {
        throw new Error(
          `Feature reopen: feature guide missing at ${featureGuidePath}. Restore or create the guide before reopening.`
        );
      }
      await c.context.documents.updateGuide(
        'feature',
        undefined,
        (guideContent) => flipCompleteToReopened(guideContent),
        { overwriteForTierEnd: true }
      );
      c.output.push('✅ Feature guide: Status → Reopened');
      const featureLogPath = c.context.paths.getFeatureLogPath();
      try {
        let logContent = await readProjectFile(featureLogPath);
        logContent = flipCompleteToReopened(logContent);
        logContent += formatReopenEntry(c.params.reason);
        await writeProjectFile(featureLogPath, logContent);
        c.output.push('✅ Feature log updated with reopen entry');
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.warn('[feature-reopen] log update skipped:', detail);
      }
      const featureHandoffPath = c.context.paths.getFeatureHandoffPath();
      try {
        let handoffContent = await readProjectFile(featureHandoffPath);
        handoffContent = handoffContent.replace(/(\*\*Feature Status:\*\*)\s*Complete/i, '$1 Reopened');
        await writeProjectFile(featureHandoffPath, handoffContent);
        c.output.push('✅ Feature handoff: Feature Status → Reopened');
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.warn('[feature-reopen] handoff update skipped:', detail);
      }
    },
    ensureBranch: async (c): Promise<void> => {
      const branchResult = await ensureTierBranch(FEATURE_CONFIG, c.identifier, c.context, {
        createIfMissing: false,
      });
      if (branchResult.success && branchResult.finalBranch) {
        c.output.push(`✅ Switched to branch: ${branchResult.finalBranch}`);
      }
    },
    getScope: async (c): Promise<{ id: string; name: string }> => {
      const name = await deriveFeatureDescription(c.context.feature.name, c.context);
      return { id: c.context.feature.name, name };
    },
    getNextActionChildTier: () => tierDown('feature'),
  };

  return runTierReopenWorkflow(ctx, hooks);
}
