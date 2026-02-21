/**
 * Atomic Command: /feature-checkpoint [name]
 * Create checkpoint in current feature
 * 
 * Tier: Feature (Tier 0 - Highest Level)
 * Operates on: Feature-level workflow (records feature state, updates feature log)
 * 
 * TODO MANAGEMENT INTEGRATION: This command should update todo statuses using todo
 * management utilities. Use todo commands from `.cursor/commands/todo/` for integration.
 * Todo status should be updated based on phase progress using `saveTodoCommand()`.
 * 
 * @param featureName Feature name (e.g. from .current-feature or git branch)
 */

import { findTodoById, saveTodo } from '../../../utils/todo-io';
import { aggregateDetails } from '../../../utils/todo-scoping';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function featureCheckpoint(featureName: string): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  const checkpointDate = new Date().toISOString().split('T')[0];
  
  // Update feature todo with checkpoint info
  try {
    const featureTodoId = `feature-${featureName}`;
    const featureTodo = await findTodoById(featureName, featureTodoId);
    
    if (featureTodo) {
      // Aggregate progress from phases
      const aggregated = await aggregateDetails(featureName, featureTodo);
      
      // Update todo metadata with checkpoint info
      if (!featureTodo.metadata) {
        featureTodo.metadata = {};
      }
      
      const checkpoints = (featureTodo.metadata.checkpoints as Array<{ date: string; status: string; progress: unknown }>) || [];
      checkpoints.push({
        date: checkpointDate,
        status: aggregated.status,
        progress: aggregated.progress,
      });
      
      featureTodo.metadata.checkpoints = checkpoints;
      featureTodo.updatedAt = new Date().toISOString();
      
      await saveTodo(featureName, featureTodo);
      
      output.push(`# Feature ${featureName} Checkpoint\n`);
      output.push(`**Date:** ${checkpointDate}\n`);
      output.push(`**Status:** Checkpoint recorded in todo\n`);
      output.push(`**Feature Status:** ${featureTodo.status}\n`);
      output.push(`**Progress:** ${aggregated.progress.completed}/${aggregated.progress.total} phases completed\n`);
      output.push('\n---\n');
    } else {
      output.push(`# Feature ${featureName} Checkpoint\n`);
      output.push(`**Date:** ${checkpointDate}\n`);
      output.push(`**WARNING: Feature todo not found: ${featureTodoId}**\n`);
      output.push(`**Suggestion:** Use \`/plan-feature ${featureName} [description]\` to create feature todo\n`);
      output.push('\n---\n');
    }
  } catch (_error) {
    output.push(`**WARNING: Could not update feature todo**\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('\n---\n');
  }
  
  // Also update log file (keep existing functionality)
  try {
    // Read existing log or create if doesn't exist
    let logContent = '';
    try {
      logContent = await context.readFeatureLog();
    } catch (err) {
      console.warn('Feature checkpoint: feature log not found, creating default content', featureName, err);
      logContent = `# Feature ${featureName} Log\n\n**Purpose:** Track feature-level progress, decisions, and blockers\n\n**Tier:** Feature (Tier 0 - Highest Level)\n\n---\n\n## Feature Status\n\n**Feature:** ${featureName}\n**Status:** In Progress\n**Started:** ${checkpointDate}\n\n---\n\n`;
    }
    
    // Add checkpoint entry
    const checkpointEntry = `## Feature Checkpoints\n\n### Checkpoint ${checkpointDate}\n**Status:** [On track / Behind / Ahead]\n**Notes:** [Checkpoint notes]\n**Git Branch:** \`feature/${featureName}\`\n**Git Commit:** [Commit hash]\n\n---\n\n`;
    
    // Insert checkpoint before "Next Steps" or at end
    const nextStepsIndex = logContent.indexOf('## Next Steps');
    if (nextStepsIndex !== -1) {
      logContent = logContent.slice(0, nextStepsIndex) + checkpointEntry + logContent.slice(nextStepsIndex);
    } else {
      logContent += checkpointEntry;
    }
    
    // Write log using DocumentManager
    // Note: DocumentManager doesn't have writeLog, so we'll use appendLog with replacement logic
    // For now, we'll write directly using the path resolver
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

