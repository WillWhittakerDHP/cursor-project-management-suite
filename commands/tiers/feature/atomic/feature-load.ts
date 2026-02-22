/**
 * Atomic Command: /feature-load [name]
 * Load feature context and documentation (guide/log/handoff).
 *
 * Tier: Feature (Tier 0 - Highest Level)
 * Operates on: Feature-level workflow (loads feature guide/log/handoff)
 */

import { WorkflowCommandContext } from '../../../utils/command-context';
import { MarkdownUtils } from '../../../utils/markdown-utils';
import { FEATURE_CONFIG } from '../../configs/feature';

export async function featureLoad(featureName: string): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];

  output.push(`# Feature ${featureName} Load\n`);
  output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n`);

  try {
    const status = await FEATURE_CONFIG.controlDoc.readStatus(context, featureName);
    if (status !== null) {
      output.push('## Feature Status (PROJECT_PLAN)\n');
      output.push(`**Status:** ${status}\n`);
      output.push('\n---\n');
    }
  } catch (_error) {
    // Status not found, continue without it
  }

  // Load feature guide
  const featureGuidePath = context.paths.getFeatureGuidePath();
  try {
    const featureGuideContent = await context.readFeatureGuide();
    
    // Extract key sections
    const overviewSection = MarkdownUtils.extractSection(featureGuideContent, 'Feature Overview');
    const objectivesSection = MarkdownUtils.extractSection(featureGuideContent, 'Feature Objectives');
    const phasesSection = MarkdownUtils.extractSection(featureGuideContent, 'Phases Breakdown');
    
    if (overviewSection) {
      output.push('## Feature Overview\n');
      output.push(overviewSection);
      output.push('\n---\n');
    }
    
    if (objectivesSection) {
      output.push('## Feature Objectives\n');
      output.push(objectivesSection);
      output.push('\n---\n');
    }
    
    if (phasesSection) {
      output.push('## Phases Breakdown\n');
      output.push(phasesSection);
      output.push('\n---\n');
    }
  } catch (_error) {
    output.push('## Feature Guide\n');
    output.push(`**ERROR: Feature guide not found**\n`);
    output.push(`**Attempted:** ${featureGuidePath}\n`);
    output.push(`**Suggestion:** Create the file at ${featureGuidePath}\n`);
    output.push(`**Template:** Use \`.cursor/commands/tiers/feature/templates/feature-guide.md\` as a starting point\n`);
    output.push('\n---\n');
  }
  
  // Load feature log
  try {
    const featureLogContent = await context.readFeatureLog();
    
    const statusSection = MarkdownUtils.extractSection(featureLogContent, 'Feature Status');
    const completedPhasesSection = MarkdownUtils.extractSection(featureLogContent, 'Completed Phases');
    const inProgressPhasesSection = MarkdownUtils.extractSection(featureLogContent, 'In Progress Phases');
    
    if (statusSection) {
      output.push('## Feature Status\n');
      output.push(statusSection);
      output.push('\n---\n');
    }
    
    if (completedPhasesSection) {
      output.push('## Completed Phases\n');
      output.push(completedPhasesSection);
      output.push('\n---\n');
    }
    
    if (inProgressPhasesSection) {
      output.push('## In Progress Phases\n');
      output.push(inProgressPhasesSection);
      output.push('\n---\n');
    }
  } catch (_error) {
    // Log file not found is not critical, just skip it
  }
  
  // Load feature handoff
  try {
    const handoffContent = await context.readFeatureHandoff();
    const transitionSection = MarkdownUtils.extractSection(handoffContent, 'Transition Context');
    
    if (transitionSection) {
      output.push('## Transition Context\n');
      output.push(transitionSection);
      output.push('\n---\n');
    }
  } catch (err) {
    console.warn('Feature load: failed to read transition context or log', err);
  }
  
  return output.join('\n');
}

