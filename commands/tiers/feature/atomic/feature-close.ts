/**
 * Atomic Command: /feature-close [name]
 * Close feature and finalize documentation
 * 
 * Tier: Feature (Tier 0 - Highest Level)
 * Operates on: Feature-level workflow (finalizes feature log and handoff, marks feature complete)
 */

import { readProjectFile, writeProjectFile, PROJECT_ROOT } from '../../../utils/utils';
import { join } from 'path';
import { access } from 'fs/promises';
import { WorkflowCommandContext } from '../../../utils/command-context';

export async function featureClose(featureName: string): Promise<string> {
  const output: string[] = [];
  
  const context = new WorkflowCommandContext(featureName);
  const featureGuidePath = context.paths.getFeatureGuidePath();
  const featureLogPath = context.paths.getFeatureLogPath();
  const featureHandoffPath = context.paths.getFeatureHandoffPath();
  
  try {
    // Update feature guide status
    try {
      await access(join(PROJECT_ROOT, featureGuidePath));
      let guideContent = await readProjectFile(featureGuidePath);
      
      guideContent = guideContent.replace(
        /^\*\*Status:\*\* .*/m,
        `**Status:** Complete`
      );
      
      guideContent = guideContent.replace(
        /^\*\*Completed:\*\* \[Date\]/m,
        `**Completed:** ${new Date().toISOString().split('T')[0]}`
      );
      
      await writeProjectFile(featureGuidePath, guideContent);
      output.push(`**Guide Updated:** ${featureGuidePath}\n`);
    } catch {
      output.push(`**WARNING:** Feature guide not found\n`);
    }
    
    // Update feature log status
    try {
      await access(join(PROJECT_ROOT, featureLogPath));
      let logContent = await readProjectFile(featureLogPath);
      
      logContent = logContent.replace(
        /^\*\*Status:\*\* .*/m,
        `**Status:** Complete`
      );
      
      logContent = logContent.replace(
        /^\*\*Completed:\*\* \[Date\]/m,
        `**Completed:** ${new Date().toISOString().split('T')[0]}`
      );
      
      await writeProjectFile(featureLogPath, logContent);
      output.push(`**Log Updated:** ${featureLogPath}\n`);
    } catch {
      output.push(`**WARNING:** Feature log not found\n`);
    }
    
    // Update feature handoff status
    try {
      await access(join(PROJECT_ROOT, featureHandoffPath));
      let handoffContent = await readProjectFile(featureHandoffPath);
      
      handoffContent = handoffContent.replace(
        /^\*\*Feature Status:\*\* .*/m,
        `**Feature Status:** Complete`
      );
      
      handoffContent = handoffContent.replace(
        /^\*\*Last Updated:\*\* .*/m,
        `**Last Updated:** ${new Date().toISOString().split('T')[0]}`
      );
      
      await writeProjectFile(featureHandoffPath, handoffContent);
      output.push(`**Handoff Updated:** ${featureHandoffPath}\n`);
    } catch {
      output.push(`**WARNING:** Feature handoff not found\n`);
    }
    
    output.push(`\n# Feature ${featureName} Closed\n`);
    output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n`);
    output.push(`**Status:** Feature closed successfully\n`);
    
  } catch (error) {
    output.push(`**ERROR:** Failed to close feature\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  return output.join('\n');
}

