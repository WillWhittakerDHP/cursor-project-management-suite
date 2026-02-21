/**
 * Shared tier start: dispatches to feature/phase/session/task start implementations.
 * Single entry point for tier start pipeline; each tier's logic remains in its composite.
 * Mode gate is applied here (generic); tier impls do not add mode messages.
 */

import type { TierConfig } from './types';
import {
  type CommandExecutionOptions,
  resolveCommandExecutionMode,
  cursorModeForExecution,
  modeGateText,
} from '../../utils/command-execution-mode';
import { featureStartImpl } from '../feature/composite/feature-start-impl';
import { phaseStartImpl } from '../phase/composite/phase-start-impl';
import { sessionStartImpl } from '../session/composite/session-start-impl';
import { taskStartImpl } from '../task/composite/task-start-impl';

export type TierStartParams =
  | { featureId: string }
  | { phaseId: string }
  | { sessionId: string; description?: string }
  | { taskId: string; featureId?: string };

const MODE_STEP_SEPARATOR = '\n\n---\n\n';

export async function runTierStart(
  config: TierConfig,
  params: TierStartParams,
  options?: CommandExecutionOptions
): Promise<string> {
  const executionMode = resolveCommandExecutionMode(options);
  const gate = modeGateText(cursorModeForExecution(executionMode), `${config.name}-start`);

  let result: string;
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
      result = '';
  }
  return gate + MODE_STEP_SEPARATOR + result;
}
