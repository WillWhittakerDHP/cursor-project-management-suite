/**
 * Atomic Command: /generate-prompt [session-id] [description]
 * Generate next session prompt
 * 
 * Tier: Session (Tier 2 - Medium-Level)
 * Operates on: Session-level prompts
 */

import { WorkflowCommandContext } from './command-context';
import { resolveFeatureDirectoryFromPlan } from './workflow-scope';
export async function generatePrompt(sessionId: string, description: string, featureName?: string): Promise<string> {
  const resolved = await resolveFeatureDirectoryFromPlan(featureName);
  const context = new WorkflowCommandContext(resolved);
  return `@${context.paths.getFeatureHandoffPath()} Continue - start Session ${sessionId} (${description})`;
}

