/**
 * Atomic Command: /update-timestamp
 * Update "Last Updated" timestamp in handoff
 */

import { readProjectFile, writeProjectFile, getCurrentDate } from './utils';
import { WorkflowCommandContext } from './command-context';
import { resolveFeatureName } from './feature-context';

export async function updateTimestamp(sessionId: string, featureName?: string): Promise<void> {
  const resolved = await resolveFeatureName(featureName);
  const context = new WorkflowCommandContext(resolved);
  const handoffPath = context.paths.getSessionHandoffPath(sessionId);
  const content = await readProjectFile(handoffPath);
  
  // Find and replace the "Last Updated" line
  const lines = content.split('\n');
  const updatedLines = lines.map(line => {
    if (line.includes('**Last Updated:**')) {
      return `**Last Updated:** ${getCurrentDate()}`;
    }
    return line;
  });
  
  await writeProjectFile(handoffPath, updatedLines.join('\n'));
}

