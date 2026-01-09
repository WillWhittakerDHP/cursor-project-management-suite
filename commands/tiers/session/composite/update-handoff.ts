/**
 * Composite Command: /update-handoff
 * Composition: /mark-complete + /add-task-section + /update-next-action + /update-timestamp
 * 
 * Tier: Session (Tier 2 - Medium-Level)
 * Operates on: Session handoff document (updates task sections, next action)
 */

import { markComplete } from '../../task/atomic/mark-complete';
import { addTaskSection, TaskSection } from '../../task/atomic/add-task-section';
import { updateNextAction } from '../../../utils/update-next-action';
import { updateTimestamp } from '../../../utils/update-timestamp';

export interface UpdateHandoffParams {
  completedTasks?: string[]; // Format: X.Y.Z (e.g., ["1.3.1", "1.3.2"])
  newTask?: TaskSection; // Optional: Add new task section to handoff
  nextAction?: string;
  sessionId: string; // Session ID (format: X.Y)
  featureName?: string; // Feature name (defaults to 'vue-migration')
}

export async function updateHandoff(params: UpdateHandoffParams): Promise<void> {
  const featureName = params.featureName || 'vue-migration';
  
  // Mark completed tasks
  if (params.completedTasks) {
    for (const id of params.completedTasks) {
      await markComplete(id, featureName);
    }
  }
  
  // Add new task section if provided
  if (params.newTask) {
    await addTaskSection(params.newTask, featureName);
  }
  
  // Update next action if provided
  if (params.nextAction) {
    await updateNextAction(params.nextAction, params.sessionId, featureName);
  }
  
  // Always update timestamp
  await updateTimestamp(params.sessionId, featureName);
}

