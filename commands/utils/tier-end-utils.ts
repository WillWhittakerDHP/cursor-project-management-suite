/**
 * Shared utilities for tier end commands (session-end, phase-end, feature-end, task-end).
 * Reduces duplication of runTests resolution and plan-mode result construction.
 */

import { buildTierEndOutcome, type TierEndOutcome } from './tier-outcome';
import { TEST_CONFIG } from '../testing/utils/test-config';

const RUN_TESTS_REQUIRED_MESSAGE =
  'Set runTests (true/false) via user prompt before calling session-end, then re-run.';

export interface ResolveRunTestsOptions {
  /** When true, params.runTests === undefined returns a blocked outcome (session-end). Default false. */
  requireExplicit?: boolean;
}

export interface ResolveRunTestsResult {
  shouldRunTests: boolean;
  blockedOutcome: TierEndOutcome | null;
}

/**
 * Resolves whether tests should run and whether the command is blocked (e.g. runTests required but undefined).
 */
export function resolveRunTests(
  params: { runTests?: boolean },
  options?: ResolveRunTestsOptions
): ResolveRunTestsResult {
  const { requireExplicit = false } = options ?? {};
  if (!TEST_CONFIG.enabled) {
    return { shouldRunTests: false, blockedOutcome: null };
  }
  if (requireExplicit && params.runTests === undefined) {
    return {
      shouldRunTests: false,
      blockedOutcome: buildTierEndOutcome('blocked_needs_input', 'run_tests_required', RUN_TESTS_REQUIRED_MESSAGE),
    };
  }
  return {
    shouldRunTests: params.runTests ?? TEST_CONFIG.defaultRunTests,
    blockedOutcome: null,
  };
}

export interface BuildPlanModeResultReturn {
  steps: Record<string, { success: boolean; output: string }>;
  outcome: TierEndOutcome;
}

/**
 * Builds the plan step and outcome for tier end commands in plan mode.
 */
export function buildPlanModeResult(
  planSteps: string[],
  nextAction: string
): BuildPlanModeResultReturn {
  return {
    steps: {
      plan: { success: true, output: planSteps.join('\n') },
    },
    outcome: buildTierEndOutcome('completed', 'plan', nextAction),
  };
}
