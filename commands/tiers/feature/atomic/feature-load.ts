/**
 * Atomic Command: /feature-load [name]
 * Load feature context and documentation
 * 
 * Tier: Feature (Tier 0 - Highest Level)
 * Operates on: Feature-level workflow (loads feature guide/log/handoff)
 * 
 * TODO MANAGEMENT INTEGRATION: When parsing planning docs to extract objectives,
 * this command should delegate to todo management utilities. See
 * Use todo commands from `.cursor/commands/todo/` for integration patterns.
 * Todo management utilities can parse planning docs more robustly than direct
 * extractMarkdownSection calls.
 */

import { findTodoById } from '../../../utils/todo-io';
import { aggregateDetails } from '../../../utils/todo-scoping';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { MarkdownUtils } from '../../../utils/markdown-utils';

export async function featureLoad(featureName: string): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  output.push(`# Feature ${featureName} Load\n`);
  output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n`);
  
  // Load feature todo status
  try {
    const featureTodoId = `feature-${featureName}`;
    const featureTodo = await findTodoById(featureName, featureTodoId);
    
    if (featureTodo) {
      output.push('## Feature Todo Status\n');
      output.push(`**Status:** ${featureTodo.status}\n`);
      output.push(`**Title:** ${featureTodo.title}\n`);
      if (featureTodo.description) {
        output.push(`**Description:** ${featureTodo.description}\n`);
      }
      
      // Get aggregated progress
      try {
        const aggregated = await aggregateDetails(featureName, featureTodo);
        output.push(`**Progress:** ${aggregated.progress.completed}/${aggregated.progress.total} phases completed, ${aggregated.progress.inProgress} in progress, ${aggregated.progress.pending} pending\n`);
      } catch (error) {
        // Aggregation failed, continue without it
      }
      
      output.push('\n---\n');
    }
  } catch (error) {
    // Todo not found or error loading, continue without it
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
  } catch (error) {
    output.push('## Feature Guide\n');
    output.push(`**ERROR: Feature guide not found**\n`);
    output.push(`**Attempted:** ${featureGuidePath}\n`);
    output.push(`**Suggestion:** Create the file at ${featureGuidePath}\n`);
    output.push(`**Template:** Use \`.cursor/commands/tiers/feature/templates/feature-guide.md\` as a starting point\n`);
    output.push('\n---\n');
  }
  
  // Load feature log
  const featureLogPath = context.paths.getFeatureLogPath();
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
  } catch (error) {
    // Log file not found is not critical, just skip it
  }
  
  // Load feature handoff
  const featureHandoffPath = context.paths.getFeatureHandoffPath();
  try {
    const handoffContent = await context.readFeatureHandoff();
    const transitionSection = MarkdownUtils.extractSection(handoffContent, 'Transition Context');
    
    if (transitionSection) {
      output.push('## Transition Context\n');
      output.push(transitionSection);
      output.push('\n---\n');
    }
  } catch (error) {
    // Handoff file not found is not critical
  }
  
  return output.join('\n');
}

