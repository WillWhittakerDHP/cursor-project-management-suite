/**
 * Phase checkpoint implementation. Used by tier-checkpoint and by phase-checkpoint (thin wrapper).
 * Reads session progress from phase guide checkboxes (checked = complete, unchecked = not complete).
 */

import { getCurrentDate } from '../../../utils/utils';
import { readProjectFile } from '../../../utils/utils';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { resolveFeatureName } from '../../../utils';

export async function phaseCheckpointImpl(
  phase: string,
  featureName?: string
): Promise<string> {
  const resolved = await resolveFeatureName(featureName);
  const context = new WorkflowCommandContext(resolved);
  const output: string[] = [];

  output.push(`# Phase ${phase} Checkpoint\n`);
  output.push(`**Date:** ${getCurrentDate()}\n`);
  output.push('---\n');

  try {
    const phaseGuidePath = context.paths.getPhaseGuidePath(phase);
    const guideContent = await readProjectFile(phaseGuidePath);

    const phaseStatus = await (await import('../../configs/phase')).PHASE_CONFIG.controlDoc.readStatus(context, phase);
    output.push('## Phase Status\n');
    output.push(`**Status:** ${phaseStatus ?? 'unknown'}\n`);
    output.push('\n---\n');

    const checkedSessions = (guideContent.match(/- \[x\].*?Session [\d.]+/gi) ?? []).length;
    const uncheckedSessions = (guideContent.match(/- \[ \].*?Session [\d.]+/gi) ?? []).length;
    const total = checkedSessions + uncheckedSessions;

    output.push('## Phase Progress (from phase guide)\n');
    output.push(`**Sessions completed:** ${checkedSessions}/${total > 0 ? total : '?'}\n`);
    output.push('\n---\n');
  } catch (_error) {
    output.push('## Phase Status\n');
    output.push(`**WARNING: Could not read phase guide**\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('\n---\n');
  }

  output.push('## Phase Progress Review\n');
  output.push('**Review:**\n');
  output.push('- Sessions completed in this phase\n');
  output.push('- Blockers or issues encountered\n');
  output.push('- Decisions made that affect downstream phases\n');
  output.push('- Next sessions to work on\n');

  return output.join('\n');
}
