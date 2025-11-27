/**
 * Workflow Command: /workflow-update-section
 * Update a section in a guide document using unified workflow manager utilities
 * 
 * Provides a convenient interface to update sections in guides at any tier
 * using the unified CommandContext architecture.
 * 
 * Usage:
 *   /workflow-update-section feature [sectionTitle] [content] [featureName] [append?]
 *   /workflow-update-section phase [phase] [sectionTitle] [content] [featureName] [append?]
 *   /workflow-update-section session [sessionId] [sectionTitle] [content] [featureName] [append?]
 * 
 * @param tier Document tier: "feature" | "phase" | "session"
 * @param identifier Optional identifier (phase number, session ID)
 * @param sectionTitle Section title to update
 * @param content New section content
 * @param featureName Optional feature name (defaults to "vue-migration")
 * @param append If true, append to section; if false, replace section (default: false)
 */

import { WorkflowCommandContext } from '../utils/command-context';
import { WorkflowId } from '../utils/id-utils';

export async function workflowUpdateSection(
  tier: 'feature' | 'phase' | 'session',
  identifier: string | undefined,
  sectionTitle: string,
  content: string,
  featureName: string = 'vue-migration',
  append: boolean = false
): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  output.push(`# Workflow Update Section: ${tier}${identifier ? ` ${identifier}` : ''}\n`);
  output.push(`**Section:** ${sectionTitle}\n`);
  output.push(`**Mode:** ${append ? 'Append' : 'Replace'}\n`);
  output.push(`**Feature:** ${featureName}\n`);
  output.push('---\n\n');
  
  // Validate identifier for phase/session
  if (tier === 'phase' && !identifier) {
    return 'Error: Phase identifier is required for phase guides';
  }
  if (tier === 'session' && !identifier) {
    return 'Error: Session ID is required for session guides';
  }
  if (tier === 'session' && identifier && !WorkflowId.isValidSessionId(identifier)) {
    return `Error: Invalid session ID format. Expected X.Y (e.g., 2.1)\nAttempted: ${identifier}`;
  }
  
  try {
    await context.documents.updateSection(
      tier,
      identifier,
      sectionTitle,
      content,
      append
    );
    
    const documentPath = 
      tier === 'feature' ? context.paths.getFeatureGuidePath() :
      tier === 'phase' ? context.paths.getPhaseGuidePath(identifier!) :
      context.paths.getSessionGuidePath(identifier!);
    
    output.push(`✅ **Section updated successfully**\n`);
    output.push(`**Document:** ${documentPath}\n`);
    output.push(`**Section:** ${sectionTitle}\n`);
    output.push(`**Action:** ${append ? 'Appended to' : 'Replaced'} section\n`);
    
  } catch (error) {
    const attemptedPath = 
      tier === 'feature' ? context.paths.getFeatureGuidePath() :
      tier === 'phase' ? context.paths.getPhaseGuidePath(identifier!) :
      context.paths.getSessionGuidePath(identifier!);
    
    output.push(`**ERROR: Failed to update section**\n`);
    output.push(`**Tier:** ${tier}\n`);
    output.push(`**Identifier:** ${identifier || 'none'}\n`);
    output.push(`**Section:** ${sectionTitle}\n`);
    output.push(`**Attempted:** ${attemptedPath}\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push(`**Suggestion:** Ensure the guide file exists and the section title is correct\n`);
  }
  
  return output.join('\n');
}

