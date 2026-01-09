/**
 * Workflow Command: /workflow-read-log
 * Read log document using unified workflow manager utilities
 * 
 * Provides a convenient interface to read logs at any tier (feature, phase, session)
 * using the unified CommandContext architecture.
 * 
 * Usage:
 *   /workflow-read-log feature [featureName]
 *   /workflow-read-log phase [phase] [featureName]
 *   /workflow-read-log session [sessionId] [featureName]
 * 
 * @param tier Document tier: "feature" | "phase" | "session"
 * @param identifier Optional identifier (phase number, session ID)
 * @param featureName Optional feature name (defaults to "vue-migration")
 */

import { WorkflowCommandContext } from '../utils/command-context';
import { WorkflowId } from '../utils/id-utils';

export async function workflowReadLog(
  tier: 'feature' | 'phase' | 'session',
  identifier?: string,
  featureName: string = 'vue-migration'
): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  output.push(`# Workflow Log: ${tier}${identifier ? ` ${identifier}` : ''}\n`);
  output.push(`**Feature:** ${featureName}\n`);
  output.push('---\n\n');
  
  try {
    let logContent: string;
    
    switch (tier) {
      case 'feature':
        logContent = await context.readFeatureLog();
        break;
        
      case 'phase':
        if (!identifier) {
          return 'Error: Phase identifier is required for phase logs';
        }
        logContent = await context.readPhaseLog(identifier);
        break;
        
      case 'session':
        if (!identifier) {
          return 'Error: Session ID is required for session logs';
        }
        if (!WorkflowId.isValidSessionId(identifier)) {
          return `Error: Invalid session ID format. Expected X.Y (e.g., 2.1)\nAttempted: ${identifier}`;
        }
        logContent = await context.readSessionLog(identifier);
        break;
    }
    
    output.push(logContent);
    
  } catch (error) {
    const attemptedPath = 
      tier === 'feature' ? context.paths.getFeatureLogPath() :
      tier === 'phase' ? context.paths.getPhaseLogPath(identifier!) :
      context.paths.getSessionLogPath(identifier!);
    
    output.push(`**ERROR: Log not found**\n`);
    output.push(`**Tier:** ${tier}\n`);
    output.push(`**Identifier:** ${identifier || 'none'}\n`);
    output.push(`**Attempted:** ${attemptedPath}\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push(`**Suggestion:** Create the log file or check the identifier\n`);
  }
  
  return output.join('\n');
}

