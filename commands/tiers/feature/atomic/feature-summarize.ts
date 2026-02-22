/**
 * Atomic Command: /feature-summarize [name]
 * Generate feature summary from feature log (no todo).
 *
 * Tier: Feature (Tier 0 - Highest Level)
 * Operates on: Feature-level workflow (analyzes feature log, generates summary)
 */

import { WorkflowCommandContext } from '../../../utils/command-context';
import { MarkdownUtils } from '../../../utils/markdown-utils';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function featureSummarize(featureName: string): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];

  const featureLogPath = context.paths.getFeatureLogPath();
  const featureHandoffPath = context.paths.getFeatureHandoffPath();

  output.push(`# Feature ${featureName} Summary\n`);
  output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n`);
  output.push('---\n');

  try {
    let logContent = '';
    try {
      logContent = await context.readFeatureLog();
    } catch (err) {
      console.warn('Feature summarize: feature log not found', featureLogPath, err);
      output.push(`**ERROR:** Feature log not found at ${featureLogPath}\n`);
      return output.join('\n');
    }

    const completedPhasesSection = MarkdownUtils.extractSection(logContent, 'Completed Phases');
    const keyDecisionsSection = MarkdownUtils.extractSection(logContent, 'Key Decisions');

    const summary = `## Feature Completion Summary\n\n**Feature:** ${featureName}\n**Completed:** ${new Date().toISOString().split('T')[0]}\n\n`;
    let summaryContent = summary;

    if (completedPhasesSection) {
      summaryContent += `### Completed Phases\n\n${completedPhasesSection}\n\n`;
    }

    if (keyDecisionsSection) {
      summaryContent += `### Key Decisions\n\n${keyDecisionsSection}\n\n`;
    }

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

    const PROJECT_ROOT = process.cwd();
    await writeFile(join(PROJECT_ROOT, featureLogPath), logContent, 'utf-8');
    context.cache.invalidate(featureLogPath);

    output.push(`**Log Updated:** ${featureLogPath}\n`);
    output.push('\n---\n\n');
    output.push(summaryContent);

    try {
      let handoffContent = await context.readFeatureHandoff();
      const featureSummarySection = MarkdownUtils.extractSection(handoffContent, 'Feature Summary');
      if (!featureSummarySection) {
        const notesIndex = handoffContent.indexOf('## Notes');
        if (notesIndex !== -1) {
          const summarySection = `## Feature Summary\n\n**Status:** See feature log\n\n---\n\n`;
          handoffContent = handoffContent.slice(0, notesIndex) + summarySection + handoffContent.slice(notesIndex);
          await writeFile(join(PROJECT_ROOT, featureHandoffPath), handoffContent, 'utf-8');
          context.cache.invalidate(featureHandoffPath);
          output.push(`**Handoff Updated:** ${featureHandoffPath}\n`);
        }
      }
    } catch (err) {
      console.warn('Feature summarize: handoff update failed (optional)', err);
    }

    output.push(`**Status:** Summary generated successfully\n`);
  } catch (_error) {
    output.push(`**ERROR:** Failed to generate summary\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
  }

  return output.join('\n');
}
