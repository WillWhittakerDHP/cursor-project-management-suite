/**
 * Phase tier composite: all phase-level commands.
 */

import { runTierStart } from '../../shared/tier-start';
import { runTierEnd } from '../../shared/tier-end';
import { runTierPlan } from '../../shared/tier-plan';
import { runTierReopen } from '../../shared/tier-reopen';
import { runTierCheckpoint } from '../../shared/tier-checkpoint';
import { runTierComplete } from '../../shared/tier-complete';
import { runTierValidate, type TierValidateOptions } from '../../shared/tier-validate';
import { runTierChange } from '../../../utils/change-request';
import { PHASE_CONFIG } from '../../configs/phase';
import type { CommandExecutionOptions } from '../../../utils/command-execution-mode';
import type { PhaseEndParams, PhaseEndResult } from './phase-end-impl';
import type { MarkPhaseCompleteParams as ImplParams } from './mark-phase-complete-impl';
import type { ValidatePhaseResult } from './validate-phase-impl';
import type { ChangeRequest, ChangeScope } from '../../../utils/change-request';
import { TierStartResult } from '../../../utils/tier-outcome';
import { getCompletedSessionsInPhase } from '../../../utils/phase-session-utils';
import { resolveWorkflowScope } from '../../../utils/workflow-scope';

export type { PhaseEndParams, PhaseEndResult };
export type MarkPhaseCompleteParams = ImplParams;
export type { ValidatePhaseResult };

export interface PhaseChangeRequestParams {
  description: string;
  phase: string;
  scope?: 'code-only' | 'docs-only' | 'both';
  tiers?: string[];
}

export interface PhaseChangeRequestResult {
  success: boolean;
  changeRequest: ChangeRequest;
  scope: ChangeScope;
  actionPlan: string[];
  logEntry: string;
  output: string;
}

export async function phaseStart(
  phaseId: string,
  featureRef: string,
  options?: CommandExecutionOptions
): Promise<TierStartResult> {
  return runTierStart(PHASE_CONFIG, { phaseId, featureId: featureRef.trim() }, options);
}

export async function phaseEnd(
  paramsOrId: PhaseEndParams | string,
  featureRef?: string
): Promise<PhaseEndResult> {
  if (typeof paramsOrId === 'string') {
    const raw = (featureRef ?? '').trim();
    if (!raw) {
      throw new Error(
        'phaseEnd(phaseId, featureRef): second argument featureRef is required (numeric # or feature directory slug from PROJECT_PLAN).'
      );
    }
    const { featureName } = await resolveWorkflowScope({
      mode: 'fromTierParams',
      tier: 'phase',
      params: { phaseId: paramsOrId, featureId: raw },
    });
    const completedSessions = await getCompletedSessionsInPhase(featureName, paramsOrId);
    return runTierEnd(PHASE_CONFIG, {
      phaseId: paramsOrId,
      completedSessions,
      featureId: raw,
    }) as Promise<PhaseEndResult>;
  }
  return runTierEnd(PHASE_CONFIG, paramsOrId) as Promise<PhaseEndResult>;
}

export async function planPhase(
  phaseId: string,
  description?: string,
  featureId?: string,
  planContent?: string
): Promise<string> {
  return runTierPlan(PHASE_CONFIG, phaseId, description, featureId, planContent);
}

export async function phaseReopen(phaseId: string, reason?: string) {
  return runTierReopen(PHASE_CONFIG, { identifier: phaseId, reason });
}

export async function phaseCheckpoint(
  phase: string,
  featureName?: string
): Promise<string> {
  return runTierCheckpoint(PHASE_CONFIG, phase, featureName);
}

export async function markPhaseComplete(params: MarkPhaseCompleteParams): Promise<string> {
  return runTierComplete(PHASE_CONFIG, {
    tier: 'phase',
    phase: params.phase,
    sessionsCompleted: params.sessionsCompleted,
    totalTasks: params.totalTasks,
    ...(params.featureId?.trim() ? { featureId: params.featureId.trim() } : {}),
    ...(params.featureName?.trim() ? { featureName: params.featureName.trim() } : {}),
  });
}

export async function validatePhase(
  phase: string,
  options?: TierValidateOptions
): Promise<ValidatePhaseResult> {
  return runTierValidate(PHASE_CONFIG, phase, options);
}

export function formatPhaseValidation(result: ValidatePhaseResult, phase: string): string {
  const output: string[] = [];
  output.push(`# Phase ${phase} Validation\n`);
  if (result.canStart) {
    output.push('✅ **Status:** Ready to start\n');
  } else {
    output.push(`❌ **Status:** Cannot start - ${result.reason}\n`);
  }
  output.push('## Details\n');
  result.details.forEach(detail => output.push(`- ${detail}`));
  return output.join('\n');
}

export async function validatePhaseCommand(
  phase: string,
  options?: TierValidateOptions
): Promise<string> {
  const validation = await validatePhase(phase, options);
  return formatPhaseValidation(validation, phase);
}

export async function phaseChange(
  params: PhaseChangeRequestParams,
  featureRef: string
): Promise<PhaseChangeRequestResult> {
  const result = await runTierChange(
    PHASE_CONFIG,
    {
      identifier: params.phase,
      description: params.description,
      scope: params.scope,
      tiers: params.tiers,
    },
    featureRef,
    { replanCommand: (id, desc, f) => planPhase(id, desc, f) }
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
