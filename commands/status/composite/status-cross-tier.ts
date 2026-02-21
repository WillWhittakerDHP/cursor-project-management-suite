/**
 * Composite Command: /status-cross-tier [tiers...]
 * Status across multiple tiers
 * 
 * Tier: Cross-tier utility
 * Operates on: Multi-tier status queries
 */

import { getStatus, StatusTier, GetStatusParams } from '../atomic/get-status';
import { resolveFeatureName } from '../../utils';

export interface StatusCrossTierParams {
  tiers: Array<{
    tier: StatusTier;
    identifier?: string;
  }>;
  featureName?: string;
}

/**
 * Get status across multiple tiers
 * 
 * @param params Cross-tier status parameters
 * @returns Formatted cross-tier status output
 */
export async function statusCrossTier(params: StatusCrossTierParams): Promise<string> {
  const featureName = await resolveFeatureName(params.featureName);
  const output: string[] = [];
  
  output.push(`# Cross-Tier Status\n`);
  output.push('---\n\n');
  
  const statusResults = await Promise.all(
    params.tiers.map(async ({ tier, identifier }) => {
      const statusParams: GetStatusParams = {
        tier,
        identifier,
        featureName
      };
      const statusInfo = await getStatus(statusParams);
      return { tier, identifier, statusInfo };
    })
  );
  
  for (const { tier, identifier, statusInfo } of statusResults) {
    output.push(`## ${tier}${identifier ? ` ${identifier}` : ''}\n`);
    
    if (statusInfo) {
      output.push(`**Status:** ${statusInfo.status}\n`);
      output.push(`**Title:** ${statusInfo.title}\n`);
      
      if (statusInfo.progress) {
        output.push(`**Progress:** ${statusInfo.progress.completed}/${statusInfo.progress.total} completed\n`);
      }
      
      if (statusInfo.children && statusInfo.children.length > 0) {
        const completed = statusInfo.children.filter(c => c.status === 'completed').length;
        const inProgress = statusInfo.children.filter(c => c.status === 'in_progress').length;
        const pending = statusInfo.children.filter(c => c.status === 'pending').length;
        
        output.push(`**Children:** ${completed} completed, ${inProgress} in progress, ${pending} pending\n`);
      }
    } else {
      output.push(`**Status:** Not found\n`);
    }
    
    output.push('\n');
  }
  
  return output.join('\n');
}

