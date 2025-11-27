/**
 * Atomic Command: /mark-complete [X.Y.Z]
 * Mark task complete in session handoff
 * 
 * Tier: Task (Tier 3 - Low-Level)
 * Operates on: Task-level sections in session handoff document
 */

import { readProjectFile, writeProjectFile } from '../../../utils/utils';
import { WorkflowCommandContext } from '../../../utils/command-context';

export async function markComplete(taskId: string, featureName: string = 'vue-migration'): Promise<void> {
  const context = new WorkflowCommandContext(featureName);
  // Extract session ID from task ID (X.Y.Z -> X.Y)
  const sessionId = taskId.split('.').slice(0, 2).join('.');
  const handoffPath = context.paths.getSessionHandoffPath(sessionId);
  const content = await readProjectFile(handoffPath);
  
  // Find the task section and mark it complete
  const lines = content.split('\n');
  const updatedLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if this line contains the task ID
    if (line.includes(taskId) && !line.includes('✅')) {
      // Check if it's a heading or status line
      if (line.trim().startsWith('###') || line.includes('**Status:**')) {
        updatedLines.push(line.replace(/\s*$/, ' ✅'));
      } else {
        updatedLines.push(line);
      }
    } else {
      updatedLines.push(line);
    }
  }
  
  await writeProjectFile(handoffPath, updatedLines.join('\n'));
}

