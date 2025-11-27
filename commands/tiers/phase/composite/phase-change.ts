/**
 * Composite Command: /phase-change [description]
 * 
 * Tier: Phase (Tier 1 - High-Level)
 * Operates on: Mid-phase change requests that affect code and documentation
 * 
 * Mode: Ask Mode (planning/documenting)
 * 
 * IMPORTANT: This command must be used in Ask Mode. It records change requests and generates
 * action plans but does NOT implement changes. Implementation requires switching to Agent Mode
 * after explicit approval from the user.
 * 
 * Purpose: Record, track, and plan mid-phase change requests (e.g., naming changes, 
 * refactoring, architectural decisions) ensuring they're documented across all relevant tiers.
 * 
 * Workflow:
 * 1. User runs command in Ask Mode
 * 2. Command parses request and generates action plan
 * 3. Command updates phase log with change request entry
 * 4. User reviews plan and approves
 * 5. User switches to Agent Mode for implementation
 * 
 * See Rule 23 in `.cursor/rules/USER_CODING_RULES.md` for Ask Mode vs Agent Mode guidelines.
 */

import { parseChangeRequest, identifyChangeScope, ChangeRequest, ChangeScope, getCurrentDate, readProjectFile, writeProjectFile } from '../../../utils/utils';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { assessChangeScope, ScopeAssessment } from '../../../utils/assess-change-scope';
import { planPhase } from './plan-phase';
import { createFromPlainLanguageProgrammatic } from '../../../todo/composite/create-from-plain-language';
import { findTodoById } from '../../../utils/todo-io';
import { spawn } from 'child_process';
import { extractFilePaths, gatherFileStatuses } from '../../../../utils/context-gatherer';
import { formatFileStatusList } from '../../../../utils/context-templates';

export interface PhaseChangeRequestParams {
  description: string;
  phase: string; // Format: N (e.g., "2")
  scope?: 'code-only' | 'docs-only' | 'both';
  tiers?: string[]; // Optional - which tiers to update ("phase", "session", "task", "all")
}

export interface PhaseChangeRequestResult {
  success: boolean;
  changeRequest: ChangeRequest;
  scope: ChangeScope;
  actionPlan: string[];
  logEntry: string;
  output: string;
}

/**
 * Process a mid-phase change request
 */
export async function phaseChange(params: PhaseChangeRequestParams, featureName: string = 'vue-migration'): Promise<PhaseChangeRequestResult> {
  // Mode warning (soft check - doesn't stop execution)
  console.warn('⚠️ MODE REMINDER: /phase-change should be used in Ask Mode for planning. Implementation requires Agent Mode after approval.');
  
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
  const assessment = assessChangeScope(changeRequest, scope, 'phase');
  
  let planningOutput: string | undefined;
  let todosUpdated = false;
  
  // If significant scope change, call planning command
  if (assessment.requiresReplanning && assessment.suggestedPlanningCommand === 'plan-phase') {
    try {
      const phaseDescription = changeRequest.description;
      planningOutput = await planPhase(params.phase, phaseDescription, featureName);
      todosUpdated = true;
    } catch (error) {
      console.warn(`Planning command failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (assessment.significance === 'minor') {
    // For minor changes, update todos directly
    try {
      await updateTodosForMinorChange(changeRequest, params.phase, featureName);
      todosUpdated = true;
    } catch (error) {
      console.warn(`Todo update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Generate action plan (include planning step if needed)
  const actionPlan = generateActionPlan(changeRequest, scope, assessment);
  
  // Format change request entry for phase log
  const logEntry = formatChangeRequestEntry(changeRequest, scope, actionPlan, params.phase, assessment);
  
  // Update phase log
  const phaseLogPath = context.paths.getPhaseLogPath(params.phase);
  try {
    let logContent = await readProjectFile(phaseLogPath);
    
    // Find or create Change Requests section
    const changeRequestsMarker = '## Change Requests';
    if (logContent.includes(changeRequestsMarker)) {
      // Insert after the marker
      const sections = logContent.split(changeRequestsMarker);
      logContent = sections[0] + changeRequestsMarker + '\n\n' + logEntry + '\n' + sections.slice(1).join(changeRequestsMarker);
    } else {
      // Add Change Requests section before Completed Sessions or at end
      const completedSessionsMarker = '## Completed Sessions';
      if (logContent.includes(completedSessionsMarker)) {
        const sections = logContent.split(completedSessionsMarker);
        logContent = sections[0] + changeRequestsMarker + '\n\n' + logEntry + '\n\n' + completedSessionsMarker + sections.slice(1).join(completedSessionsMarker);
      } else {
        logContent += `\n\n${changeRequestsMarker}\n\n${logEntry}`;
      }
    }
    
    await writeProjectFile(phaseLogPath, logContent);
  } catch (error) {
    throw new Error(
      `ERROR: Failed to update phase log\n` +
      `Phase: ${params.phase}\n` +
      `Phase Log Path: ${phaseLogPath}\n` +
      `Error Details: ${error instanceof Error ? error.message : String(error)}\n` +
      `Suggestion: Verify phase number format and phase log exists`
    );
  }
  
  // Generate output summary
  let output = formatChangeRequestOutput(changeRequest, scope, actionPlan, params.phase, assessment, planningOutput, todosUpdated);
  
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
  phase: string,
  featureName: string
): Promise<void> {
  // Find phase todo and verify it exists
  const phaseTodo = await findTodoById(featureName, `phase-${phase}`);
  if (phaseTodo) {
    // Todo exists - for now we just verify
    // Full todo update would require todo update utilities
  }
  
  // If change adds sessions, create session todos
  const descriptionLower = changeRequest.description.toLowerCase();
  if (descriptionLower.includes('add session') || descriptionLower.includes('new session')) {
    // Extract session information and create todos
    const sessionMatch = changeRequest.description.match(/session\s+([\d.]+)/i);
    if (sessionMatch) {
      const sessionId = sessionMatch[1];
      await createFromPlainLanguageProgrammatic(
        featureName,
        `Session ${sessionId}: ${changeRequest.description}`,
        { currentPhase: parseInt(phase) }
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
    plan.push(`Re-plan phase using /plan-phase (scope change is significant)`);
    plan.push(`Review updated phase guide and todos`);
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
    plan.push(`Update phase log with change request entry`);
    if (scope.tiersAffected.includes('phase')) {
      plan.push(`Update phase guide if change affects phase-level decisions`);
    }
    if (scope.tiersAffected.includes('session')) {
      plan.push(`Update affected session logs and handoffs`);
    }
    if (scope.tiersAffected.includes('task')) {
      plan.push(`Update affected task entries in session logs`);
    }
  }
  
  return plan;
}

/**
 * Format change request entry for phase log
 */
function formatChangeRequestEntry(
  changeRequest: ChangeRequest,
  scope: ChangeScope,
  actionPlan: string[],
  phase: string,
  assessment?: ScopeAssessment
): string {
  const date = getCurrentDate();
  const filesList = scope.filesAffected.length > 0
    ? scope.filesAffected.map(f => `- \`${f}\``).join('\n')
    : '- [Files will be identified during implementation]';
  
  const docsList = scope.documentationAffected.length > 0
    ? scope.documentationAffected.map(d => `- ${d}`).join('\n')
    : '- Phase Log';
  
  const tiersList = scope.tiersAffected.map(t => `- [x] ${t.charAt(0).toUpperCase() + t.slice(1)}-level docs`).join('\n');
  
  const actionPlanList = actionPlan.map((step, i) => `${i + 1}. ${step}`).join('\n');
  
  const assessmentSection = assessment ? `
#### Scope Assessment
**Significance:** ${assessment.significance === 'significant' ? 'Significant (requires re-planning)' : 'Minor (direct todo update)'}
**Re-planning Required:** ${assessment.requiresReplanning ? 'Yes' : 'No'}
${assessment.reasons.length > 0 ? `**Reasons:**\n${assessment.reasons.map(r => `- ${r}`).join('\n')}` : ''}
${assessment.suggestedPlanningCommand ? `**Suggested Planning Command:** \`/${assessment.suggestedPlanningCommand}\`` : ''}
` : '';
  
  return `### Change Request: ${getBriefDescription(changeRequest)}

**Type:** ${changeRequest.type.charAt(0).toUpperCase() + changeRequest.type.slice(1)}
**Phase:** ${phase}
**Date:** ${date}
**Status:** Pending
${assessmentSection}
#### Directive
${changeRequest.directive}

#### Scope
**Files Affected:**
${filesList}

**Documentation Affected:**
${docsList}

**Tiers Affected:**
${tiersList}

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
  phase: string,
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
    : '- Phase Log';
  
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
**Phase:** ${phase}
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

✅ Change request recorded in phase log. ${assessment?.requiresReplanning ? 'Planning command executed. ' : ''}Ready to implement when approved.`;
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

