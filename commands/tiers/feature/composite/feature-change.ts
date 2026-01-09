/**
 * Composite Command: /feature-change [name] [new-name] [reason]
 * Handle feature pivots (similar to phase-change)
 * 
 * Tier: Feature (Tier 0 - Highest Level)
 * Operates on: Feature-level workflow (documents feature change, creates transition docs)
 * 
 * Ask Mode: Documentation-only workflow
 * This command records the change in workflow docs and creates a checkpoint.
 */

import { readProjectFile, writeProjectFile, PROJECT_ROOT } from '../../../utils/utils';
import { join } from 'path';
import { access } from 'fs/promises';
import { featureCheckpoint } from '../atomic/feature-checkpoint';
import { spawn } from 'child_process';
import { WorkflowCommandContext } from '../../../utils/command-context';

export async function featureChange(featureName: string, newFeatureName: string, reason: string): Promise<string> {
  // Restart server in background (non-blocking)
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
  
  // Step 1: Document current feature state
  output.push('## Step 1: Documenting Current Feature State\n\n');
  try {
    const context = new WorkflowCommandContext(featureName);
    const featureLogPath = context.paths.getFeatureLogPath();
    await access(join(PROJECT_ROOT, featureLogPath));
    const logContent = await readProjectFile(featureLogPath);
    
    // Add feature change entry to log
    const changeEntry = `## Feature Changes\n\n### Feature Change ${new Date().toISOString().split('T')[0]}\n**From:** ${featureName}\n**To:** ${newFeatureName}\n**Reason:** ${reason}\n**Impact:** [How this affects phases/sessions]\n\n---\n\n`;
    
    const nextStepsIndex = logContent.indexOf('## Next Steps');
    let updatedLogContent = logContent;
    if (nextStepsIndex !== -1) {
      updatedLogContent = logContent.slice(0, nextStepsIndex) + changeEntry + logContent.slice(nextStepsIndex);
    } else {
      updatedLogContent = logContent + changeEntry;
    }
    
    await writeProjectFile(featureLogPath, updatedLogContent);
    output.push(`**Log Updated:** ${featureLogPath}\n`);
  } catch (error) {
    output.push(`**WARNING:** Could not update feature log\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  // Step 2: Create feature change document
  output.push('\n## Step 2: Creating Feature Change Document\n\n');
  try {
    const context = new WorkflowCommandContext(featureName);
    const newContext = new WorkflowCommandContext(newFeatureName);
    const changeDocPath = `${context.paths.getBasePath()}/feature-${featureName}-to-${newFeatureName}-change.md`;
    const changeDocContent = `# Feature Change: ${featureName} → ${newFeatureName}\n\n**Date:** ${new Date().toISOString().split('T')[0]}\n**Reason:** ${reason}\n\n## Context\n\n[Current feature state and reason for change]\n\n## Transition Plan\n\n[How to transition from old feature to new feature]\n\n## Impact Assessment\n\n[Code, documentation, and testing impacts]\n\n## Risk Mitigation\n\n[Potential risks and mitigation strategies]\n\n## Timeline\n\n[Estimated duration and milestones]\n\n---\n\n## Related Documents\n\n- Feature Guide: \`${context.paths.getFeatureGuidePath()}\`\n- Feature Log: \`${context.paths.getFeatureLogPath()}\`\n- New Feature Guide: \`${newContext.paths.getFeatureGuidePath()}\`\n`;
    
    await writeProjectFile(changeDocPath, changeDocContent);
    output.push(`**Change Document Created:** ${changeDocPath}\n`);
  } catch (error) {
    output.push(`**ERROR:** Failed to create change document\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  // Step 3: Create checkpoint
  output.push('\n## Step 3: Creating Checkpoint\n\n');
  try {
    const checkpointOutput = await featureCheckpoint(featureName);
    output.push(checkpointOutput);
  } catch (error) {
    output.push(`**WARNING:** Failed to create checkpoint\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  output.push('\n---\n\n');
  output.push('## Next Steps\n\n');
  output.push('1. Review feature change document\n');
  output.push('2. Update feature guide with change details\n');
  output.push('3. If name changed, create new feature structure: `/plan-feature [new-name] [description]`\n');
  output.push('4. Continue work on updated feature\n');
  
  return output.join('\n');
}

