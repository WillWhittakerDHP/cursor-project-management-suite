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

export interface RunStartAuditResult {
  output: string;
  /** true only when audit completed with no errors and overallStatus === 'pass' (no warns/fails). */
  clean: boolean;
}

/**
 * Run the start audit for the given tier. Returns output and clean (true only when pass; any warn/fail = not clean).
 * When not clean, the tier-start workflow should STOP and require fixes per governance before proceeding.
 */
export async function runStartAuditForTier(params: RunStartAuditParams): Promise<RunStartAuditResult> {
  const { tier, identifier, featureName: rawFeatureName } = params;
  const featureName = await resolveFeatureName(rawFeatureName);

  switch (tier) {
    case 'feature': {
      const result = await auditFeatureStart({ featureName: identifier });
      return {
        output: result.output,
        clean: result.success && result.auditResult.overallStatus === 'pass',
      };
    }
    case 'phase': {
      const result = await auditPhaseStart({ phase: identifier, featureName });
      return {
        output: result.output,
        clean: result.success && result.auditResult.overallStatus === 'pass',
      };
    }
    case 'session': {
      const result = await auditSessionStart({ sessionId: identifier, featureName });
      return {
        output: result.output,
        clean: result.success && result.auditResult.overallStatus === 'pass',
      };
    }
    case 'task': {
      const result = await auditTaskStart({ taskId: identifier, featureName });
      return {
        output: result.output,
        clean: result.success && result.auditResult.overallStatus === 'pass',
      };
    }
    default:
      return { output: '', clean: true };
  }
}
