/**
 * Workflow Command: /workflow-read-handoff
 * Read handoff document using unified workflow manager utilities
 * 
 * Provides a convenient interface to read handoffs at any tier (feature, phase, session)
 * using the unified CommandContext architecture.
 * 
 * Usage:
 *   /workflow-read-handoff feature [featureName]
 *   /workflow-read-handoff phase [phase] [featureName]
 *   /workflow-read-handoff session [sessionId] [featureName]
 * 
 * @param tier Document tier: "feature" | "phase" | "session"
 * @param identifier Optional identifier (phase number, session ID)
 * @param featureName Optional feature name (from .current-feature or git branch if omitted)
 */

import { resolveFeatureName } from '../../utils';
import { WorkflowCommandContext } from '../../utils/command-context';
import { WorkflowId } from '../../utils/id-utils';

export async function workflowReadHandoff(
  tier: 'feature' | 'phase' | 'session',
  identifier?: string,
  featureName?: string
): Promise<string> {
  const resolved = await resolveFeatureName(featureName);
  const context = new WorkflowCommandContext(resolved);
  const output: string[] = [];
  
  output.push(`# Workflow Handoff: ${tier}${identifier ? ` ${identifier}` : ''}\n`);
  output.push(`**Feature:** ${resolved}\n`);
  output.push('---\n\n');
  
  try {
    let handoffContent: string;
    
    switch (tier) {
      case 'feature':
        handoffContent = await context.readFeatureHandoff();
        break;
        
      case 'phase':
        if (!identifier) {
          return 'Error: Phase identifier is required for phase handoffs';
        }
        handoffContent = await context.readPhaseHandoff(identifier);
        break;
        
      case 'session':
        if (!identifier) {
          return 'Error: Session ID is required for session handoffs';
        }
        if (!WorkflowId.isValidSessionId(identifier)) {
          return `Error: Invalid session ID format. Expected X.Y.Z (e.g., 4.1.3)\nAttempted: ${identifier}`;
        }
        handoffContent = await context.readSessionHandoff(identifier);
        break;
    }
    
    output.push(handoffContent);
    
  } catch (_error) {
    const attemptedPath = 
      tier === 'feature' ? context.paths.getFeatureHandoffPath() :
      tier === 'phase' ? context.paths.getPhaseHandoffPath(identifier!) :
      context.paths.getSessionHandoffPath(identifier!);
    
    output.push(`**ERROR: Handoff not found**\n`);
    output.push(`**Tier:** ${tier}\n`);
    output.push(`**Identifier:** ${identifier || 'none'}\n`);
    output.push(`**Attempted:** ${attemptedPath}\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push(`**Suggestion:** Create the handoff file or check the identifier\n`);
  }
  
  return output.join('\n');
}

