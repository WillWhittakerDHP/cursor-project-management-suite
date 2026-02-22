/**
 * Atomic Command: /feature-checkpoint [name]
 * Create checkpoint in current feature (writes to feature log only).
 *
 * Tier: Feature (Tier 0 - Highest Level)
 * Operates on: Feature-level workflow (records feature state, updates feature log)
 *
 * @param featureName Feature name (e.g. from .current-feature or git branch)
 */

import { WorkflowCommandContext } from '../../../utils/command-context';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function featureCheckpoint(featureName: string): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];

  const checkpointDate = new Date().toISOString().split('T')[0];

  output.push(`# Feature ${featureName} Checkpoint\n`);
  output.push(`**Date:** ${checkpointDate}\n`);
  output.push('---\n');

  try {
    let logContent = '';
    try {
      logContent = await context.readFeatureLog();
    } catch (err) {
      console.warn('Feature checkpoint: feature log not found, creating default content', featureName, err);
      logContent = `# Feature ${featureName} Log\n\n**Purpose:** Track feature-level progress, decisions, and blockers\n\n**Tier:** Feature (Tier 0 - Highest Level)\n\n---\n\n## Feature Status\n\n**Feature:** ${featureName}\n**Status:** In Progress\n**Started:** ${checkpointDate}\n\n---\n\n`;
    }

    const checkpointEntry = `## Feature Checkpoints\n\n### Checkpoint ${checkpointDate}\n**Status:** [On track / Behind / Ahead]\n**Notes:** [Checkpoint notes]\n**Git Branch:** \`feature/${featureName}\`\n**Git Commit:** [Commit hash]\n\n---\n\n`;

    const nextStepsIndex = logContent.indexOf('## Next Steps');
    if (nextStepsIndex !== -1) {
      logContent = logContent.slice(0, nextStepsIndex) + checkpointEntry + logContent.slice(nextStepsIndex);
    } else {
      logContent += checkpointEntry;
    }

    const PROJECT_ROOT = process.cwd();
    const logPath = context.paths.getFeatureLogPath();
    await writeFile(join(PROJECT_ROOT, logPath), logContent, 'utf-8');
    context.cache.invalidate(logPath);

    output.push(`**Log Updated:** ${context.paths.getFeatureLogPath()}\n`);
  } catch (_error) {
    output.push(`**WARNING: Failed to update log file**\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
  }

  return output.join('\n');
}
