/**
 * Atomic Command: /generate-prompt [session-id] [description]
 * Generate next session prompt
 * 
 * Tier: Session (Tier 2 - Medium-Level)
 * Operates on: Session-level prompts
 */

export function generatePrompt(sessionId: string, description: string): string {
  return `@.cursor/project-manager/features/vue-migration/feature-vue-migration-handoff.md Continue Vue migration - start Session ${sessionId} (${description})`;
}

