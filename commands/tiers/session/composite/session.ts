/**
 * Session tier composite: all session-level commands.
 */

import { runTierStart } from '../../shared/tier-start';
import { runTierEnd } from '../../shared/tier-end';
import { runTierPlan } from '../../shared/tier-plan';
import { runTierReopen } from '../../shared/tier-reopen';
import { runTierCheckpoint } from '../../shared/tier-checkpoint';
import { runTierComplete } from '../../shared/tier-complete';
import { runTierValidate } from '../../shared/tier-validate';
import { runTierChange } from '../../shared/tier-change';
import { SESSION_CONFIG } from '../../configs/session';
import type { CommandExecutionOptions } from '../../../utils/command-execution-mode';
import type { SessionEndOutcome, SessionEndParams, SessionEndResult } from './session-end-impl';
import type { MarkSessionCompleteParams as ImplParams } from './mark-session-complete-impl';
import type { ValidateSessionResult } from './validate-session-impl';
import type { ChangeRequest, ChangeScope } from '../../../utils/utils';
import { markComplete } from '../../task/atomic/mark-complete';
import { addTaskSection, type TaskSection } from '../../task/atomic/add-task-section';
import { updateNextAction } from '../../../utils/update-next-action';
import { updateTimestamp } from '../../../utils/update-timestamp';
import { resolveFeatureName } from '../../../utils';
import { generatePrompt } from '../../../utils/generate-prompt';

export type { SessionEndOutcome, SessionEndParams, SessionEndResult };
export type MarkSessionCompleteParams = ImplParams;
export type { ValidateSessionResult };

export interface ChangeRequestParams {
  description: string;
  sessionId: string;
  scope?: 'code-only' | 'docs-only' | 'both';
  tiers?: string[];
}

export interface ChangeRequestResult {
  success: boolean;
  changeRequest: ChangeRequest;
  scope: ChangeScope;
  actionPlan: string[];
  logEntry: string;
  output: string;
}

export interface UpdateHandoffParams {
  completedTasks?: string[];
  newTask?: TaskSection;
  nextAction?: string;
  sessionId: string;
  featureName?: string;
}

export interface NewAgentParams {
  nextSession: string;
  description: string;
  summary?: {
    accomplished: string[];
    next: string[];
    decisions: string[];
    blockers: string[];
  };
}

export async function sessionStart(
  sessionId: string,
  description?: string,
  options?: CommandExecutionOptions
): Promise<TierStartResult> {
  return runTierStart(SESSION_CONFIG, { sessionId, description }, options);
}

export async function sessionEnd(paramsOrId: SessionEndParams | string): Promise<SessionEndResult> {
  const params: SessionEndParams = typeof paramsOrId === 'string'
    ? { sessionId: paramsOrId, runTests: false }
    : paramsOrId;
  return runTierEnd(SESSION_CONFIG, params) as Promise<SessionEndResult>;
}

export async function planSession(
  sessionId: string,
  description?: string,
  featureName?: string,
  planContent?: string
): Promise<string> {
  return runTierPlan(SESSION_CONFIG, sessionId, description, featureName, planContent);
}

export async function sessionReopen(sessionId: string, reason?: string) {
  return runTierReopen(SESSION_CONFIG, { identifier: sessionId, reason });
}

export async function sessionCheckpoint(
  sessionId: string,
  featureName?: string
): Promise<string> {
  return runTierCheckpoint(SESSION_CONFIG, sessionId, featureName);
}

export async function markSessionComplete(params: MarkSessionCompleteParams): Promise<string> {
  return runTierComplete(SESSION_CONFIG, {
    tier: 'session',
    sessionId: params.sessionId,
    tasksCompleted: params.tasksCompleted,
    accomplishments: params.accomplishments,
    featureName: params.featureName,
  });
}

export async function validateSession(sessionId: string): Promise<ValidateSessionResult> {
  return runTierValidate(SESSION_CONFIG, sessionId);
}

export function formatSessionValidation(result: ValidateSessionResult, sessionId: string): string {
  const output: string[] = [];
  output.push(`# Session ${sessionId} Validation\n`);
  if (result.canStart) {
    output.push('✅ **Status:** Ready to start\n');
  } else {
    output.push(`❌ **Status:** Cannot start - ${result.reason}\n`);
  }
  output.push('## Details\n');
  result.details.forEach(detail => output.push(`- ${detail}`));
  return output.join('\n');
}

export async function validateSessionCommand(sessionId: string): Promise<string> {
  const validation = await validateSession(sessionId);
  return formatSessionValidation(validation, sessionId);
}

export async function changeRequest(
  params: ChangeRequestParams,
  featureName?: string
): Promise<ChangeRequestResult> {
  const result = await runTierChange(
    SESSION_CONFIG,
    {
      identifier: params.sessionId,
      description: params.description,
      scope: params.scope,
      tiers: params.tiers,
    },
    featureName,
    { replanCommand: (id, desc, f) => planSession(id, desc, f) }
  );
  return {
    success: result.success,
    changeRequest: result.changeRequest,
    scope: result.scope,
    actionPlan: result.actionPlan,
    logEntry: result.logEntry,
    output: result.output,
  };
}

export const midSessionChange = changeRequest;

export async function updateHandoff(params: UpdateHandoffParams): Promise<void> {
  const featureName = await resolveFeatureName(params.featureName);
  if (params.completedTasks) {
    for (const id of params.completedTasks) {
      await markComplete(id, featureName);
    }
  }
  if (params.newTask) {
    await addTaskSection(params.newTask, featureName);
  }
  if (params.nextAction) {
    await updateNextAction(params.nextAction, params.sessionId, featureName);
  }
  await updateTimestamp(params.sessionId, featureName);
}

export async function newAgent(params: NewAgentParams): Promise<{
  success: boolean;
  handoffUpdated: boolean;
  prompt: string;
  summary?: string;
}> {
  const handoffParams: UpdateHandoffParams = {
    nextAction: `Start Session ${params.nextSession}: ${params.description}`,
    sessionId: params.nextSession,
  };
  await updateHandoff(handoffParams);
  const prompt = await generatePrompt(params.nextSession, params.description);
  let summary: string | undefined;
  if (params.summary) {
    const summaryParts: string[] = [];
    if (params.summary.accomplished.length > 0) {
      summaryParts.push('## Accomplished:');
      summaryParts.push(...params.summary.accomplished.map(a => `- ${a}`));
    }
    if (params.summary.next.length > 0) {
      summaryParts.push('\n## Next:');
      summaryParts.push(...params.summary.next.map(n => `- ${n}`));
    }
    if (params.summary.decisions.length > 0) {
      summaryParts.push('\n## Key Decisions:');
      summaryParts.push(...params.summary.decisions.map(d => `- ${d}`));
    }
    if (params.summary.blockers.length > 0) {
      summaryParts.push('\n## Blockers/Questions:');
      summaryParts.push(...params.summary.blockers.map(b => `- ${b}`));
    }
    summary = summaryParts.join('\n');
  }
  return {
    success: true,
    handoffUpdated: true,
    prompt,
    summary,
  };
}
