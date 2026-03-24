/**
 * Atomic Command: /append-log [content]
 * Append formatted entry to session log
 * 
 * @param content Content to append to log
 * @param sessionId Optional session ID (X.Y format). If provided, writes to session-specific log file.
 *                  If not provided, writes to feature log for backward compatibility.
 * @param featureName Optional: resolved from .current-feature or git branch
 */

import { WorkflowCommandContext } from './command-context';
import { resolveFeatureDirectoryOrActive } from './workflow-scope';
export async function appendLog(
  content: string,
  sessionId?: string,
  featureName?: string
): Promise<void> {
  const resolved = await resolveFeatureDirectoryOrActive(featureName);
  const context = new WorkflowCommandContext(resolved);

  if (sessionId) {
    // Use session-specific log
    await context.appendSessionLog(sessionId, content);
  } else {
    // Use feature log for backward compatibility
    await context.appendFeatureLog(content);
  }
}

