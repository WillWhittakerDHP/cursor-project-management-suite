/**
 * Shared tier start: dispatches to feature/phase/session/task start implementations.
 * Single entry point for tier start pipeline; each tier's logic remains in its composite.
 * Mode gate is applied here (generic); tier impls do not add mode messages.
 *
 * Preflight checks (e.g. ensureAppRunning) are executed here in the orchestrator,
 * keeping infrastructure concerns out of individual tier impls.
 */

import type { TierConfig } from './types';
import {
  type CommandExecutionOptions,
  resolveCommandExecutionMode,
  cursorModeForExecution,
  modeGateText,
  isPlanMode,
  enforceModeSwitch,
} from '../../utils/command-execution-mode';
import type { TierStartResult } from '../../utils/tier-outcome';
import { verifyApp } from '../../utils/verify-app';
import { featureStartImpl } from '../feature/composite/feature-start-impl';
import { phaseStartImpl } from '../phase/composite/phase-start-impl';
import { sessionStartImpl } from '../session/composite/session-start-impl';
import { taskStartImpl } from '../task/composite/task-start-impl';

export type TierStartParams =
  | { featureId: string }
  | { phaseId: string }
  | { sessionId: string; description?: string }
  | { taskId: string; featureId?: string };

export async function runTierStart(
  config: TierConfig,
  params: TierStartParams,
  options?: CommandExecutionOptions
): Promise<TierStartResult> {
  const executionMode = resolveCommandExecutionMode(options, 'plan');
  const gate = modeGateText(cursorModeForExecution(executionMode), `${config.name}-start`);

  if (config.preflight?.ensureAppRunning?.onStart && !isPlanMode(executionMode)) {
    const appCheck = await verifyApp();
    if (!appCheck.success) {
      return {
        success: false,
        output: appCheck.output,
        outcome: {
          status: 'blocked',
          reasonCode: 'app_not_running',
          nextAction: appCheck.output,
        },
        modeGate: gate,
      };
    }
  }

  let result: TierStartResult;
  try {
    switch (config.name) {
      case 'feature':
        result = await featureStartImpl((params as { featureId: string }).featureId, options);
        break;
      case 'phase':
        result = await phaseStartImpl((params as { phaseId: string }).phaseId, options);
        break;
      case 'session': {
        const p = params as { sessionId: string; description?: string };
        result = await sessionStartImpl(p.sessionId, p.description, options);
        break;
      }
      case 'task': {
        const p = params as { taskId: string; featureId?: string };
        result = await taskStartImpl(p.taskId, p.featureId, options);
        break;
      }
      default:
        result = {
          success: false,
          output: '',
          outcome: { status: 'failed', reasonCode: 'unknown_tier', nextAction: 'Unknown tier.' },
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result = {
      success: false,
      output: `**${config.name}-start failed with unhandled error:**\n\n\`\`\`\n${message}\n\`\`\``,
      outcome: {
        status: 'failed',
        reasonCode: 'unhandled_error',
        nextAction: `Unhandled error in ${config.name}-start. See playbook: "On command crash".`,
      },
    };
  }
  const needsPlanFirst = !result.success
    || result.outcome?.cascade != null;
  const enforcedMode = needsPlanFirst ? 'plan' as const : cursorModeForExecution(executionMode);
  const enforcement = enforceModeSwitch(
    enforcedMode,
    `${config.name}-start`,
    result.success ? 'normal' : 'failure'
  );
  return {
    ...result,
    output: enforcement.text + '\n\n---\n\n' + result.output,
    modeGate: gate,
  };
}
