/**
 * Atomic Command: /update-next-action [action]
 * Update "Next Action" in handoff
 */

import { WorkflowCommandContext } from './command-context';
import { resolveFeatureName } from './feature-context';

export async function updateNextAction(action: string, sessionId: string, featureName?: string): Promise<void> {
  const resolved = await resolveFeatureName(featureName);
  const context = new WorkflowCommandContext(resolved);
  await context.documents.updateHandoff('session', sessionId, (content) => {
    const lines = content.split('\n');
    return lines
      .map(line => (line.includes('**Next Action:**') ? `**Next Action:** ${action}` : line))
      .join('\n');
  });
}

