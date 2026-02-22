/**
 * Feature tier composite: all feature-level commands (start, end, plan, change).
 */

import { runTierStart } from '../../shared/tier-start';
import { runTierEnd } from '../../shared/tier-end';
import { runTierPlan } from '../../shared/tier-plan';
import { runTierReopen } from '../../shared/tier-reopen';
import { FEATURE_CONFIG } from '../../configs/feature';
import type { CommandExecutionOptions } from '../../../utils/command-execution-mode';
import type { FeatureEndParams, FeatureEndResult } from './feature-end-impl';
import { readProjectFile, writeProjectFile, PROJECT_ROOT } from '../../../utils/utils';
import { join } from 'path';
import { access } from 'fs/promises';
import { featureCheckpoint } from '../atomic/feature-checkpoint';
import { spawn } from 'child_process';
import { WorkflowCommandContext } from '../../../utils/command-context';

export type { FeatureEndParams, FeatureEndResult };

export async function featureStart(
  featureId: string,
  options?: CommandExecutionOptions
): Promise<string> {
  return runTierStart(FEATURE_CONFIG, { featureId }, options);
}

export async function featureEnd(params: FeatureEndParams): Promise<FeatureEndResult> {
  return runTierEnd(FEATURE_CONFIG, params) as Promise<FeatureEndResult>;
}

export async function planFeature(featureId: string, description?: string): Promise<string> {
  return runTierPlan(FEATURE_CONFIG, featureId, description);
}

export async function featureReopen(featureId: string, reason?: string) {
  return runTierReopen(FEATURE_CONFIG, { identifier: featureId, reason });
}

/**
 * Feature-change: document feature pivot and create checkpoint.
 */
export async function featureChange(featureName: string, newFeatureName: string, reason: string): Promise<string> {
  spawn('npm', ['run', 'server:refresh'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true,
  }).unref();

  const output: string[] = [];
  output.push(`# Feature Change: ${featureName} → ${newFeatureName}\n`);
  output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n`);
  output.push(`**Reason:** ${reason}\n\n`);
  output.push('---\n\n');

  output.push('## Step 1: Documenting Current Feature State\n\n');
  try {
    const context = new WorkflowCommandContext(featureName);
    const featureLogPath = context.paths.getFeatureLogPath();
    await access(join(PROJECT_ROOT, featureLogPath));
    const logContent = await readProjectFile(featureLogPath);
    const changeEntry = `## Feature Changes\n\n### Feature Change ${new Date().toISOString().split('T')[0]}\n**From:** ${featureName}\n**To:** ${newFeatureName}\n**Reason:** ${reason}\n**Impact:** [How this affects phases/sessions]\n\n---\n\n`;
    const nextStepsIndex = logContent.indexOf('## Next Steps');
    const updatedLogContent = nextStepsIndex !== -1
      ? logContent.slice(0, nextStepsIndex) + changeEntry + logContent.slice(nextStepsIndex)
      : logContent + changeEntry;
    await writeProjectFile(featureLogPath, updatedLogContent);
    output.push(`**Log Updated:** ${featureLogPath}\n`);
  } catch (_error) {
    output.push(`**WARNING:** Could not update feature log\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
  }

  output.push('\n## Step 2: Creating Feature Change Document\n\n');
  try {
    const context = new WorkflowCommandContext(featureName);
    const newContext = new WorkflowCommandContext(newFeatureName);
    const changeDocPath = `${context.paths.getBasePath()}/feature-${featureName}-to-${newFeatureName}-change.md`;
    const changeDocContent = `# Feature Change: ${featureName} → ${newFeatureName}\n\n**Date:** ${new Date().toISOString().split('T')[0]}\n**Reason:** ${reason}\n\n## Context\n\n[Current feature state and reason for change]\n\n## Transition Plan\n\n[How to transition from old feature to new feature]\n\n## Impact Assessment\n\n[Code, documentation, and testing impacts]\n\n## Risk Mitigation\n\n[Potential risks and mitigation strategies]\n\n## Timeline\n\n[Estimated duration and milestones]\n\n---\n\n## Related Documents\n\n- Feature Guide: \`${context.paths.getFeatureGuidePath()}\`\n- Feature Log: \`${context.paths.getFeatureLogPath()}\`\n- New Feature Guide: \`${newContext.paths.getFeatureGuidePath()}\`\n`;
    await writeProjectFile(changeDocPath, changeDocContent);
    output.push(`**Change Document Created:** ${changeDocPath}\n`);
  } catch (_error) {
    output.push(`**ERROR:** Failed to create change document\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
  }

  output.push('\n## Step 3: Creating Checkpoint\n\n');
  try {
    const checkpointOutput = await featureCheckpoint(featureName);
    output.push(checkpointOutput);
  } catch (_error) {
    output.push(`**WARNING:** Failed to create checkpoint\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
  }

  output.push('\n---\n\n');
  output.push('## Next Steps\n\n');
  output.push('1. Review feature change document\n');
  output.push('2. Update feature guide with change details\n');
  output.push('3. If name changed, create new feature structure: `/plan-feature [new-name] [description]`\n');
  output.push('4. Continue work on updated feature\n');
  return output.join('\n');
}
