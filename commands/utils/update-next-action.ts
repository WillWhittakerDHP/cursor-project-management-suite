/**
 * Atomic Command: /update-next-action [action]
 * Update "Next Action" in handoff
 */

import { readProjectFile, writeProjectFile } from './utils';
import { WorkflowCommandContext } from './command-context';

export async function updateNextAction(action: string, sessionId: string, featureName: string = 'vue-migration'): Promise<void> {
  const context = new WorkflowCommandContext(featureName);
  const handoffPath = context.paths.getSessionHandoffPath(sessionId);
  const content = await readProjectFile(handoffPath);
  
  // Find and replace the "Next Action" line
  const lines = content.split('\n');
  const updatedLines = lines.map(line => {
    if (line.includes('**Next Action:**')) {
      return `**Next Action:** ${action}`;
    }
    return line;
  });
  
  await writeProjectFile(handoffPath, updatedLines.join('\n'));
}

