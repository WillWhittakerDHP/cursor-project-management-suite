/**
 * Atomic Command: /generate-prompt [session-id] [description]
 * Generate next session prompt
 * 
 * Tier: Session (Tier 2 - Medium-Level)
 * Operates on: Session-level prompts
 */

import { WorkflowCommandContext } from './command-context';

export function generatePrompt(sessionId: string, description: string): string {
  // Deterministic: prompt always points at the canonical workflow handoff path for the feature.
  const context = new WorkflowCommandContext('vue-migration');
  return `@${context.paths.getFeatureHandoffPath()} Continue Vue migration - start Session ${sessionId} (${description})`;
}

