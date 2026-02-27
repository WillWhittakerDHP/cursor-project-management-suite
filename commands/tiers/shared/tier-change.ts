/**
 * Shared tier-change: one implementation for phase/session/task change requests.
 * Replaces duplicated logic in phase-change, session-change, task-change.
 */

import type { TierConfig } from './types';
import type { TierName } from './types';
import { resolveFeatureName } from '../../utils';
import { WorkflowCommandContext } from '../../utils/command-context';
import {
  parseChangeRequest,
  identifyChangeScope,
  getCurrentDate,
  type ChangeRequest,
  type ChangeScope,
} from '../../utils/utils';
import { assessChangeScope, type ScopeAssessment } from '../../utils/assess-change-scope';
import { modeGateText } from '../../utils/command-execution-mode';


export interface TierChangeParams {
  identifier: string;
  description: string;
  scope?: 'code-only' | 'docs-only' | 'both';
  tiers?: string[];
}

export interface TierChangeResult {
  success: boolean;
  output: string;
  changeRequest: ChangeRequest;
  scope: ChangeScope;
  actionPlan: string[];
  logEntry: string;
}

export interface RunTierChangeOptions {
  replanCommand?: (id: string, desc: string, feature?: string) => Promise<string>;
}

/**
 * Run the change-request flow for any tier (phase, session, task).
 * Config supplies path and log-update behavior; optional replanCommand is passed by the thin wrapper.
 */
export async function runTierChange(
  config: TierConfig,
  params: TierChangeParams,
  featureName?: string,
  options?: RunTierChangeOptions
): Promise<TierChangeResult> {
  const gate = modeGateText('plan', `${config.name}-change`);

  const resolved = await resolveFeatureName(featureName);
  const context = new WorkflowCommandContext(resolved);

  const parsed = config.parseId(params.identifier);
  if (!parsed && config.name !== 'feature') {
    throw new Error(
      `ERROR: Invalid ${config.name} ID format.\nAttempted: ${params.identifier}`
    );
  }

  const changeRequest = parseChangeRequest(params.description);
  if (params.scope) changeRequest.scope = params.scope;
  if (params.tiers) changeRequest.tiersAffected = params.tiers;
  if (config.name === 'task' && !changeRequest.tiersAffected.includes('task')) {
    changeRequest.tiersAffected.push('task');
  }

  const scope = await identifyChangeScope(changeRequest);
  const assessment =
    config.name !== 'task'
      ? assessChangeScope(changeRequest, scope, config.name as 'session' | 'phase' | 'feature')
      : undefined;

  const replan = options?.replanCommand ?? config.replanCommand;
  let planningOutput: string | undefined;
  let todosUpdated = false;
  if (assessment?.requiresReplanning && replan) {
    try {
      planningOutput = await replan(params.identifier, params.description, resolved);
      todosUpdated = true;
    } catch (e) {
      console.warn(`Planning command failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const actionPlan = generateActionPlan(config.name, changeRequest, scope, assessment, params.identifier);
  const logEntry = formatChangeEntry(config.name, params.identifier, changeRequest, scope, actionPlan, assessment);
  await config.updateLog(context, params.identifier, logEntry);

  const output = formatChangeOutput(
    config.name,
    params.identifier,
    changeRequest,
    scope,
    actionPlan,
    assessment,
    planningOutput,
    todosUpdated
  );

  return {
    success: true,
    output: gate + '\n\n---\n\n' + output,
    changeRequest,
    scope,
    actionPlan,
    logEntry,
  };
}

function getBriefDescription(changeRequest: ChangeRequest): string {
  if (changeRequest.type === 'naming' && changeRequest.oldValue && changeRequest.newValue) {
    return `Rename ${changeRequest.oldValue} to ${changeRequest.newValue}`;
  }
  const desc = changeRequest.description.trim();
  return desc.length > 50 ? desc.substring(0, 47) + '...' : desc;
}

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

function generateActionPlan(
  tierName: TierName,
  changeRequest: ChangeRequest,
  scope: ChangeScope,
  assessment?: ScopeAssessment,
  _identifier?: string
): string[] {
  const plan: string[] = [];
  if (assessment?.requiresReplanning) {
    plan.push(`Re-plan ${tierName} using /plan-${tierName} (scope change is significant)`);
    plan.push(`Review updated ${tierName} guide and todos`);
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
    plan.push(`Update ${tierName} log with change request entry`);
    if (scope.tiersAffected.includes('session')) plan.push(`Update session handoff if change affects next steps`);
    if (scope.tiersAffected.includes('phase')) plan.push(`Update phase guide if change affects phase-level decisions`);
    if (tierName === 'task') plan.push(`Update task entry in session log if change affects task description`);
  }
  return plan;
}

function formatChangeEntry(
  tierName: TierName,
  identifier: string,
  changeRequest: ChangeRequest,
  scope: ChangeScope,
  actionPlan: string[],
  assessment?: ScopeAssessment
): string {
  const date = getCurrentDate();
  const filesList =
    scope.filesAffected.length > 0
      ? scope.filesAffected.map((f) => `- \`${f}\``).join('\n')
      : '- [Files will be identified during implementation]';
  const docsList =
    scope.documentationAffected.length > 0
      ? scope.documentationAffected.map((d) => `- ${d}`).join('\n')
      : tierName === 'task'
        ? '- Session Log (Task Entry)'
        : `${tierName.charAt(0).toUpperCase() + tierName.slice(1)} Log`;
  const tiersList = scope.tiersAffected.map((t) => `- [x] ${t.charAt(0).toUpperCase() + t.slice(1)}-level docs`).join('\n');
  const actionPlanList = actionPlan.map((step, i) => `${i + 1}. ${step}`).join('\n');
  const assessmentSection =
    assessment &&
    tierName !== 'task'
      ? `
### Scope Assessment
**Significance:** ${assessment.significance === 'significant' ? 'Significant (requires re-planning)' : 'Minor (direct todo update)'}
**Re-planning Required:** ${assessment.requiresReplanning ? 'Yes' : 'No'}
${assessment.reasons.length > 0 ? `**Reasons:**\n${assessment.reasons.map((r) => `- ${r}`).join('\n')}` : ''}
${assessment.suggestedPlanningCommand ? `**Suggested Planning Command:** \`/${assessment.suggestedPlanningCommand}\`` : ''}
`
      : '';

  const label = tierName.charAt(0).toUpperCase() + tierName.slice(1);
  if (tierName === 'task') {
    const sessionId = identifier.includes('.') ? identifier.split('.').slice(0, 2).join('.') : identifier;
    return `### Task Change Request: ${getBriefDescription(changeRequest)}

**Task:** ${identifier}
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

  return `## Change Request: ${getBriefDescription(changeRequest)}

**Type:** ${changeRequest.type.charAt(0).toUpperCase() + changeRequest.type.slice(1)}
**${label}:** ${identifier}
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

function formatChangeOutput(
  tierName: TierName,
  identifier: string,
  changeRequest: ChangeRequest,
  scope: ChangeScope,
  actionPlan: string[],
  assessment?: ScopeAssessment,
  planningOutput?: string,
  todosUpdated?: boolean
): string {
  const date = getCurrentDate();
  const filesList =
    scope.filesAffected.length > 0
      ? scope.filesAffected.map((f) => `- \`${f}\``).join('\n')
      : '- [Files will be identified during implementation]';
  const docsList =
    scope.documentationAffected.length > 0
      ? scope.documentationAffected.map((d) => `- ${d}`).join('\n')
      : tierName === 'task'
        ? '- Session Log (Task Entry)'
        : `${tierName.charAt(0).toUpperCase() + tierName.slice(1)} Log`;
  const tiersList = scope.tiersAffected.map((t) => `- [x] ${t.charAt(0).toUpperCase() + t.slice(1)}-level docs`).join('\n');
  const actionPlanList = actionPlan.map((step, i) => `${i + 1}. ${step}`).join('\n');
  const assessmentSection =
    assessment && tierName !== 'task'
      ? `
### Scope Assessment
**Significance:** ${assessment.significance === 'significant' ? 'Significant (requires re-planning)' : 'Minor (direct todo update)'}
**Re-planning Required:** ${assessment.requiresReplanning ? 'Yes' : 'No'}
${assessment.reasons.length > 0 ? `**Reasons:**\n${assessment.reasons.map((r) => `- ${r}`).join('\n')}` : ''}
${assessment.suggestedPlanningCommand ? `**Suggested Planning Command:** \`/${assessment.suggestedPlanningCommand}\`` : ''}
`
      : '';
  const planningSection = planningOutput ? `\n### Planning Output\n${planningOutput}\n` : '';
  const todosSection =
    todosUpdated && assessment
      ? `\n### Todos Updated\n✅ Todos have been ${assessment.requiresReplanning ? 'updated via planning command' : 'updated directly'}\n`
      : '';

  const label = tierName.charAt(0).toUpperCase() + tierName.slice(1);
  if (tierName === 'task') {
    const sessionId = identifier.includes('.') ? identifier.split('.').slice(0, 2).join('.') : identifier;
    return `## Task Change Request: ${getBriefDescription(changeRequest)}

**Task:** ${identifier}
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

  return `## Change Request: ${getBriefDescription(changeRequest)}

**Type:** ${changeRequest.type.charAt(0).toUpperCase() + changeRequest.type.slice(1)}
**${label}:** ${identifier}
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

✅ Change request recorded in ${tierName} log. ${assessment?.requiresReplanning ? 'Planning command executed. ' : ''}Ready to implement when approved.`;
}
