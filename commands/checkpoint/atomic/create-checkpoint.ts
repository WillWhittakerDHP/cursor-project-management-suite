/**
 * Atomic Command: Core checkpoint creation logic
 * Reads status from control docs (no todo).
 *
 * Tier: Cross-tier utility
 * Operates on: Checkpoint creation across all tiers
 */

import { WorkflowCommandContext } from '../../utils/command-context';
import { resolveFeatureName } from '../../utils';
import { WorkflowId } from '../../utils/id-utils';
import { verify } from '../../utils/verify';
import { FEATURE_CONFIG } from '../../tiers/configs/feature';
import { PHASE_CONFIG } from '../../tiers/configs/phase';
import { SESSION_CONFIG } from '../../tiers/configs/session';
import { TASK_CONFIG } from '../../tiers/configs/task';

export type CheckpointTier = 'feature' | 'phase' | 'session' | 'task';

export interface CreateCheckpointParams {
  tier: CheckpointTier;
  identifier?: string;
  featureName?: string;
  runQualityChecks?: boolean;
  notes?: string;
}

export interface CheckpointResult {
  success: boolean;
  output: string;
  qualityChecks?: {
    success: boolean;
    results: {
      lint: { success: boolean; output: string };
      typeCheck: { success: boolean; output: string };
      test?: { success: boolean; output: string };
    };
  };
}

function getConfig(tier: CheckpointTier) {
  switch (tier) {
    case 'feature': return FEATURE_CONFIG;
    case 'phase': return PHASE_CONFIG;
    case 'session': return SESSION_CONFIG;
    case 'task': return TASK_CONFIG;
    default: return null;
  }
}

/**
 * Create checkpoint for any tier (status from control doc)
 *
 * @param params Checkpoint parameters
 * @returns Checkpoint result
 */
export async function createCheckpoint(params: CreateCheckpointParams): Promise<CheckpointResult> {
  const featureName = await resolveFeatureName(params.featureName);
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];

  if ((params.tier === 'phase' || params.tier === 'session' || params.tier === 'task') && !params.identifier) {
    return {
      success: false,
      output: `Error: ${params.tier} identifier is required for ${params.tier} checkpoints`
    };
  }

  if (params.tier === 'session' && params.identifier && !WorkflowId.isValidSessionId(params.identifier)) {
    return {
      success: false,
      output: `Error: Invalid session ID format. Expected X.Y.Z (e.g., 4.1.3)\nAttempted: ${params.identifier}`
    };
  }

  if (params.tier === 'task' && params.identifier && !WorkflowId.isValidTaskId(params.identifier)) {
    return {
      success: false,
      output: `Error: Invalid task ID format. Expected X.Y.Z.A (e.g., 4.1.3.1)\nAttempted: ${params.identifier}`
    };
  }

  let qualityChecks: CheckpointResult['qualityChecks'] | undefined;
  if (params.runQualityChecks) {
    try {
      const verifyResult = await verify('vue', false);
      qualityChecks = {
        success: verifyResult.success,
        results: verifyResult.results
      };
      if (!verifyResult.success) {
        output.push('⚠️ **Quality checks failed**\n');
        output.push('Fix errors before continuing.\n\n');
      } else {
        output.push('✅ **Quality checks passed**\n\n');
      }
    } catch (_error) {
      output.push(`⚠️ **Quality checks error:** ${_error instanceof Error ? _error.message : String(_error)}\n\n`);
    }
  }

  const config = getConfig(params.tier);
  const id = params.tier === 'feature' ? context.paths.getFeatureName() : params.identifier!;
  const title = params.tier === 'feature' ? `Feature: ${featureName}` :
    params.tier === 'phase' ? `Phase ${id}` :
    params.tier === 'session' ? `Session ${id}` : `Task ${id}`;

  try {
    const status = config ? await config.controlDoc.readStatus(context, id) : null;
    output.push(`# ${title} Checkpoint\n`);
    output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n`);
    output.push(`**Status:** ${status ?? 'unknown'}\n`);
    if (params.notes) output.push(`**Notes:** ${params.notes}\n`);
    output.push('\n---\n');
  } catch (_error) {
    output.push(`# ${title} Checkpoint\n`);
    output.push(`**WARNING: Could not read control doc**\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('\n---\n');
  }

  return {
    success: true,
    output: output.join('\n'),
    qualityChecks
  };
}
