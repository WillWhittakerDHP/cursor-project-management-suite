/**
 * Single entry point for start audits used by the tier start workflow.
 * Dispatches to feature/phase/session/task start audit composites.
 */

import type { TierName } from '../tiers/shared/types';
import { auditFeatureStart } from './composite/audit-feature-start';
import { auditPhaseStart } from './composite/audit-phase-start';
import { auditSessionStart } from './composite/audit-session-start';
import { auditTaskStart } from './composite/audit-task-start';
import { resolveFeatureName } from '../utils';

export interface RunStartAuditParams {
  tier: TierName;
  identifier: string;
  featureName?: string;
}

/**
 * Run the start audit for the given tier. Returns the audit output string to append to workflow.
 */
export async function runStartAuditForTier(params: RunStartAuditParams): Promise<string> {
  const { tier, identifier, featureName: rawFeatureName } = params;
  const featureName = await resolveFeatureName(rawFeatureName);

  switch (tier) {
    case 'feature': {
      const result = await auditFeatureStart({ featureName: identifier });
      return result.output;
    }
    case 'phase': {
      const result = await auditPhaseStart({ phase: identifier, featureName });
      return result.output;
    }
    case 'session': {
      const result = await auditSessionStart({ sessionId: identifier, featureName });
      return result.output;
    }
    case 'task': {
      const result = await auditTaskStart({ taskId: identifier, featureName });
      return result.output;
    }
    default:
      return '';
  }
}
