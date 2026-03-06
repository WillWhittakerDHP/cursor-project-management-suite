/**
 * Deterministic step graph for harness kernel (charter §7.2).
 * Step order and dependencies are fixed per action (start | end).
 */

import type { WorkflowSpec, StepDefinition, StepId, Action, ExecutionMode } from './contracts';

const START_STEPS: StepId[] = [
  'validate_identifier',
  'preflight',
  'load_context',
  'gather_context',
  'plan_gate',
  'branch_ops',
  'doc_sync',
  'audit_ops',
  'scope_update',
  'cascade_eval',
  'finalize',
];

const END_STEPS: StepId[] = [
  'validate_identifier',
  'preflight',
  'plan_gate',
  'load_context',
  'branch_ops',
  'doc_sync',
  'test_ops',
  'audit_ops',
  'scope_update',
  'cascade_eval',
  'finalize',
];

function stepDef(
  id: StepId,
  phase: 'pre' | 'main' | 'post',
  requiredFor: Action[],
  canFail: boolean,
  requiresMode?: ExecutionMode,
  dependsOn?: StepId[]
): StepDefinition {
  return {
    id,
    phase,
    requiredFor,
    canFail,
    ...(requiresMode !== undefined && { requiresMode }),
    ...(dependsOn !== undefined && dependsOn.length > 0 && { dependsOn }),
  };
}

function getStepMeta(id: StepId): { phase: 'pre' | 'main' | 'post'; canFail: boolean } {
  const phase: 'pre' | 'main' | 'post' =
    id === 'validate_identifier' || id === 'preflight' ? 'pre' : id === 'finalize' ? 'post' : 'main';
  const canFail = id === 'preflight' || id === 'scope_update';
  return { phase, canFail };
}

/** Build deterministic step graph for the given spec. Same spec always returns same graph. */
export function getStepGraph(spec: WorkflowSpec): StepDefinition[] {
  const action = spec.action;
  const stepIds = action === 'start' ? START_STEPS : END_STEPS;
  const steps: StepDefinition[] = [];
  for (const id of stepIds) {
    const { phase, canFail } = getStepMeta(id);
    steps.push(stepDef(id, phase, [action], canFail));
  }
  return steps;
}

/** Ordered step IDs for the action (for checksum / stepPath). */
export function getStepIdsForAction(action: Action): StepId[] {
  return action === 'start' ? [...START_STEPS] : [...END_STEPS];
}
