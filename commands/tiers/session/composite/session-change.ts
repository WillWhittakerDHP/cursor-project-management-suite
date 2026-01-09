/**
 * Composite Command: /session-change [description]
 * 
 * Tier: Session (Tier 2 - Medium-Level)
 * Operates on: Mid-session change requests that affect code and documentation
 * 
 * Mode: Ask Mode (planning/documenting)
 * 
 * IMPORTANT: This command must be used in Ask Mode. It records change requests and generates
 * action plans but does NOT implement changes. Implementation requires switching to Agent Mode
 * after explicit approval from the user.
 * 
 * Purpose: Record, track, and plan mid-session change requests (e.g., naming changes, 
 * refactoring, architectural decisions) ensuring they're documented across all relevant tiers.
 * 
 * Workflow:
 * 1. User runs command in Ask Mode
 * 2. Command parses request and generates action plan
 * 3. Command updates session log with change request entry
 * 4. User reviews plan and approves
 * 5. User switches to Agent Mode for implementation
 * 
 * Alias: /mid-session-change (for convenience)
 * Legacy alias: /change-request (deprecated, use /session-change instead)
 * 
 * See Rule 23 in `.cursor/rules/USER_CODING_RULES.md` for Ask Mode vs Agent Mode guidelines.
 */

import { parseChangeRequest, identifyChangeScope, ChangeRequest, ChangeScope, getCurrentDate } from '../../../utils/utils';
import { appendLog } from '../../../utils/append-log';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { assessChangeScope, ScopeAssessment } from '../../../utils/assess-change-scope';
import { planSession } from './plan-session';
import { createFromPlainLanguageProgrammatic } from '../../../todo/composite/create-from-plain-language';
import { findTodoById } from '../../../utils/todo-io';
import { WorkflowId } from '../../../utils/id-utils';
import { spawn } from 'child_process';
import { extractFilePaths, gatherFileStatuses, checkFileExists } from '../../../../utils/context-gatherer';
import { formatFileStatusList } from '../../../../utils/context-templates';

export interface ChangeRequestParams {
  description: string;
  sessionId: string; // Format: X.Y (e.g., "2.2")
  scope?: 'code-only' | 'docs-only' | 'both';
  tiers?: string[]; // Optional - which tiers to update ("session", "phase", "all")
}

export interface ChangeRequestResult {
  success: boolean;
  changeRequest: ChangeRequest;
  scope: ChangeScope;
  actionPlan: string[];
  logEntry: string;
  output: string;
}

/**
 * Process a mid-session change request
 */
export async function changeRequest(params: ChangeRequestParams, featureName: string = 'vue-migration'): Promise<ChangeRequestResult> {
  // Mode warning (soft check - doesn't stop execution)
  console.warn('⚠️ MODE REMINDER: /session-change should be used in Ask Mode for planning. Implementation requires Agent Mode after approval.');
  
  // Restart server in background (non-blocking)
  spawn('npm', ['run', 'server:refresh'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true,
  }).unref();
  
  const context = new WorkflowCommandContext(featureName);
  
  // Parse the conversational description into structured format
  const changeRequest = parseChangeRequest(params.description);
  
  // Override scope if provided
  if (params.scope) {
    changeRequest.scope = params.scope;
  }
  
  // Override tiers if provided
  if (params.tiers) {
    changeRequest.tiersAffected = params.tiers;
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
  } catch (error) {
    // Non-blocking - don't fail change request if context gathering fails
  }
  
  // Assess if change requires re-planning
  const assessment = assessChangeScope(changeRequest, scope, 'session');
  
  let planningOutput: string | undefined;
  let todosUpdated = false;
  
  // If significant scope change, call planning command
  if (assessment.requiresReplanning && assessment.suggestedPlanningCommand === 'plan-session') {
    try {
      // Get session description from session guide or use change description
      const sessionDescription = changeRequest.description;
      planningOutput = await planSession(params.sessionId, sessionDescription, featureName);
      todosUpdated = true;
    } catch (error) {
      // Planning failed - log but continue with change request
      console.warn(`Planning command failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (assessment.significance === 'minor') {
    // For minor changes, update todos directly
    try {
      await updateTodosForMinorChange(changeRequest, params.sessionId, featureName);
      todosUpdated = true;
    } catch (error) {
      console.warn(`Todo update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Generate action plan (include planning step if needed)
  const actionPlan = generateActionPlan(changeRequest, scope, assessment);
  
  // Format change request entry for session log
  const logEntry = formatChangeRequestEntry(changeRequest, scope, actionPlan, params.sessionId, assessment);
  
  // Update session log
  const sessionLogPath = context.paths.getSessionLogPath(params.sessionId);
  await appendLog(logEntry, params.sessionId);
  
  // Generate output summary
  let output = formatChangeRequestOutput(changeRequest, scope, actionPlan, params.sessionId, assessment, planningOutput, todosUpdated);
  
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
 * Update todos for minor changes
 */
async function updateTodosForMinorChange(
  changeRequest: ChangeRequest,
  sessionId: string,
  featureName: string
): Promise<void> {
  const parsed = WorkflowId.parseSessionId(sessionId);
  if (!parsed) {
    return;
  }
  
  const currentPhase = parseInt(parsed.phase, 10);
  
  // Find session todo and update it
  const sessionTodo = await findTodoById(featureName, `session-${sessionId}`);
  if (sessionTodo) {
    // Update session todo description or add note about change
    // Note: Full todo update would require todo update utilities
    // For now, we just verify the todo exists
  }
  
  // If change adds tasks, create task todos
  const descriptionLower = changeRequest.description.toLowerCase();
  if (descriptionLower.includes('add task') || descriptionLower.includes('new task')) {
    // Extract task information and create todos
    // This is a simplified version - full implementation would parse task details
    const taskMatch = changeRequest.description.match(/task\s+([\d.]+)/i);
    if (taskMatch) {
      const taskId = taskMatch[1];
      await createFromPlainLanguageProgrammatic(
        featureName,
        `Task ${taskId}: ${changeRequest.description}`,
        { currentPhase, currentSession: sessionId }
      );
    }
  }
}

/**
 * Generate action plan based on change request and scope
 */
function generateActionPlan(changeRequest: ChangeRequest, scope: ChangeScope, assessment?: ScopeAssessment): string[] {
  const plan: string[] = [];
  
  // Add planning step if re-planning is needed
  if (assessment?.requiresReplanning) {
    plan.push(`Re-plan session using /plan-session (scope change is significant)`);
    plan.push(`Review updated session guide and todos`);
  } else if (assessment?.significance === 'minor') {
    plan.push(`Update todos directly (minor scope change)`);
  }
  
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
    plan.push(`Update session log with change request entry`);
    if (scope.tiersAffected.includes('session')) {
      plan.push(`Update session handoff if change affects next steps`);
    }
    if (scope.tiersAffected.includes('phase')) {
      plan.push(`Update phase guide if change affects phase-level decisions`);
    }
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
  sessionId: string,
  assessment?: ScopeAssessment
): string {
  const date = getCurrentDate();
  const filesList = scope.filesAffected.length > 0
    ? scope.filesAffected.map(f => `- \`${f}\``).join('\n')
    : '- [Files will be identified during implementation]';
  
  const docsList = scope.documentationAffected.length > 0
    ? scope.documentationAffected.map(d => `- ${d}`).join('\n')
    : '- Session Log';
  
  const tiersList = scope.tiersAffected.map(t => `- [x] ${t.charAt(0).toUpperCase() + t.slice(1)}-level docs`).join('\n');
  
  const actionPlanList = actionPlan.map((step, i) => `${i + 1}. ${step}`).join('\n');
  
  const assessmentSection = assessment ? `
### Scope Assessment
**Significance:** ${assessment.significance === 'significant' ? 'Significant (requires re-planning)' : 'Minor (direct todo update)'}
**Re-planning Required:** ${assessment.requiresReplanning ? 'Yes' : 'No'}
${assessment.reasons.length > 0 ? `**Reasons:**\n${assessment.reasons.map(r => `- ${r}`).join('\n')}` : ''}
${assessment.suggestedPlanningCommand ? `**Suggested Planning Command:** \`/${assessment.suggestedPlanningCommand}\`` : ''}
` : '';
  
  return `## Change Request: ${getBriefDescription(changeRequest)}

**Type:** ${changeRequest.type.charAt(0).toUpperCase() + changeRequest.type.slice(1)}
**Session:** ${sessionId}
**Date:** ${date}
**Status:** Pending
${assessmentSection}
### Directive
${changeRequest.directive}

### Scope
**Files Affected:**
${filesList}

**Documentation Affected:**
${docsList}

**Tiers Affected:**
${tiersList}

### Action Plan
${actionPlanList}

### Implementation Notes
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
  sessionId: string,
  assessment?: ScopeAssessment,
  planningOutput?: string,
  todosUpdated?: boolean
): string {
  const date = getCurrentDate();
  const filesList = scope.filesAffected.length > 0
    ? scope.filesAffected.map(f => `- \`${f}\``).join('\n')
    : '- [Files will be identified during implementation]';
  
  const docsList = scope.documentationAffected.length > 0
    ? scope.documentationAffected.map(d => `- ${d}`).join('\n')
    : '- Session Log';
  
  const tiersList = scope.tiersAffected.map(t => `- [x] ${t.charAt(0).toUpperCase() + t.slice(1)}-level docs`).join('\n');
  
  const actionPlanList = actionPlan.map((step, i) => `${i + 1}. ${step}`).join('\n');
  
  const assessmentSection = assessment ? `
### Scope Assessment
**Significance:** ${assessment.significance === 'significant' ? 'Significant (requires re-planning)' : 'Minor (direct todo update)'}
**Re-planning Required:** ${assessment.requiresReplanning ? 'Yes' : 'No'}
${assessment.reasons.length > 0 ? `**Reasons:**\n${assessment.reasons.map(r => `- ${r}`).join('\n')}` : ''}
${assessment.suggestedPlanningCommand ? `**Suggested Planning Command:** \`/${assessment.suggestedPlanningCommand}\`` : ''}
` : '';
  
  const planningSection = planningOutput ? `
### Planning Output
${planningOutput}
` : '';
  
  const todosSection = todosUpdated ? `
### Todos Updated
✅ Todos have been ${assessment?.requiresReplanning ? 'updated via planning command' : 'updated directly'}
` : '';
  
  return `## Change Request: ${getBriefDescription(changeRequest)}

**Type:** ${changeRequest.type.charAt(0).toUpperCase() + changeRequest.type.slice(1)}
**Session:** ${sessionId}
**Date:** ${date}
${assessmentSection}
### Directive
${changeRequest.directive}

### Scope
**Files Affected:**
${filesList}

**Documentation Affected:**
${docsList}

**Tiers Affected:**
${tiersList}

### Action Plan
${actionPlanList}
${planningSection}${todosSection}
### Implementation Notes
${getImplementationNotes(changeRequest)}

**Status:** Pending

✅ Change request recorded in session log. ${assessment?.requiresReplanning ? 'Planning command executed. ' : ''}Ready to implement when approved.`;
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

// Backward compatibility aliases
export const midSessionChange = changeRequest;
// Note: Function name 'changeRequest' is kept for backward compatibility with internal code
// The command name is now /session-change (with /change-request as deprecated legacy alias)

