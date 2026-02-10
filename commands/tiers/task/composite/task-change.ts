/**
 * Composite Command: /task-change [description]
 * 
 * Tier: Task (Tier 3 - Low-Level)
 * Operates on: Mid-task change requests that affect code and documentation
 * 
 * Mode: Ask Mode (planning/documenting)
 * 
 * IMPORTANT: This command must be used in Ask Mode. It records change requests and generates
 * action plans but does NOT implement changes. Implementation requires switching to Agent Mode
 * after explicit approval from the user.
 * 
 * Purpose: Record, track, and plan mid-task change requests (e.g., naming changes, 
 * refactoring, scope adjustments) ensuring they're documented in session logs.
 * 
 * Workflow:
 * 1. User runs command in Ask Mode
 * 2. Command parses request and generates action plan
 * 3. Command updates session log with task change entry
 * 4. User reviews plan and approves
 * 5. User switches to Agent Mode for implementation
 * 
 * See Rule 23 in `.cursor/rules/USER_CODING_RULES.md` for Ask Mode vs Agent Mode guidelines.
 */

import { parseChangeRequest, identifyChangeScope, ChangeRequest, ChangeScope, getCurrentDate } from '../../../utils/utils';
import { appendLog } from '../../../utils/append-log';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { WorkflowId } from '../../../utils/id-utils';
import { spawn } from 'child_process';
import { extractFilePaths, gatherFileStatuses } from '../../../../utils/context-gatherer';
import { formatFileStatusList } from '../../../../utils/context-templates';

export interface TaskChangeRequestParams {
  description: string;
  taskId: string; // Format: X.Y.Z (e.g., "2.2.1")
  scope?: 'code-only' | 'docs-only' | 'both';
}

export interface TaskChangeRequestResult {
  success: boolean;
  changeRequest: ChangeRequest;
  scope: ChangeScope;
  actionPlan: string[];
  logEntry: string;
  output: string;
}

/**
 * Process a mid-task change request
 */
export async function taskChange(params: TaskChangeRequestParams, featureName: string = 'vue-migration'): Promise<TaskChangeRequestResult> {
  // Mode warning (soft check - doesn't stop execution)
  console.warn('⚠️ MODE REMINDER: /task-change should be used in Ask Mode for planning. Implementation requires Agent Mode after approval.');
  
  // Restart server in background (non-blocking)
  spawn('npm', ['run', 'server:refresh'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true,
  }).unref();
  
  const context = new WorkflowCommandContext(featureName);
  
  // Parse task ID to get session ID
  const parsed = WorkflowId.parseTaskId(params.taskId);
  if (!parsed) {
    throw new Error(`ERROR: Invalid task ID format. Expected X.Y.Z (e.g., 2.2.1)\nAttempted: ${params.taskId}`);
  }
  
  const sessionId = `${parsed.phase}.${parsed.session}`;
  
  // Parse the conversational description into structured format
  const changeRequest = parseChangeRequest(params.description);
  
  // Override scope if provided
  if (params.scope) {
    changeRequest.scope = params.scope;
  }
  
  // Task-level changes typically affect task tier
  if (!changeRequest.tiersAffected.includes('task')) {
    changeRequest.tiersAffected.push('task');
  }
  
  // Identify scope of impact
  const scope = await identifyChangeScope(changeRequest);
  
  // Gather context for affected files (non-blocking)
  let contextOutput = '';
  try {
    const affectedFiles = scope.filesAffected.length > 0 
      ? scope.filesAffected 
      : extractFilePaths(params.description);
    
    if (affectedFiles.length > 0) {
      const fileStatuses = await gatherFileStatuses(affectedFiles);
      if (fileStatuses.length > 0) {
        const reactFiles = fileStatuses.filter(f => f.isReact);
        const vueFiles = fileStatuses.filter(f => f.isVue);
        
        if (reactFiles.length > 0 || vueFiles.length > 0) {
          contextOutput = '\n### Current State of Affected Files\n';
          contextOutput += '**Files that will be modified by this change:**\n';
          
          if (reactFiles.length > 0) {
            contextOutput += '\n**React Source Files:**';
            contextOutput += '\n' + formatFileStatusList(reactFiles);
          }
          
          if (vueFiles.length > 0) {
            contextOutput += '\n**Vue Target Files:**';
            contextOutput += '\n' + formatFileStatusList(vueFiles);
          }
        }
      }
    }
  } catch {}
  
  // Generate action plan
  const actionPlan = generateActionPlan(changeRequest, scope, params.taskId);
  
  // Format change request entry for session log
  const logEntry = formatChangeRequestEntry(changeRequest, scope, actionPlan, params.taskId, sessionId);
  
  // Update session log
  await appendLog(logEntry, sessionId);
  
  // Generate output summary
  let output = formatChangeRequestOutput(changeRequest, scope, actionPlan, params.taskId, sessionId);
  
  // Append context if gathered
  if (contextOutput) {
    output += contextOutput;
  }
  
  return {
    success: true,
    changeRequest,
    scope,
    actionPlan,
    logEntry,
    output,
  };
}

/**
 * Generate action plan based on change request and scope
 */
function generateActionPlan(changeRequest: ChangeRequest, scope: ChangeScope, taskId: string): string[] {
  const plan: string[] = [];
  
  if (changeRequest.scope === 'code-only' || changeRequest.scope === 'both') {
    if (changeRequest.type === 'naming' && changeRequest.oldValue && changeRequest.newValue) {
      plan.push(`Search codebase for all occurrences of \`${changeRequest.oldValue}\``);
      plan.push(`Update function/method names to \`${changeRequest.newValue}\``);
      plan.push(`Update all imports and usages`);
      plan.push(`Verify no breaking changes`);
    } else {
      plan.push(`Identify all files affected by this change`);
      plan.push(`Implement the change across affected files`);
      plan.push(`Verify changes compile and tests pass`);
    }
  }
  
  if (changeRequest.scope === 'docs-only' || changeRequest.scope === 'both') {
    plan.push(`Update session log with task change entry`);
    plan.push(`Update task entry in session log if change affects task description`);
  }
  
  return plan;
}

/**
 * Format change request entry for session log
 */
function formatChangeRequestEntry(
  changeRequest: ChangeRequest,
  scope: ChangeScope,
  actionPlan: string[],
  taskId: string,
  sessionId: string
): string {
  const date = getCurrentDate();
  const filesList = scope.filesAffected.length > 0
    ? scope.filesAffected.map(f => `- \`${f}\``).join('\n')
    : '- [Files will be identified during implementation]';
  
  const docsList = scope.documentationAffected.length > 0
    ? scope.documentationAffected.map(d => `- ${d}`).join('\n')
    : '- Session Log (Task Entry)';
  
  const actionPlanList = actionPlan.map((step, i) => `${i + 1}. ${step}`).join('\n');
  
  return `### Task Change Request: ${getBriefDescription(changeRequest)}

**Task:** ${taskId}
**Session:** ${sessionId}
**Type:** ${changeRequest.type.charAt(0).toUpperCase() + changeRequest.type.slice(1)}
**Date:** ${date}
**Status:** Pending

#### Directive
${changeRequest.directive}

#### Scope
**Files Affected:**
${filesList}

**Documentation Affected:**
${docsList}

#### Action Plan
${actionPlanList}

#### Implementation Notes
${getImplementationNotes(changeRequest)}

---
`;
}

/**
 * Format change request output for display
 */
function formatChangeRequestOutput(
  changeRequest: ChangeRequest,
  scope: ChangeScope,
  actionPlan: string[],
  taskId: string,
  sessionId: string
): string {
  const date = getCurrentDate();
  const filesList = scope.filesAffected.length > 0
    ? scope.filesAffected.map(f => `- \`${f}\``).join('\n')
    : '- [Files will be identified during implementation]';
  
  const docsList = scope.documentationAffected.length > 0
    ? scope.documentationAffected.map(d => `- ${d}`).join('\n')
    : '- Session Log (Task Entry)';
  
  const actionPlanList = actionPlan.map((step, i) => `${i + 1}. ${step}`).join('\n');
  
  return `## Task Change Request: ${getBriefDescription(changeRequest)}

**Task:** ${taskId}
**Session:** ${sessionId}
**Type:** ${changeRequest.type.charAt(0).toUpperCase() + changeRequest.type.slice(1)}
**Date:** ${date}

### Directive
${changeRequest.directive}

### Scope
**Files Affected:**
${filesList}

**Documentation Affected:**
${docsList}

### Action Plan
${actionPlanList}

### Implementation Notes
${getImplementationNotes(changeRequest)}

**Status:** Pending

✅ Change request recorded in session log. Ready to implement when approved.`;
}

/**
 * Get brief description for change request title
 */
function getBriefDescription(changeRequest: ChangeRequest): string {
  if (changeRequest.type === 'naming' && changeRequest.oldValue && changeRequest.newValue) {
    return `Rename ${changeRequest.oldValue} to ${changeRequest.newValue}`;
  }
  
  // Use first 50 characters of description
  const desc = changeRequest.description.trim();
  return desc.length > 50 ? desc.substring(0, 47) + '...' : desc;
}

/**
 * Get implementation notes based on change type
 */
function getImplementationNotes(changeRequest: ChangeRequest): string {
  if (changeRequest.type === 'naming') {
    return `This is a naming convention change for consistency and better clarity.\n- Update all references, not just definitions\n- Maintain backward compatibility during migration if needed\n- Verify no breaking changes`;
  }
  
  if (changeRequest.type === 'refactoring') {
    return `This is a refactoring change to improve code structure.\n- Ensure functionality remains unchanged\n- Update tests if needed\n- Verify all usages are updated`;
  }
  
  if (changeRequest.type === 'architectural') {
    return `This is an architectural change that may affect multiple components.\n- Review impact on dependent code\n- Update documentation accordingly\n- Consider backward compatibility`;
  }
  
  return `Review change scope and ensure all affected areas are updated.`;
}

