/**
 * Atomic Command: executeChangeRequest
 * 
 * Purpose: Execute appropriate tier change command based on tier
 * 
 * This function routes to the appropriate tier change command:
 * - /session-change for session-tier changes
 * - /task-change for task-tier changes
 * - /phase-change for phase-tier changes
 * 
 * IMPORTANT: This does NOT directly implement code changes. It calls the tier
 * change commands which handle the proper workflow (logging, documentation, etc.)
 * 
 * Used by both scope-and-change (auto-execution) and execute-scoped-change.
 * 
 * LEARNING: Separating execution routing allows reuse across commands
 * WHY: Both auto-execution and manual execution need the same routing logic
 * PATTERN: Command router pattern - routes to appropriate handler based on tier
 */

import { changeRequest } from '../tiers/session/composite/session';
import { taskChange } from '../tiers/task/composite/task';
import { phaseChange } from '../tiers/phase/composite/phase';
import { WorkflowId } from './id-utils';
import { TierAnalysis } from './tier-discriminator';
import { resolveFeatureName } from './feature-context';

export interface ExecuteChangeRequestParams {
  description: string;
  tierAnalysis: TierAnalysis;
  sessionId?: string;
  taskId?: string;
  phase?: string;
  featureName?: string;
}

export interface ExecuteChangeRequestResult {
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  changeResult: any;
  output: string;
}

/**
 * Execute change request - routes to appropriate command based on tier
 */
export async function executeChangeRequest(
  params: ExecuteChangeRequestParams
): Promise<ExecuteChangeRequestResult> {
  const { description, tierAnalysis, sessionId, taskId, phase } = params;
  const featureName = await resolveFeatureName(params.featureName);
  
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let changeResult: any;
    
    if (tierAnalysis.tier === 'task' && taskId) {
      if (!WorkflowId.isValidTaskId(taskId)) {
        throw new Error(`Invalid task ID: ${taskId}. Expected format: X.Y.Z.Z.A`);
      }
      
      changeResult = await taskChange({
        description,
        taskId,
      }, featureName);
      
    } else if (tierAnalysis.tier === 'phase' && phase) {
      changeResult = await phaseChange({
        description,
        phase,
      }, featureName);
      
    } else if ((tierAnalysis.tier === 'session' || !tierAnalysis.tier) && sessionId) {
      if (!WorkflowId.isValidSessionId(sessionId)) {
        throw new Error(`Invalid session ID: ${sessionId}. Expected format: X.Y.Z`);
      }
      
      changeResult = await changeRequest({
        description,
        sessionId,
      }, featureName);
      
    } else {
      throw new Error(`Cannot determine execution tier. Session: ${sessionId}, Task: ${taskId}, Phase: ${phase}, Tier: ${tierAnalysis.tier}`);
    }
    
    return {
      success: true,
      changeResult,
      output: changeResult.output || 'Change executed successfully',
    };
    
  } catch (_error) {
    return {
      success: false,
      changeResult: null,
      output: `Execution failed: ${_error instanceof Error ? _error.message : String(_error)}`,
    };
  }
}

