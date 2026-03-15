/**
 * Unified Change Request API
 *
 * Single module for parsing, scoping, assessment, orchestration, and formatting
 * of tier change requests (phase/session/task). Consolidates logic previously in
 * utils/utils.ts, utils/assess-change-scope.ts, and tiers/shared/tier-change.ts.
 */

import { execSync } from 'child_process';
import type { TierConfig, TierName } from '../tiers/shared/types';
import { resolveFeatureName } from './feature-context';
import { WorkflowCommandContext } from './command-context';
import { getCurrentDate, PROJECT_ROOT, FRONTEND_ROOT } from './utils';
import { modeGateText } from './command-execution-mode';

// ─── Types ─────────────────────────────────────────────────────────────────

export type ChangeRequestType = 'naming' | 'refactoring' | 'architectural' | 'other';

export interface ChangeRequest {
  type: ChangeRequestType;
  description: string;
  directive: string;
  oldValue?: string;
  newValue?: string;
  tiersAffected: string[];
  scope: 'code-only' | 'docs-only' | 'both';
}

export interface ChangeScope {
  filesAffected: string[];
  documentationAffected: string[];
  tiersAffected: string[];
}

export type ScopeChangeSignificance = 'significant' | 'minor';

export interface ScopeAssessment {
  significance: ScopeChangeSignificance;
  requiresReplanning: boolean;
  reasons: string[];
  suggestedPlanningCommand?: 'phase-plan' | 'plan-session' | 'plan-feature';
}

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

// ─── Parsing ───────────────────────────────────────────────────────────────

/**
 * Parse conversational change request into structured format.
 */
export function parseChangeRequest(description: string): ChangeRequest {
  const lowerDesc = description.toLowerCase();

  let type: ChangeRequestType = 'other';
  if (lowerDesc.includes('rename') || lowerDesc.includes('name') || lowerDesc.includes('naming')) {
    type = 'naming';
  } else if (lowerDesc.includes('refactor') || lowerDesc.includes('restructure')) {
    type = 'refactoring';
  } else if (lowerDesc.includes('architect') || lowerDesc.includes('pattern') || lowerDesc.includes('design')) {
    type = 'architectural';
  }

  let oldValue: string | undefined;
  let newValue: string | undefined;

  if (type === 'naming') {
    const renamePatterns = [
      /rename\s+(\w+)\s+to\s+(\w+)/i,
      /(\w+)\s+to\s+(\w+)/i,
      /(\w+)\s+→\s+(\w+)/i,
      /change\s+(\w+)\s+to\s+(\w+)/i,
    ];
    for (const pattern of renamePatterns) {
      const match = description.match(pattern);
      if (match) {
        oldValue = match[1];
        newValue = match[2];
        break;
      }
    }
  }

  const directive = generateDirective(description, type, oldValue, newValue);
  const scope: 'code-only' | 'docs-only' | 'both' =
    lowerDesc.includes('code-only') ? 'code-only'
      : lowerDesc.includes('docs-only') || lowerDesc.includes('documentation-only') ? 'docs-only'
        : 'both';
  const tiersAffected = ['session'];

  return {
    type,
    description,
    directive,
    oldValue,
    newValue,
    tiersAffected,
    scope,
  };
}

function generateDirective(
  description: string,
  type: ChangeRequestType,
  oldValue?: string,
  newValue?: string
): string {
  if (type === 'naming' && oldValue && newValue) {
    return `Rename \`${oldValue}\` to \`${newValue}\` throughout the codebase for consistency and better naming clarity.`;
  }
  let directive = description.trim();
  if (directive.length > 0) {
    directive = directive.charAt(0).toUpperCase() + directive.slice(1);
    if (!directive.endsWith('.') && !directive.endsWith('!') && !directive.endsWith('?')) {
      directive += '.';
    }
  }
  return directive;
}

// ─── Scoping ───────────────────────────────────────────────────────────────

/**
 * Identify scope of change impact (files, docs, tiers).
 */
export async function identifyChangeScope(changeRequest: ChangeRequest): Promise<ChangeScope> {
  const filesAffected: string[] = [];
  const documentationAffected: string[] = [];
  const tiersAffected = [...changeRequest.tiersAffected];

  if (changeRequest.type === 'naming' && changeRequest.oldValue) {
    try {
      const searchResult = execSync(
        `grep -r --include="*.ts" --include="*.tsx" --include="*.vue" --include="*.js" --include="*.jsx" -l "${changeRequest.oldValue}" "${FRONTEND_ROOT}/" 2>/dev/null || true`,
        { encoding: 'utf-8', cwd: PROJECT_ROOT }
      );
      const files = searchResult.trim().split('\n').filter((f) => f.length > 0);
      filesAffected.push(...files);
    } catch (_error) {
      console.warn(
        `Could not search for files containing ${changeRequest.oldValue}: ${_error instanceof Error ? _error.message : String(_error)}`
      );
    }
  }

  if (tiersAffected.includes('session')) {
    documentationAffected.push('Session Log');
    documentationAffected.push('Session Handoff');
  }
  if (tiersAffected.includes('phase')) {
    documentationAffected.push('Phase Guide');
    documentationAffected.push('Phase Log');
  }
  if (tiersAffected.includes('task')) {
    documentationAffected.push('Task entries in session log');
  }

  return {
    filesAffected,
    documentationAffected,
    tiersAffected,
  };
}

// ─── Assessment ────────────────────────────────────────────────────────────

/**
 * Assess if a change request requires re-planning vs. direct doc updates.
 */
export function assessChangeScope(
  changeRequest: ChangeRequest,
  scope: ChangeScope,
  tier: 'session' | 'phase' | 'feature'
): ScopeAssessment {
  const reasons: string[] = [];
  let requiresReplanning = false;
  let suggestedPlanningCommand: 'phase-plan' | 'plan-session' | 'plan-feature' | undefined;

  if (changeRequest.type === 'architectural') {
    requiresReplanning = true;
    reasons.push('Architectural changes require re-planning to ensure consistency');
    suggestedPlanningCommand = tier === 'phase' ? 'phase-plan' : tier === 'session' ? 'plan-session' : 'plan-feature';
  }

  if (scope.tiersAffected.length > 1) {
    requiresReplanning = true;
    reasons.push(`Change affects multiple tiers: ${scope.tiersAffected.join(', ')}`);
    if (scope.tiersAffected.includes('phase')) {
      suggestedPlanningCommand = 'phase-plan';
    } else if (scope.tiersAffected.includes('session')) {
      suggestedPlanningCommand = 'plan-session';
    } else {
      suggestedPlanningCommand = 'plan-feature';
    }
  }

  const descriptionLower = changeRequest.description.toLowerCase();
  const newTaskKeywords = ['add task', 'new task', 'create task', 'introduce task', 'additional task'];
  const removeTaskKeywords = ['remove task', 'delete task', 'drop task', 'eliminate task', 'cancel task'];
  const dependencyKeywords = ['dependency', 'depends on', 'requires', 'needs', 'prerequisite'];
  const structureKeywords = ['restructure', 'reorganize', 'reorder', 'change structure', 'modify structure'];

  if (newTaskKeywords.some((keyword) => descriptionLower.includes(keyword))) {
    requiresReplanning = true;
    reasons.push('Change adds new tasks, requiring session/phase re-planning');
    suggestedPlanningCommand = tier === 'phase' ? 'phase-plan' : 'plan-session';
  }
  if (removeTaskKeywords.some((keyword) => descriptionLower.includes(keyword))) {
    requiresReplanning = true;
    reasons.push('Change removes tasks, requiring session/phase re-planning');
    suggestedPlanningCommand = tier === 'phase' ? 'phase-plan' : 'plan-session';
  }
  if (dependencyKeywords.some((keyword) => descriptionLower.includes(keyword))) {
    requiresReplanning = true;
    reasons.push('Change affects dependencies, requiring re-planning');
    suggestedPlanningCommand = tier === 'phase' ? 'phase-plan' : 'plan-session';
  }
  if (structureKeywords.some((keyword) => descriptionLower.includes(keyword))) {
    requiresReplanning = true;
    reasons.push('Change modifies structure, requiring re-planning');
    suggestedPlanningCommand = tier === 'phase' ? 'phase-plan' : tier === 'session' ? 'plan-session' : 'plan-feature';
  }

  if (scope.filesAffected.length > 10) {
    requiresReplanning = true;
    reasons.push(`Change affects ${scope.filesAffected.length} files, suggesting significant scope`);
    suggestedPlanningCommand = tier === 'phase' ? 'phase-plan' : 'plan-session';
  }
  if (changeRequest.type === 'refactoring' && scope.filesAffected.length > 5) {
    requiresReplanning = true;
    reasons.push('Refactoring affects multiple files, may require re-planning');
    suggestedPlanningCommand = tier === 'phase' ? 'phase-plan' : 'plan-session';
  }

  if (reasons.length === 0) {
    reasons.push('Change is localized and does not affect planning structure');
  }

  return {
    significance: requiresReplanning ? 'significant' : 'minor',
    requiresReplanning,
    reasons,
    suggestedPlanningCommand,
  };
}

// ─── Formatting helpers (private) ───────────────────────────────────────────

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
    assessment && tierName !== 'task'
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

// ─── Orchestration ────────────────────────────────────────────────────────

/**
 * Run the change-request flow for any tier (phase, session, task).
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
