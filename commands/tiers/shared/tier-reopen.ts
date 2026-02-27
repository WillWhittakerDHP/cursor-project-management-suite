/**
 * Shared tier reopen: flips a completed tier back to Reopened so additional child work can be added.
 * Dispatches to tier-specific impls (feature, phase, session). Task reopen not supported.
 */

import type { TierConfig } from './types';
import { modeGateText, cursorModeForExecution, enforceModeSwitch } from '../../utils/command-execution-mode';
import type { TierReopenParams, TierReopenResult } from './tier-reopen-workflow';
import { featureReopenImpl } from '../feature/composite/feature-reopen-impl';
import { phaseReopenImpl } from '../phase/composite/phase-reopen-impl';
import { sessionReopenImpl } from '../session/composite/session-reopen-impl';

export type { TierReopenParams, TierReopenResult };

export async function runTierReopen(
  config: TierConfig,
  params: TierReopenParams
): Promise<TierReopenResult> {
  const gate = modeGateText(cursorModeForExecution('execute'), `${config.name}-reopen`);

  let result: TierReopenResult;
  try {
    switch (config.name) {
      case 'feature':
        result = await featureReopenImpl(params, gate);
        break;
      case 'phase':
        result = await phaseReopenImpl(params, gate);
        break;
      case 'session':
        result = await sessionReopenImpl(params, gate);
        break;
      case 'task':
        result = {
          success: false,
          output: 'Task reopen is not supported. Reopen the session to add or change tasks.',
          previousStatus: '',
          newStatus: '',
          modeGate: gate,
        };
        break;
      default:
        result = {
          success: false,
          output: `Unknown tier: ${config.name}`,
          previousStatus: '',
          newStatus: '',
          modeGate: gate,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result = {
      success: false,
      output: `Reopen failed: ${message}`,
      previousStatus: '',
      newStatus: '',
      modeGate: gate,
    };
  }

  const enforcedMode = 'plan' as const;
  const enforcement = enforceModeSwitch(
    enforcedMode,
    `${config.name}-reopen`,
    result.success ? 'normal' : 'failure'
  );
  return {
    ...result,
    output: enforcement.text + '\n\n---\n\n' + result.output,
  };
}
