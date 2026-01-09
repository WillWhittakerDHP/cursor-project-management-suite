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

import { changeRequest, ChangeRequestParams } from '../tiers/session/composite/session-change';
import { taskChange, TaskChangeRequestParams } from '../tiers/task/composite/task-change';
import { phaseChange, PhaseChangeRequestParams } from '../tiers/phase/composite/phase-change';
import { WorkflowId } from './id-utils';
import { TierAnalysis } from './tier-discriminator';

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
  changeResult: any;
  output: string;
}

/**
 * Execute change request - routes to appropriate command based on tier
 */
export async function executeChangeRequest(
  params: ExecuteChangeRequestParams
): Promise<ExecuteChangeRequestResult> {
  const { description, tierAnalysis, sessionId, taskId, phase, featureName = 'vue-migration' } = params;
  
  try {
    let changeResult: any;
    
    if (tierAnalysis.tier === 'task' && taskId) {
      if (!WorkflowId.isValidTaskId(taskId)) {
        throw new Error(`Invalid task ID: ${taskId}. Expected format: X.Y.Z`);
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
        throw new Error(`Invalid session ID: ${sessionId}. Expected format: X.Y`);
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
    
  } catch (error) {
    return {
      success: false,
      changeResult: null,
      output: `Execution failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

