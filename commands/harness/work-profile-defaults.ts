/**
 * Default WorkProfile resolver: maps tier + action to coarse WorkProfile when none supplied.
 * Does not infer scope from branch state. WorkProfile is additive; WorkflowCommandContext owns scope.
 */

import type { Tier } from './contracts';
import type { WorkProfile } from './work-profile';

type TierAction = 'start' | 'end';

/** Map tier + action to default WorkProfile. Tier-end stays conservative until behavior is moved. */
export function getDefaultWorkProfile(tier: Tier, action: TierAction): WorkProfile {
  if (action === 'end') {
    return {
      executionIntent: 'document',
      actionType: 'continuity_handoff',
      scopeShape: 'tier_document',
      governanceDomains: ['docs'],
      decompositionMode: 'light',
    };
  }

  switch (tier) {
    case 'feature':
      return {
        executionIntent: 'plan',
        actionType: 'decomposition',
        scopeShape: 'architectural',
        governanceDomains: ['docs', 'architecture'],
        contextPack: 'decomposition_pack',
        planningArtifactAction: 'create',
        decompositionMode: 'light',
      };
    case 'phase':
      return {
        executionIntent: 'plan',
        actionType: 'decomposition',
        scopeShape: 'architectural',
        governanceDomains: ['docs', 'architecture'],
        contextPack: 'decomposition_pack',
        planningArtifactAction: 'create',
        decompositionMode: 'light',
      };
    case 'session':
      return {
        executionIntent: 'plan',
        actionType: 'decomposition',
        scopeShape: 'cross_cutting',
        governanceDomains: ['docs', 'architecture'],
        contextPack: 'decomposition_pack',
        planningArtifactAction: 'create',
        decompositionMode: 'moderate',
      };
    case 'task':
      return {
        executionIntent: 'implement',
        actionType: 'localized_change',
        scopeShape: 'file_local',
        governanceDomains: ['function'],
        contextPack: 'local_implementation_pack',
        planningArtifactAction: 'update',
        decompositionMode: 'moderate',
      };
    default:
      return {
        executionIntent: 'plan',
        actionType: 'decomposition',
        scopeShape: 'architectural',
        governanceDomains: ['docs'],
        decompositionMode: 'light',
      };
  }
}
