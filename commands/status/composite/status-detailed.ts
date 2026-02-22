/**
 * Composite Command: /status-detailed [tier] [identifier]
 * Detailed status from control docs (no todo/citation/changes).
 *
 * Tier: Cross-tier utility
 * Operates on: Status queries from PROJECT_PLAN and tier guides
 */

import { getStatus, StatusTier, GetStatusParams } from '../atomic/get-status';
import { resolveFeatureName } from '../../utils';
import { status } from '../../utils/status';

export interface StatusDetailedParams {
  tier: StatusTier;
  identifier?: string;
  featureName?: string;
}

/**
 * Get detailed status (basic workflow status + tier status from control doc)
 *
 * @param params Detailed status parameters
 * @returns Formatted status output
 */
export async function statusDetailed(params: StatusDetailedParams): Promise<string> {
  const featureName = await resolveFeatureName(params.featureName);
  const output: string[] = [];

  output.push(`# Detailed Status: ${params.tier}${params.identifier ? ` ${params.identifier}` : ''}\n`);
  output.push('---\n\n');

  const basicStatus = await status();
  output.push('## Current Workflow Status\n');
  output.push(basicStatus);
  output.push('\n---\n\n');

  const statusParams: GetStatusParams = {
    tier: params.tier,
    identifier: params.identifier,
    featureName,
  };

  const statusInfo = await getStatus(statusParams);

  if (statusInfo) {
    output.push('## Tier Status\n');
    output.push(`**Tier:** ${statusInfo.tier}\n`);
    if (statusInfo.identifier) {
      output.push(`**Identifier:** ${statusInfo.identifier}\n`);
    }
    output.push(`**Status:** ${statusInfo.status}\n`);
    output.push(`**Title:** ${statusInfo.title}\n`);
    if (statusInfo.description) {
      output.push(`**Description:** ${statusInfo.description}\n`);
    }
    output.push('\n---\n\n');
  } else {
    output.push('## Tier Status\n');
    output.push(`**Status:** Not found in control doc\n`);
    output.push(`**Suggestion:** Ensure the tier exists (guide/PROJECT_PLAN) and has a status\n`);
    output.push('\n---\n\n');
  }

  return output.join('\n');
}
