/**
 * Atomic Command: /read-guide
 * Read and display relevant sections from session guide
 * 
 * @param sessionId Optional session ID (X.Y format). If provided, reads session-specific guide.
 *                  If not provided, reads template guide.
 * @param featureName Optional feature name (defaults to "vue-migration" for backward compatibility)
 */

import { WorkflowCommandContext } from './command-context';
import { MarkdownUtils } from './markdown-utils';

export async function readGuide(
  sessionId?: string,
  featureName: string = 'vue-migration'
): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  
  let guideContent: string;
  let usingTemplate = false;
  
  // Read guide content
  if (sessionId) {
    try {
      guideContent = await context.readSessionGuide(sessionId);
    } catch (error) {
      // Session-specific guide doesn't exist - fail explicitly
      const attemptedPath = context.paths.getSessionGuidePath(sessionId);
      throw new Error(
        `ERROR: Session-specific guide not found\n` +
        `Attempted: ${attemptedPath}\n` +
        `Expected: Session-specific guide file for session ${sessionId}\n` +
        `Suggestion: Create the file at ${attemptedPath} or use template guide explicitly by omitting sessionId`
      );
    }
  } else {
    // No session ID specified, use template guide
    try {
      guideContent = await context.templates.loadTemplate('session', 'guide');
      usingTemplate = true;
    } catch (error) {
      throw new Error(
        `ERROR: Template guide not found\n` +
        `Attempted: ${context.paths.getTemplatePath('session', 'guide')}\n` +
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  // Always load template guide for fallback
  let templateContent = '';
  try {
    templateContent = await context.templates.loadTemplate('session', 'guide');
  } catch (error) {
    // Template not found - log warning but continue with session guide only
    console.warn(
      `WARNING: Template guide not found for fallback\n` +
      `Attempted: ${context.paths.getTemplatePath('session', 'guide')}\n` +
      `Error: ${error instanceof Error ? error.message : String(error)}\n`
    );
  }
  
  const sections = [
    'Session Structure',
    'Learning Checkpoints',
    'Task Template', // Updated from "Sub-Session Template"
  ];
  
  const output: string[] = [];
  output.push('# Session Guide - Key Sections\n');
  
  if (usingTemplate) {
    output.push('**Note:** Using template guide. Create session-specific guide for custom content.\n\n');
  }
  
  // Extract sections with fallback to template
  for (const section of sections) {
    let sectionContent = MarkdownUtils.extractSection(guideContent, section);
    let source = 'session guide';
    
    // If section not found in session guide and we have template, try template
    if (!sectionContent && templateContent && !usingTemplate) {
      sectionContent = MarkdownUtils.extractSection(templateContent, section);
      source = 'template (fallback)';
    }
    
    if (sectionContent) {
      output.push(sectionContent);
      if (!usingTemplate && source === 'template (fallback)') {
        output.push(`\n*[Note: Section extracted from template - consider adding to session guide]*\n`);
      }
      output.push('');
    } else {
      // Section not found in either - log warning
      output.push(`## ${section}\n`);
      output.push(`**Warning:** Section not found in session guide or template.\n\n`);
    }
  }
  
  return output.join('\n');
}

