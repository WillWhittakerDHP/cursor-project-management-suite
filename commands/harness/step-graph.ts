/**
 * Kernel step graph: Pattern A — single orchestration step delegates to runTierStartWorkflow / runTierEndWorkflow.
 * Gate ordering stays authoritative in run-start-steps (getActiveSteps); do not duplicate here.
 */

import type { WorkflowSpec, StepDefinition, StepId } from './contracts';

const ORCHESTRATION_STEP: StepId = 'validate_identifier';

/** Minimal graph: one step where TierAdapter runs the full tier start/end orchestration. */
export function getStepGraph(_spec: WorkflowSpec): StepDefinition[] {
  return [
    {
      id: ORCHESTRATION_STEP,
      phase: 'main',
      requiredFor: ['start', 'end', 'reopen', 'plan', 'change', 'validate', 'checkpoint'],
      canFail: true,
    },
  ];
}
