/**
 * Shared tier checkpoint: dispatches to phase/session/feature checkpoint.
 */

import type { TierConfig } from './types';
import { resolveFeatureName } from '../../utils';
import { phaseCheckpointImpl } from '../phase/composite/phase-checkpoint-impl';
import { sessionCheckpointImpl } from '../session/composite/session-checkpoint-impl';
import { featureCheckpoint } from '../feature/atomic/feature-checkpoint';
import { checkpoint as checkpointIsland } from '../../checkpoint/composite/checkpoint';

/**
 * Run tier checkpoint. Wires island module checkpoint/ for task tier.
 */
export async function runTierCheckpoint(
  config: TierConfig,
  identifier: string,
  featureName?: string
): Promise<string> {
  const resolved = await resolveFeatureName(featureName);

  switch (config.name) {
    case 'feature':
      return featureCheckpoint(identifier);
    case 'phase':
      return phaseCheckpointImpl(identifier, resolved);
    case 'session':
      return sessionCheckpointImpl(identifier, resolved);
    case 'task':
      return checkpointIsland('task', identifier, resolved);
    default:
      return Promise.resolve('');
  }
}
