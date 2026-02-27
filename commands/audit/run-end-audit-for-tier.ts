/**
 * Single entry point for end audits used by the tier end workflow.
 * Dispatches to the composite audit for each tier (auditFeature, auditPhase, auditSession, auditTask).
 */

import type { TierName } from '../tiers/shared/types';
import type { AutofixResult } from './types';
import { auditFeature } from './composite/audit-feature';
import { auditPhase } from './composite/audit-phase';
import { auditSession } from './composite/audit-session';
import { auditTask } from './composite/audit-task';
import { resolveFeatureName } from '../utils';

export interface RunEndAuditParams {
  tier: TierName;
  identifier: string;
  /** Tier-specific params (for modifiedFiles, testResults, etc.). */
  params: unknown;
  featureName?: string;
}

export interface RunEndAuditResult {
  output: string;
  autofixResult?: AutofixResult;
}

/**
 * Run the end audit for the given tier. Returns audit output and optional autofix result for runAfterAudit.
 */
export async function runEndAuditForTier(params: RunEndAuditParams): Promise<RunEndAuditResult | string> {
  const { tier, identifier, params: rawParams, featureName: rawFeatureName } = params;
  const featureName = await resolveFeatureName(rawFeatureName);

  switch (tier) {
    case 'feature': {
      const name = typeof identifier === 'string' ? identifier : featureName;
      const p = rawParams as { modifiedFiles?: string[]; testResults?: unknown };
      const result = await auditFeature({
        featureName: name,
        modifiedFiles: p?.modifiedFiles,
        testResults: p?.testResults,
      });
      return { output: result.output, autofixResult: result.autofixResult };
    }
    case 'phase': {
      const p = rawParams as { modifiedFiles?: string[]; testResults?: unknown };
      const result = await auditPhase({
        phase: identifier,
        featureName,
        modifiedFiles: p?.modifiedFiles,
        testResults: p?.testResults,
      });
      return { output: result.output, autofixResult: result.autofixResult };
    }
    case 'session': {
      const p = rawParams as { modifiedFiles?: string[]; testResults?: unknown };
      const result = await auditSession({
        sessionId: identifier,
        featureName,
        modifiedFiles: p?.modifiedFiles,
        testResults: p?.testResults,
      });
      return { output: result.output, autofixResult: result.autofixResult };
    }
    case 'task': {
      const p = rawParams as { modifiedFiles?: string[]; testResults?: unknown };
      const result = await auditTask({
        taskId: identifier,
        featureName,
        modifiedFiles: p?.modifiedFiles,
        testResults: p?.testResults,
      });
      return { output: result.output, autofixResult: result.autofixResult };
    }
    default:
      return { output: '' };
  }
}
