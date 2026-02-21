/**
 * Shared tier plan: dispatches to phase-plan, plan-session, plan-task, plan-feature.
 * Mode gate is applied here (always plan mode); tier-specific plan impls do not add mode banners.
 */

import type { TierConfig } from './types';
import { modeGateText } from '../../utils/command-execution-mode';
import { planPhaseImpl } from '../phase/composite/plan-phase-impl';
import { planSessionImpl } from '../session/composite/plan-session-impl';
import { planTaskImpl } from '../task/composite/plan-task-impl';
import { planFeatureImpl } from '../feature/composite/plan-feature-impl';

const MODE_STEP_SEPARATOR = '\n\n---\n\n';

export async function runTierPlan(
  config: TierConfig,
  identifier: string,
  description?: string,
  featureName?: string
): Promise<string> {
  const gate = modeGateText('plan', `plan-${config.name}`);

  let result: string;
  switch (config.name) {
    case 'feature':
      result = await planFeatureImpl(identifier, description);
      break;
    case 'phase':
      result = await planPhaseImpl(identifier, description, featureName);
      break;
    case 'session':
      result = await planSessionImpl(identifier, description, featureName);
      break;
    case 'task':
      result = await planTaskImpl(identifier, description, featureName);
      break;
    default:
      result = '';
  }
  return gate + MODE_STEP_SEPARATOR + result;
}
