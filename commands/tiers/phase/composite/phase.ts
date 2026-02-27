/**
 * Phase tier composite: all phase-level commands.
 */

import { runTierStart } from '../../shared/tier-start';
import { runTierEnd } from '../../shared/tier-end';
import { runTierPlan } from '../../shared/tier-plan';
import { runTierReopen } from '../../shared/tier-reopen';
import { runTierCheckpoint } from '../../shared/tier-checkpoint';
import { runTierComplete } from '../../shared/tier-complete';
import { runTierValidate } from '../../shared/tier-validate';
import { runTierChange } from '../../shared/tier-change';
import { PHASE_CONFIG } from '../../configs/phase';
import type { CommandExecutionOptions } from '../../../utils/command-execution-mode';
import type { PhaseEndParams, PhaseEndResult } from './phase-end-impl';
import type { MarkPhaseCompleteParams as ImplParams } from './mark-phase-complete-impl';
import type { ValidatePhaseResult } from './validate-phase-impl';
import type { ChangeRequest, ChangeScope } from '../../../utils/utils';

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
  options?: CommandExecutionOptions
): Promise<TierStartResult> {
  return runTierStart(PHASE_CONFIG, { phaseId }, options);
}

export async function phaseEnd(paramsOrId: PhaseEndParams | string): Promise<PhaseEndResult> {
  if (typeof paramsOrId === 'string') {
    throw new Error(
      `phaseEnd requires a params object with completedSessions. ` +
      `Use: phaseEnd({ phaseId: '${paramsOrId}', completedSessions: [...] })`
    );
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
  });
}

export async function validatePhase(phase: string): Promise<ValidatePhaseResult> {
  return runTierValidate(PHASE_CONFIG, phase);
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

export async function validatePhaseCommand(phase: string): Promise<string> {
  const validation = await validatePhase(phase);
  return formatPhaseValidation(validation, phase);
}

export async function phaseChange(
  params: PhaseChangeRequestParams,
  featureName?: string
): Promise<PhaseChangeRequestResult> {
  const result = await runTierChange(
    PHASE_CONFIG,
    {
      identifier: params.phase,
      description: params.description,
      scope: params.scope,
      tiers: params.tiers,
    },
    featureName,
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
