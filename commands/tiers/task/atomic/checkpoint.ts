/**
 * Atomic Command: /task-checkpoint [X.Y.Z] [notes]
 * Task-level quality check without full end-of-session overhead
 * Updates log only (not handoff), doesn't commit/push
 * 
 * Tier: Task (Tier 3 - Low-Level)
 * Operates on: Task-level checkpoints embedded in session log
 * 
 * Alias: /checkpoint (for backward compatibility)
 */

import { verify } from '../../../utils/verify';
import { appendLog } from '../../../utils/append-log';
import { getCurrentDate } from '../../../utils/utils';
import { WorkflowId } from '../../../utils/id-utils';
import { WorkflowCommandContext } from '../../../utils/command-context';

export async function taskCheckpoint(taskId: string, notes?: string, featureName: string = 'vue-migration'): Promise<{
  success: boolean;
  output: string;
}> {
  const context = new WorkflowCommandContext(featureName);
  
  // Run quality checks
  const verifyResult = await verify('vue', false);
  
  if (!verifyResult.success) {
    return {
      success: false,
      output: 'Quality checks failed. Fix errors before continuing.',
    };
  }
  
  // Extract session ID from task ID (X.Y.Z -> X.Y)
  const parsed = WorkflowId.parseTaskId(taskId);
  const sessionId = parsed ? `${parsed.phase}.${parsed.session}` : undefined;
  
  // Create lightweight checkpoint entry
  const checkpointEntry = `### Task Checkpoint: ${taskId}
**Time**: ${getCurrentDate()}
**Status**: ✅ Quality checks passed
${notes ? `**Notes**: ${notes}` : ''}
`;
  
  // Update log (lightweight entry) - use session-specific log if sessionId available
  await appendLog(checkpointEntry, sessionId);
  
  return {
    success: true,
    output: '✅ Task checkpoint complete. Continue with next task.',
  };
}

// Backward compatibility alias
export const checkpoint = taskCheckpoint;

