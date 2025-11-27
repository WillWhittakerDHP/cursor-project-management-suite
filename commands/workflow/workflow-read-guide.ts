/**
 * Workflow Command: /workflow-read-guide
 * Read guide document using unified workflow manager utilities
 * 
 * Provides a convenient interface to read guides at any tier (feature, phase, session)
 * using the unified CommandContext architecture.
 * 
 * Usage:
 *   /workflow-read-guide feature [featureName]
 *   /workflow-read-guide phase [phase] [featureName]
 *   /workflow-read-guide session [sessionId] [featureName]
 * 
 * @param tier Document tier: "feature" | "phase" | "session"
 * @param identifier Optional identifier (phase number, session ID)
 * @param featureName Optional feature name (defaults to "vue-migration")
 */

import { WorkflowCommandContext } from '../utils/command-context';
import { WorkflowId } from '../utils/id-utils';

export async function workflowReadGuide(
  tier: 'feature' | 'phase' | 'session',
  identifier?: string,
  featureName: string = 'vue-migration'
): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  output.push(`# Workflow Guide: ${tier}${identifier ? ` ${identifier}` : ''}\n`);
  output.push(`**Feature:** ${featureName}\n`);
  output.push('---\n\n');
  
  try {
    let guideContent: string;
    
    switch (tier) {
      case 'feature':
        guideContent = await context.readFeatureGuide();
        break;
        
      case 'phase':
        if (!identifier) {
          return 'Error: Phase identifier is required for phase guides';
        }
        guideContent = await context.readPhaseGuide(identifier);
        break;
        
      case 'session':
        if (!identifier) {
          return 'Error: Session ID is required for session guides';
        }
        if (!WorkflowId.isValidSessionId(identifier)) {
          return `Error: Invalid session ID format. Expected X.Y (e.g., 2.1)\nAttempted: ${identifier}`;
        }
        guideContent = await context.readSessionGuide(identifier);
        break;
    }
    
    output.push(guideContent);
    
  } catch (error) {
    const attemptedPath = 
      tier === 'feature' ? context.paths.getFeatureGuidePath() :
      tier === 'phase' ? context.paths.getPhaseGuidePath(identifier!) :
      context.paths.getSessionGuidePath(identifier!);
    
    output.push(`**ERROR: Guide not found**\n`);
    output.push(`**Tier:** ${tier}\n`);
    output.push(`**Identifier:** ${identifier || 'none'}\n`);
    output.push(`**Attempted:** ${attemptedPath}\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push(`**Suggestion:** Create the guide file or check the identifier\n`);
  }
  
  return output.join('\n');
}

