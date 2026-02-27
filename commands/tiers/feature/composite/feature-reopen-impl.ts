/**
 * Feature reopen: thin adapter for runTierReopenWorkflow.
 * Validates status === 'complete', updates guide/log/handoff, ensures branch, scope, next action.
 */

import { join } from 'path';
import { access } from 'fs/promises';
import { FEATURE_CONFIG } from '../../configs/feature';
import { resolveFeatureId } from '../../../utils/feature-context';
import { WorkflowCommandContext } from '../../../utils/command-context';
import {
  readProjectFile,
  writeProjectFile,
  branchExists,
  runCommand,
  getCurrentBranch,
  PROJECT_ROOT,
} from '../../../utils/utils';
import { deriveFeatureDescription } from '../../../planning/utils/resolve-planning-description';
import { tierDown } from '../../../utils/tier-navigation';
import type { TierReopenParams, TierReopenResult, TierReopenWorkflowContext, TierReopenWorkflowHooks } from '../../shared/tier-reopen-workflow';
import { runTierReopenWorkflow } from '../../shared/tier-reopen-workflow';
import { flipCompleteToReopened, formatReopenEntry } from '../../shared/tier-reopen-steps';

export async function featureReopenImpl(
  params: TierReopenParams,
  modeGate: string
): Promise<TierReopenResult> {
  const featureName = await resolveFeatureId(params.identifier);
  const context = new WorkflowCommandContext(featureName);
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
      try {
        await access(join(PROJECT_ROOT, featureGuidePath));
        let guideContent = await readProjectFile(featureGuidePath);
        guideContent = flipCompleteToReopened(guideContent);
        await writeProjectFile(featureGuidePath, guideContent);
        c.output.push('✅ Feature guide: Status → Reopened');
      } catch (err) {
        console.warn('Feature reopen: guide update skipped', err);
      }
      const featureLogPath = c.context.paths.getFeatureLogPath();
      try {
        let logContent = await readProjectFile(featureLogPath);
        logContent = flipCompleteToReopened(logContent);
        logContent += formatReopenEntry(c.params.reason);
        await writeProjectFile(featureLogPath, logContent);
        c.output.push('✅ Feature log updated with reopen entry');
      } catch (err) {
        console.warn('Feature reopen: log update skipped', err);
      }
      const featureHandoffPath = c.context.paths.getFeatureHandoffPath();
      try {
        let handoffContent = await readProjectFile(featureHandoffPath);
        handoffContent = handoffContent.replace(/(\*\*Feature Status:\*\*)\s*Complete/i, '$1 Reopened');
        await writeProjectFile(featureHandoffPath, handoffContent);
        c.output.push('✅ Feature handoff: Feature Status → Reopened');
      } catch (err) {
        console.warn('Feature reopen: handoff update skipped', err);
      }
    },
    ensureBranch: async (c): Promise<void> => {
      const featureBranch = c.config.getBranchName(c.context, c.context.feature.name);
      if (featureBranch && (await branchExists(featureBranch))) {
        const currentBranch = await getCurrentBranch();
        if (currentBranch !== featureBranch) {
          const checkoutResult = await runCommand(`git checkout ${featureBranch}`);
          if (checkoutResult.success) {
            c.output.push(`✅ Switched to branch: ${featureBranch}`);
          }
        }
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
