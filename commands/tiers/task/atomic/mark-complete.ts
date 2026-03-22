/**
 * Atomic Command: /mark-complete [X.Y.Z]
 * Mark task complete in session handoff
 * 
 * Tier: Task (Tier 3 - Low-Level)
 * Operates on: Task-level sections in session handoff document
 */

import { WorkflowCommandContext } from '../../../utils/command-context';
import { resolveFeatureDirectoryFromPlan } from '../../../utils';

export async function markComplete(taskId: string, featureName?: string): Promise<void> {
  const resolved = await resolveFeatureDirectoryFromPlan(featureName);
  const context = new WorkflowCommandContext(resolved);
  const sessionId = taskId.split('.').slice(0, 2).join('.');
  await context.documents.updateHandoff('session', sessionId, (content) => {
    const lines = content.split('\n');
    const updatedLines: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(taskId) && !line.includes('✅')) {
        if (line.trim().startsWith('###') || line.includes('**Status:**')) {
          updatedLines.push(line.replace(/\s*$/, ' ✅'));
        } else {
          updatedLines.push(line);
        }
      } else {
        updatedLines.push(line);
      }
    }
    return updatedLines.join('\n');
  });
}

