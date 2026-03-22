/**
 * Atomic Command: /update-next-action [action]
 * Update "Next Action" in handoff
 */

import { WorkflowCommandContext } from './command-context';
import { resolveFeatureDirectoryFromPlan } from './workflow-scope';
export async function updateNextAction(action: string, sessionId: string, featureName?: string): Promise<void> {
  const resolved = await resolveFeatureDirectoryFromPlan(featureName);
  const context = new WorkflowCommandContext(resolved);
  await context.documents.updateHandoff('session', sessionId, (content) => {
    const lines = content.split('\n');
    return lines
      .map(line => (line.includes('**Next Action:**') ? `**Next Action:** ${action}` : line))
      .join('\n');
  });
}

