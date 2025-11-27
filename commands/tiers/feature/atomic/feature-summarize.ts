/**
 * Atomic Command: /feature-summarize [name]
 * Generate feature summary
 * 
 * Tier: Feature (Tier 0 - Highest Level)
 * Operates on: Feature-level workflow (analyzes feature log and phases, generates summary)
 * 
 * TODO MANAGEMENT INTEGRATION: When parsing planning docs to extract objectives or status,
 * this command should delegate to todo management utilities. See
 * Use todo commands from `.cursor/commands/todo/` for integration patterns.
 */

import { findTodoById } from '../../../utils/todo-io';
import { aggregateDetails, generateSummary } from '../../../utils/todo-scoping';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { MarkdownUtils } from '../../../utils/markdown-utils';

export async function featureSummarize(featureName: string): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  const featureLogPath = context.paths.getFeatureLogPath();
  const featureHandoffPath = context.paths.getFeatureHandoffPath();
  
  // Try to use todo aggregation first
  let aggregatedData: { progress: { completed: number; total: number; inProgress: number; pending: number }; tasks: Array<{ id: string; title: string; status: string }>; objectives: string[] } | null = null;
  let summaryData: { status: string; progress: { completed: number; total: number; inProgress: number; pending: number }; objectives: string[]; keyDependencies: string[]; nextSteps: string[] } | null = null;
  
  try {
    const featureTodoId = `feature-${featureName}`;
    const featureTodo = await findTodoById(featureName, featureTodoId);
    
    if (featureTodo) {
      aggregatedData = await aggregateDetails(featureName, featureTodo);
      summaryData = await generateSummary(featureName, featureTodo);
      
      output.push(`# Feature ${featureName} Summary\n`);
      output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n`);
      output.push(`**Status:** ${summaryData.status}\n`);
      output.push(`**Progress:** ${summaryData.progress.completed}/${summaryData.progress.total} phases completed, ${summaryData.progress.inProgress} in progress, ${summaryData.progress.pending} pending\n`);
      output.push('\n---\n');
      
      if (summaryData.objectives.length > 0) {
        output.push('## Objectives\n');
        for (const objective of summaryData.objectives) {
          output.push(`- ${objective}\n`);
        }
        output.push('\n---\n');
      }
      
      if (summaryData.keyDependencies.length > 0) {
        output.push('## Key Dependencies\n');
        for (const dep of summaryData.keyDependencies) {
          output.push(`- ${dep}\n`);
        }
        output.push('\n---\n');
      }
      
      if (summaryData.nextSteps.length > 0) {
        output.push('## Next Steps\n');
        for (const step of summaryData.nextSteps) {
          output.push(`- ${step}\n`);
        }
        output.push('\n---\n');
      }
      
      if (aggregatedData.tasks.length > 0) {
        const completedPhases = aggregatedData.tasks.filter(t => t.status === 'completed' && t.id.startsWith('phase-'));
        const inProgressPhases = aggregatedData.tasks.filter(t => t.status === 'in_progress' && t.id.startsWith('phase-'));
        
        if (completedPhases.length > 0) {
          output.push('## Completed Phases\n');
          for (const phase of completedPhases) {
            output.push(`- ✅ **${phase.id}**: ${phase.title}\n`);
          }
          output.push('\n---\n');
        }
        
        if (inProgressPhases.length > 0) {
          output.push('## In Progress Phases\n');
          for (const phase of inProgressPhases) {
            output.push(`- 🔄 **${phase.id}**: ${phase.title}\n`);
          }
          output.push('\n---\n');
        }
      }
    }
  } catch (error) {
    output.push(`⚠️ **Warning: Could not load todos for aggregation**\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push(`**Falling back to log parsing...**\n`);
    output.push('\n---\n');
  }
  
  try {
    // Read feature log (fallback or supplement)
    let logContent = '';
    try {
      logContent = await context.readFeatureLog();
    } catch {
      if (!aggregatedData) {
        output.push(`**ERROR:** Feature log not found at ${featureLogPath}\n`);
        return output.join('\n');
      }
      // If we have aggregated data, log file is optional
    }
    
    // Extract completed phases from log (if not already extracted from todos)
    if (!aggregatedData && logContent) {
      const completedPhasesSection = MarkdownUtils.extractSection(logContent, 'Completed Phases');
      const inProgressPhasesSection = MarkdownUtils.extractSection(logContent, 'In Progress Phases');
      const keyDecisionsSection = MarkdownUtils.extractSection(logContent, 'Key Decisions');
      
      // Generate summary from log
      const summary = `## Feature Completion Summary\n\n**Feature:** ${featureName}\n**Completed:** ${new Date().toISOString().split('T')[0]}\n\n`;
      
      let summaryContent = summary;
      
      if (completedPhasesSection) {
        summaryContent += `### Completed Phases\n\n${completedPhasesSection}\n\n`;
      }
      
      if (keyDecisionsSection) {
        summaryContent += `### Key Decisions\n\n${keyDecisionsSection}\n\n`;
      }
      
      // Update log with summary
      const summaryIndex = logContent.indexOf('## Feature Completion Summary');
      if (summaryIndex !== -1) {
        // Replace existing summary
        const nextSectionIndex = logContent.indexOf('##', summaryIndex + 1);
        if (nextSectionIndex !== -1) {
          logContent = logContent.slice(0, summaryIndex) + summaryContent + logContent.slice(nextSectionIndex);
        } else {
          logContent = logContent.slice(0, summaryIndex) + summaryContent;
        }
      } else {
        // Add summary before "Related Documents"
        const relatedDocsIndex = logContent.indexOf('## Related Documents');
        if (relatedDocsIndex !== -1) {
          logContent = logContent.slice(0, relatedDocsIndex) + summaryContent + logContent.slice(relatedDocsIndex);
        } else {
          logContent += summaryContent;
        }
      }
      
      // Write log using DocumentManager
      const { writeFile } = await import('fs/promises');
      const { join } = await import('path');
      const PROJECT_ROOT = process.cwd();
      await writeFile(join(PROJECT_ROOT, featureLogPath), logContent, 'utf-8');
      context.cache.invalidate(featureLogPath);
      
      output.push(`**Log Updated:** ${featureLogPath}\n`);
      output.push('\n---\n\n');
      output.push(summaryContent);
    } else if (aggregatedData) {
      // Update log file with summary from todos (optional, for backward compatibility)
      try {
        let logContent = '';
        try {
          logContent = await context.readFeatureLog();
        } catch {
          // Log file doesn't exist, that's okay
        }
        
        if (logContent) {
          const summaryContent = `## Feature Completion Summary\n\n**Feature:** ${featureName}\n**Completed:** ${new Date().toISOString().split('T')[0]}\n\n**Status:** ${summaryData.status}\n**Progress:** ${summaryData.progress.completed}/${summaryData.progress.total} phases completed\n\n`;
          
          const summaryIndex = logContent.indexOf('## Feature Completion Summary');
          if (summaryIndex !== -1) {
            const nextSectionIndex = logContent.indexOf('##', summaryIndex + 1);
            if (nextSectionIndex !== -1) {
              logContent = logContent.slice(0, summaryIndex) + summaryContent + logContent.slice(nextSectionIndex);
            } else {
              logContent = logContent.slice(0, summaryIndex) + summaryContent;
            }
          } else {
            const relatedDocsIndex = logContent.indexOf('## Related Documents');
            if (relatedDocsIndex !== -1) {
              logContent = logContent.slice(0, relatedDocsIndex) + summaryContent + logContent.slice(relatedDocsIndex);
            } else {
              logContent += summaryContent;
            }
          }
          
          // Write log using DocumentManager
          const { writeFile } = await import('fs/promises');
          const { join } = await import('path');
          const PROJECT_ROOT = process.cwd();
          await writeFile(join(PROJECT_ROOT, featureLogPath), logContent, 'utf-8');
          context.cache.invalidate(featureLogPath);
          output.push(`**Log Updated:** ${featureLogPath}\n`);
        }
      } catch (error) {
        // Log update is optional
      }
    }
    
    // Update handoff with summary (optional)
    try {
      let handoffContent = await context.readFeatureHandoff();
      
      const featureSummarySection = MarkdownUtils.extractSection(handoffContent, 'Feature Summary');
      if (!featureSummarySection && summaryData) {
        // Add feature summary section
        const notesIndex = handoffContent.indexOf('## Notes');
        if (notesIndex !== -1) {
          const summarySection = `## Feature Summary\n\n**Status:** ${summaryData.status}\n**Progress:** ${summaryData.progress.completed}/${summaryData.progress.total} phases completed\n\n**Objectives:**\n${summaryData.objectives.map(obj => `- ${obj}`).join('\n')}\n\n---\n\n`;
          handoffContent = handoffContent.slice(0, notesIndex) + summarySection + handoffContent.slice(notesIndex);
          // Write handoff using DocumentManager
          const { writeFile } = await import('fs/promises');
          const { join } = await import('path');
          const PROJECT_ROOT = process.cwd();
          await writeFile(join(PROJECT_ROOT, featureHandoffPath), handoffContent, 'utf-8');
          context.cache.invalidate(featureHandoffPath);
          output.push(`**Handoff Updated:** ${featureHandoffPath}\n`);
        }
      }
    } catch {
      // Handoff update is optional
    }
    
    if (!summaryData) {
      output.push(`**Status:** Summary generated successfully\n`);
    }
    
  } catch (error) {
    output.push(`**ERROR:** Failed to generate summary\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  return output.join('\n');
}

