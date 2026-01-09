/**
 * Composite Command: /log-subsession [X.Y.Z] [description]
 * Composition: /format-task-entry + /append-log
 * 
 * Tier: Task (Tier 3 - Low-Level)
 * Operates on: Task-level log entries embedded in session log
 * 
 * @deprecated Use /log-task instead. This is kept for backward compatibility.
 */

import { formatTaskEntry, TaskEntry } from '../atomic/format-task-entry';
import { appendLog } from '../../../utils/append-log';
import { WorkflowId } from '../../../utils/id-utils';
import { WorkflowCommandContext } from '../../../utils/command-context';

export async function logSubSession(entry: TaskEntry, featureName: string = 'vue-migration'): Promise<void> {
  const context = new WorkflowCommandContext(featureName);
  const formatted = formatTaskEntry(entry);
  
  // Extract session ID from task ID (X.Y.Z -> X.Y)
  const parsed = WorkflowId.parseTaskId(entry.id);
  const sessionId = parsed ? `${parsed.phase}.${parsed.session}` : undefined;
  
  await appendLog(formatted, sessionId, featureName);
}

