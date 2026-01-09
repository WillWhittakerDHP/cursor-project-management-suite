/**
 * Context Templates Utility
 * 
 * Formatting templates for auto-gathered context output.
 * Provides consistent formatting across all start/change commands.
 * 
 * LEARNING: Templates ensure consistent context presentation
 * WHY: Different commands need same context format; templates reduce duplication
 * PATTERN: Template functions that format context data into markdown
 */

import { FileStatus, CurrentStateSummary, FileContext, ImplementationStatus } from './context-gatherer';

/**
 * Format file status list
 */
export function formatFileStatusList(files: FileStatus[]): string {
  if (files.length === 0) {
    return '- No files found';
  }
  
  return files.map(file => {
    const emoji = file.exists ? '✅' : '❌';
    const type = file.isReact ? '(React)' : file.isVue ? '(Vue)' : '';
    const desc = file.description ? ` - ${file.description}` : '';
    return `- ${emoji} \`${file.path}\` ${type}${desc}`;
  }).join('\n');
}

/**
 * Format implementation status
 */
export function formatImplementationStatus(status: ImplementationStatus): string {
  const output: string[] = [];
  
  if (status.done.length > 0) {
    output.push('**What\'s already done:**');
    output.push(status.done.map(item => `- ${item}`).join('\n'));
  }
  
  if (status.missing.length > 0) {
    output.push('');
    output.push('**What\'s missing:**');
    output.push(status.missing.map(item => `- ${item}`).join('\n'));
  }
  
  if (output.length === 0) {
    return '**Status:** No implementation status available';
  }
  
  return output.join('\n');
}

/**
 * Format current state summary
 */
export function formatCurrentStateSummary(summary: CurrentStateSummary): string {
  const output: string[] = [];
  
  output.push('### Files Status');
  output.push('');
  
  if (summary.reactFiles.length > 0) {
    output.push('**React Source Files:**');
    output.push(formatFileStatusList(summary.reactFiles));
    output.push('');
  }
  
  if (summary.vueFiles.length > 0) {
    output.push('**Vue Target Files:**');
    output.push(formatFileStatusList(summary.vueFiles));
    output.push('');
  }
  
  output.push('### Implementation Status');
  output.push('');
  output.push(formatImplementationStatus(summary.implementationStatus));
  
  return output.join('\n');
}

/**
 * Format file context (React/Vue pair)
 */
export function formatFileContext(context: FileContext): string {
  const output: string[] = [];
  
  if (context.reactPath) {
    const reactEmoji = context.reactExists ? '✅' : '❌';
    output.push(`**React:** ${reactEmoji} \`${context.reactPath}\``);
  }
  
  if (context.vuePath) {
    const vueEmoji = context.vueExists ? '✅' : '❌';
    output.push(`**Vue:** ${vueEmoji} \`${context.vuePath}\``);
  }
  
  if (context.description) {
    output.push(`**Description:** ${context.description}`);
  }
  
  return output.join('\n');
}

/**
 * Format auto-gathered context section
 */
export function formatAutoGatheredContext(summary: CurrentStateSummary): string {
  const output: string[] = [];
  
  output.push('## Auto-Gathered Context');
  output.push('');
  output.push('**Automatically discovered from guide and codebase:**');
  output.push('');
  output.push(formatCurrentStateSummary(summary));
  
  return output.join('\n');
}

/**
 * Format simplified current state (for session-start template)
 */
export function formatSimplifiedCurrentState(summary: CurrentStateSummary): string {
  const output: string[] = [];
  
  output.push('### Current State');
  output.push('');
  output.push(formatImplementationStatus(summary.implementationStatus));
  
  return output.join('\n');
}

