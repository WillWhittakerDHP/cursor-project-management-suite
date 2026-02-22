/**
 * Shared tier reopen: flips a completed tier back to Reopened so additional child work can be added.
 * Dispatches to tier-specific logic for phase, feature, session.
 * AskQuestion for plan file is playbook-level; this impl performs status flip, branch ensure, log entry.
 */

import type { TierConfig } from './types';
import type { TierName } from './types';
import {
  modeGateText,
  cursorModeForExecution,
} from '../../utils/command-execution-mode';
import { tierDown } from '../../utils/tier-navigation';
import { resolveFeatureName, resolveFeatureId } from '../../utils/feature-context';
import { WorkflowCommandContext } from '../../utils/command-context';
import { readProjectFile, writeProjectFile, getCurrentBranch, runCommand, branchExists, getCurrentDate } from '../../utils/utils';
import { join } from 'path';
import { access } from 'fs/promises';
import { PROJECT_ROOT } from '../../utils/utils';

export interface TierReopenParams {
  identifier: string;
  reason?: string;
}

export interface TierReopenResult {
  success: boolean;
  output: string;
  previousStatus: string;
  newStatus: string;
  modeGate: string;
  planContent?: string;
  planFilePath?: string;
}

const COMPLETE_PATTERN = /(\*\*Status:\*\*)\s*Complete/i;
const MODE_STEP_SEPARATOR = '\n\n---\n\n';

function flipCompleteToReopened(content: string): string {
  return content.replace(COMPLETE_PATTERN, '$1 Reopened');
}

export async function runTierReopen(
  config: TierConfig,
  params: TierReopenParams
): Promise<TierReopenResult> {
  const gate = modeGateText(cursorModeForExecution('execute'), `${config.name}-reopen`);
  const output: string[] = [];
  const featureName = config.name === 'feature'
    ? await resolveFeatureId(params.identifier)
    : await resolveFeatureName();
  const context = new WorkflowCommandContext(featureName);
  const id = params.identifier;

  const appendNextAction = (childTier: TierName | null): void => {
    if (childTier) {
      output.push(`\n**Next:** Use AskQuestion: "Is there a plan to build this tier around?" If yes, use \`@your.plan.md\`. Then run \`/plan-${childTier} <id>\` to plan new ${childTier}(s), or \`/${childTier}-start <id>\` to start.`);
    } else {
      output.push(`\n**Next:** Make your changes and run the appropriate tier-end when done.`);
    }
  };

  try {
    switch (config.name) {
      case 'phase': {
        const currentStatus = await config.controlDoc.readStatus(context, id);
        if (currentStatus !== 'complete') {
          return {
            success: false,
            output: `Phase ${id} is not Complete (status: ${currentStatus ?? 'unknown'}). Only completed phases can be reopened.`,
            previousStatus: currentStatus ?? '',
            newStatus: '',
            modeGate: gate,
          };
        }
        await config.controlDoc.writeStatus(context, id, 'reopened');
        output.push(`✅ Phase ${id} guide: Status → Reopened`);

        const phaseLogPath = context.paths.getPhaseLogPath(id);
        try {
          let logContent = await readProjectFile(phaseLogPath);
          logContent = flipCompleteToReopened(logContent);
          const reopenEntry = `\n\n## Reopen - ${getCurrentDate()}\n**Reason:** ${params.reason ?? 'Additional work needed'}\n**Status:** Reopened\n`;
          const idx = logContent.indexOf('## Change Requests');
          if (idx !== -1) {
            logContent = logContent.slice(0, idx) + reopenEntry + logContent.slice(idx);
          } else {
            logContent += reopenEntry;
          }
          await writeProjectFile(phaseLogPath, logContent);
          output.push(`✅ Phase ${id} log updated with reopen entry`);
        } catch (err) {
          console.warn('Phase reopen: log update skipped', err);
        }

        const phaseBranchName = `${context.feature.name}-phase-${id}`;
        if (await branchExists(phaseBranchName)) {
          const currentBranch = await getCurrentBranch();
          if (currentBranch !== phaseBranchName) {
            const checkoutResult = await runCommand(`git checkout ${phaseBranchName}`);
            if (checkoutResult.success) {
              output.push(`✅ Switched to branch: ${phaseBranchName}`);
            }
          }
        }
        output.push(`\n**Phase ${id} reopened.**`);
        appendNextAction(tierDown('phase'));
        return {
          success: true,
          output: gate + MODE_STEP_SEPARATOR + output.join('\n'),
          previousStatus: 'Complete',
          newStatus: 'Reopened',
          modeGate: gate,
        };
      }

      case 'feature': {
        const currentStatus = await config.controlDoc.readStatus(context, id);
        if (currentStatus !== 'complete') {
          return {
            success: false,
            output: `Feature is not Complete (status: ${currentStatus ?? 'unknown'}). Only completed features can be reopened.`,
            previousStatus: currentStatus ?? '',
            newStatus: '',
            modeGate: gate,
          };
        }
        await config.controlDoc.writeStatus(context, id, 'reopened');
        output.push(`✅ Feature PROJECT_PLAN: Status → Reopened`);

        const featureGuidePath = context.paths.getFeatureGuidePath();
        try {
          await access(join(PROJECT_ROOT, featureGuidePath));
          let guideContent = await readProjectFile(featureGuidePath);
          guideContent = flipCompleteToReopened(guideContent);
          await writeProjectFile(featureGuidePath, guideContent);
          output.push(`✅ Feature guide: Status → Reopened`);
        } catch (err) {
          console.warn('Feature reopen: guide update skipped', err);
        }

        const featureLogPath = context.paths.getFeatureLogPath();
        try {
          let logContent = await readProjectFile(featureLogPath);
          logContent = flipCompleteToReopened(logContent);
          logContent += `\n\n## Reopen - ${getCurrentDate()}\n**Reason:** ${params.reason ?? 'Additional work needed'}\n**Status:** Reopened\n`;
          await writeProjectFile(featureLogPath, logContent);
          output.push(`✅ Feature log updated with reopen entry`);
        } catch (err) {
          console.warn('Feature reopen: log update skipped', err);
        }

        const featureHandoffPath = context.paths.getFeatureHandoffPath();
        try {
          let handoffContent = await readProjectFile(featureHandoffPath);
          handoffContent = handoffContent.replace(/(\*\*Feature Status:\*\*)\s*Complete/i, '$1 Reopened');
          await writeProjectFile(featureHandoffPath, handoffContent);
          output.push(`✅ Feature handoff: Feature Status → Reopened`);
        } catch (err) {
          console.warn('Feature reopen: handoff update skipped', err);
        }

        const featureBranch = config.getBranchName(context, context.feature.name);
        if (featureBranch && (await branchExists(featureBranch))) {
          const currentBranch = await getCurrentBranch();
          if (currentBranch !== featureBranch) {
            const checkoutResult = await runCommand(`git checkout ${featureBranch}`);
            if (checkoutResult.success) {
              output.push(`✅ Switched to branch: ${featureBranch}`);
            }
          }
        }
        output.push(`\n**Feature reopened.**`);
        appendNextAction(tierDown('feature'));
        return {
          success: true,
          output: gate + MODE_STEP_SEPARATOR + output.join('\n'),
          previousStatus: 'Complete',
          newStatus: 'Reopened',
          modeGate: gate,
        };
      }

      case 'session': {
        const { WorkflowId } = await import('../../utils/id-utils');
        const parsed = WorkflowId.parseSessionId(id);
        if (!parsed) {
          return {
            success: false,
            output: `Invalid session ID: ${id}. Expected X.Y.Z.`,
            previousStatus: '',
            newStatus: '',
            modeGate: gate,
          };
        }
        const currentStatus = await config.controlDoc.readStatus(context, id);
        if (currentStatus !== 'complete') {
          return {
            success: false,
            output: `Session ${id} is not marked complete in phase guide (status: ${currentStatus ?? 'unknown'}). Only completed sessions can be reopened.`,
            previousStatus: currentStatus ?? '',
            newStatus: '',
            modeGate: gate,
          };
        }
        await config.controlDoc.writeStatus(context, id, 'reopened');
        output.push(`✅ Session ${id} unchecked in phase guide (Reopened)`);

        const phaseBranchName = config.getParentBranchName(context, id);
        if (phaseBranchName && (await branchExists(phaseBranchName))) {
          const currentBranch = await getCurrentBranch();
          if (currentBranch !== phaseBranchName) {
            const checkoutResult = await runCommand(`git checkout ${phaseBranchName}`);
            if (checkoutResult.success) {
              output.push(`✅ Switched to branch: ${phaseBranchName}`);
            }
          }
        }
        output.push(`\n**Session ${id} reopened.**`);
        appendNextAction(tierDown('session'));
        return {
          success: true,
          output: gate + MODE_STEP_SEPARATOR + output.join('\n'),
          previousStatus: 'Complete',
          newStatus: 'Reopened',
          modeGate: gate,
        };
      }

      case 'task':
        return {
          success: false,
          output: 'Task reopen is not supported. Reopen the session to add or change tasks.',
          previousStatus: '',
          newStatus: '',
          modeGate: gate,
        };

      default:
        return {
          success: false,
          output: `Unknown tier: ${config.name}`,
          previousStatus: '',
          newStatus: '',
          modeGate: gate,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: gate + MODE_STEP_SEPARATOR + `Reopen failed: ${message}`,
      previousStatus: '',
      newStatus: '',
      modeGate: gate,
    };
  }
}
