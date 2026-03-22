/**
 * Single entry point for end audits used by the tier end workflow.
 * Dispatches to the composite audit for each tier (auditFeature, auditPhase, auditSession, auditTask).
 */

import type { TierName } from '../tiers/shared/types';
import type { AutofixResult, AuditStatus } from './types';
import { auditFeature } from './composite/audit-feature';
import { auditPhase } from './composite/audit-phase';
import { auditSession } from './composite/audit-session';
import { auditTask } from './composite/audit-task';
import { commitAuditReports } from './commit-audit-reports';
import { resolveFeatureDirectoryFromPlan } from '../utils';

export interface RunEndAuditParams {
  tier: TierName;
  identifier: string;
  /** Tier-specific params (for modifiedFiles, testResults, etc.). */
  params: unknown;
  featureName?: string;
  /** Pre-warmed audit promise from pipeline pre-warm step. */
  auditsComplete?: Promise<void>;
}

export interface RunEndAuditResult {
  output: string;
  autofixResult?: AutofixResult;
  /** For tier-end only: true only when overallStatus === 'pass'. Composites unchanged (warn still success there). */
  success?: boolean;
  /** Pass-through from composite auditResult; used by tier-end to stop on warn or fail (Option B). */
  overallStatus?: AuditStatus;
}

/**
 * Run the end audit for the given tier. Returns audit output and optional autofix result (committed in `stepAfterAudit`).
 * After reports are emitted, commits client/.audit-reports/ and feature audits dir.
 */
export async function runEndAuditForTier(params: RunEndAuditParams): Promise<RunEndAuditResult | string> {
  const { tier, identifier, params: rawParams, featureName: rawFeatureName, auditsComplete } = params;
  const featureName = await resolveFeatureDirectoryFromPlan(rawFeatureName);

  let out: RunEndAuditResult | string;

  switch (tier) {
    case 'feature': {
      const name = typeof identifier === 'string' ? identifier : featureName;
      const p = rawParams as { modifiedFiles?: string[]; testResults?: unknown };
      const result = await auditFeature({
        featureName: name,
        modifiedFiles: p?.modifiedFiles,
        testResults: p?.testResults,
        auditsComplete,
      });
      const status = (result as { auditResult?: { overallStatus?: AuditStatus } }).auditResult?.overallStatus;
      out = {
        output: result.output,
        autofixResult: result.autofixResult,
        success: status === 'pass',
        overallStatus: status,
      };
      break;
    }
    case 'phase': {
      const p = rawParams as { modifiedFiles?: string[]; testResults?: unknown };
      const result = await auditPhase({
        phase: identifier,
        featureName,
        modifiedFiles: p?.modifiedFiles,
        testResults: p?.testResults,
        auditsComplete,
      });
      const status = (result as { auditResult?: { overallStatus?: AuditStatus } }).auditResult?.overallStatus;
      out = {
        output: result.output,
        autofixResult: result.autofixResult,
        success: status === 'pass',
        overallStatus: status,
      };
      break;
    }
    case 'session': {
      const p = rawParams as { modifiedFiles?: string[]; testResults?: unknown };
      const result = await auditSession({
        sessionId: identifier,
        featureName,
        modifiedFiles: p?.modifiedFiles,
        testResults: p?.testResults,
        auditsComplete,
      });
      const status = (result as { auditResult?: { overallStatus?: AuditStatus } }).auditResult?.overallStatus;
      out = {
        output: result.output,
        autofixResult: result.autofixResult,
        success: status === 'pass',
        overallStatus: status,
      };
      break;
    }
    case 'task': {
      const p = rawParams as { modifiedFiles?: string[]; testResults?: unknown };
      const result = await auditTask({
        taskId: identifier,
        featureName,
        modifiedFiles: p?.modifiedFiles,
        testResults: p?.testResults,
        auditsComplete,
      });
      const status = (result as { auditResult?: { overallStatus?: AuditStatus } }).auditResult?.overallStatus;
      out = {
        output: result.output,
        autofixResult: result.autofixResult,
        success: status === 'pass',
        overallStatus: status,
      };
      break;
    }
    default:
      return { output: '' };
  }

  await commitAuditReports({ featureName });
  return out;
}
