/**
 * Atomic Audit: Code Quality (Deterministic Audits)
 *
 * @deprecated Use auditTierQuality from audit-tier-quality.ts with the appropriate tier.
 * This module is a thin wrapper for backward compatibility.
 */

import type { AuditParams, AuditResult } from '../types';
import { auditTierQuality } from './audit-tier-quality';

/**
 * Run code quality audit. Delegates to tier-quality using params.tier (defaults to phase).
 */
export async function auditCodeQuality(params: AuditParams): Promise<AuditResult> {
  const tier = params.tier === 'session' || params.tier === 'phase' ? params.tier : 'phase';
  const result = await auditTierQuality({ ...params, tier });
  return { ...result, category: 'code-quality' as const };
}