/**
 * Atomic Command: /read-handoff
 * Read and display transition context from handoff document
 * Focus: Where we left off, what's next (minimal context only)
 * 
 * @param tier Optional tier ('phase' | 'session' | 'task')
 * @param identifier Optional identifier (phase number, session ID, or task ID)
 * @param featureName Optional: resolved from .current-feature or git branch
 */

import { WorkflowCommandContext } from './command-context';
import { MarkdownUtils } from './markdown-utils';
import { WorkflowId } from './id-utils';
import { resolveFeatureName } from './feature-context';

export type HandoffTier = 'phase' | 'session' | 'task';

export async function readHandoff(
  tier?: HandoffTier,
  identifier?: string,
  featureName?: string
): Promise<string> {
  const resolved = await resolveFeatureName(featureName);
  const context = new WorkflowCommandContext(resolved);
  
  let content: string;

  // Determine handoff path based on tier
  if (tier === 'phase' && identifier) {
    try {
      content = await context.readPhaseHandoff(identifier);
    } catch (_error) {
      throw new Error(
        `ERROR: phase-specific handoff not found\n` +
        `Attempted: ${context.paths.getPhaseHandoffPath(identifier)}\n` +
        `Expected: phase-specific handoff file for phase ${identifier}\n` +
        `Suggestion: Create the file or use main handoff explicitly by omitting tier/identifier\n` +
        `Error: ${_error instanceof Error ? _error.message : String(_error)}`
      );
    }
  } else if (tier === 'session' && identifier) {
    if (!WorkflowId.isValidSessionId(identifier)) {
      throw new Error(`ERROR: Invalid session ID format. Expected X.Y.Z (e.g., 4.1.3)\nAttempted: ${identifier}`);
    }
    try {
      content = await context.readSessionHandoff(identifier);
    } catch (_error) {
      throw new Error(
        `ERROR: session-specific handoff not found\n` +
        `Attempted: ${context.paths.getSessionHandoffPath(identifier)}\n` +
        `Expected: session-specific handoff file for session ${identifier}\n` +
        `Suggestion: Create the file or use main handoff explicitly by omitting tier/identifier\n` +
        `Error: ${_error instanceof Error ? _error.message : String(_error)}`
      );
    }
  } else if (tier === 'task' && identifier) {
    // Task context is within session handoff
    // Parse task ID to get session ID
    const parsedTask = WorkflowId.parseTaskId(identifier);
    if (!parsedTask) {
      throw new Error(`ERROR: Invalid task ID format. Expected X.Y.Z.A (e.g., 4.1.3.1)\nAttempted: ${identifier}`);
    }
    const sessionId = parsedTask.sessionId;
    try {
      content = await context.readSessionHandoff(sessionId);
    } catch (_error) {
      throw new Error(
        `ERROR: session handoff not found for task ${identifier}\n` +
        `Attempted: ${context.paths.getSessionHandoffPath(sessionId)}\n` +
        `Expected: session handoff file for session ${sessionId}\n` +
        `Suggestion: Create the file or use main handoff explicitly by omitting tier/identifier\n` +
        `Error: ${_error instanceof Error ? _error.message : String(_error)}`
      );
    }
  } else {
    // No tier specified, use feature handoff
    try {
      content = await context.readFeatureHandoff();
    } catch (_error) {
      throw new Error(
        `ERROR: Feature handoff not found\n` +
        `Attempted: ${context.paths.getFeatureHandoffPath()}\n` +
        `Error: ${_error instanceof Error ? _error.message : String(_error)}`
      );
    }
  }
  
  // Focus on transition context only
  const sections = [
    'Current Status',
    'Next Action',
    'Transition Context', // New minimal context section
  ];
  
  const output: string[] = [];
  
  for (const section of sections) {
    const sectionContent = MarkdownUtils.extractSection(content, section);
    if (sectionContent) {
      output.push(sectionContent);
      output.push('');
    }
  }
  
  // If no sections found, return minimal message
  if (output.length === 0) {
    return '**No transition context found. Check handoff document.**';
  }
  
  return output.join('\n');
}

