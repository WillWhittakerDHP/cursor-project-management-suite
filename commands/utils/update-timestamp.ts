/**
 * Atomic Command: /update-timestamp
 * Update "Last Updated" timestamp in handoff
 */

import { getCurrentDate } from './utils';
import { WorkflowCommandContext } from './command-context';
import { resolveFeatureName } from './feature-context';

export async function updateTimestamp(sessionId: string, featureName?: string): Promise<void> {
  const resolved = await resolveFeatureName(featureName);
  const context = new WorkflowCommandContext(resolved);
  const date = getCurrentDate();
  await context.documents.updateHandoff('session', sessionId, (content) =>
    content
      .split('\n')
      .map(line => (line.includes('**Last Updated:**') ? `**Last Updated:** ${date}` : line))
      .join('\n')
  );
}

