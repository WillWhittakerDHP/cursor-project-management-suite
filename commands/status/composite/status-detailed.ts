/**
 * Composite Command: /status-detailed [tier] [identifier]
 * Detailed status with todos, citations, changes
 * 
 * Tier: Cross-tier utility
 * Operates on: Comprehensive status queries
 */

import { getStatus, StatusTier, GetStatusParams } from '../atomic/get-status';
import { queryChanges } from '../atomic/query-changes';
import { queryCitationsForTier } from '../atomic/query-citations';
import { resolveFeatureName } from '../../utils';
import { status } from '../../utils/status';

export interface StatusDetailedParams {
  tier: StatusTier;
  identifier?: string;
  featureName?: string;
  includeChanges?: boolean;
  includeCitations?: boolean;
}

/**
 * Get detailed status with todos, citations, and changes
 * 
 * @param params Detailed status parameters
 * @returns Formatted detailed status output
 */
export async function statusDetailed(params: StatusDetailedParams): Promise<string> {
  const featureName = await resolveFeatureName(params.featureName);
  const output: string[] = [];
  
  output.push(`# Detailed Status: ${params.tier}${params.identifier ? ` ${params.identifier}` : ''}\n`);
  output.push('---\n\n');
  
  // Get basic status
  const basicStatus = await status();
  output.push('## Current Workflow Status\n');
  output.push(basicStatus);
  output.push('\n---\n\n');
  
  // Get tier-specific status
  const statusParams: GetStatusParams = {
    tier: params.tier,
    identifier: params.identifier,
    featureName
  };
  
  const statusInfo = await getStatus(statusParams);
  
  if (statusInfo) {
    output.push('## Tier Status\n');
    output.push(`**Tier:** ${statusInfo.tier}\n`);
    if (statusInfo.identifier) {
      output.push(`**Identifier:** ${statusInfo.identifier}\n`);
    }
    output.push(`**Todo ID:** ${statusInfo.todoId}\n`);
    output.push(`**Status:** ${statusInfo.status}\n`);
    output.push(`**Title:** ${statusInfo.title}\n`);
    if (statusInfo.description) {
      output.push(`**Description:** ${statusInfo.description}\n`);
    }
    
    if (statusInfo.progress) {
      output.push('\n### Progress\n');
      output.push(`**Completed:** ${statusInfo.progress.completed}/${statusInfo.progress.total}\n`);
      output.push(`**In Progress:** ${statusInfo.progress.inProgress}\n`);
      output.push(`**Pending:** ${statusInfo.progress.pending}\n`);
    }
    
    if (statusInfo.children && statusInfo.children.length > 0) {
      output.push('\n### Children\n');
      for (const child of statusInfo.children) {
        const statusIcon = child.status === 'completed' ? '✅' :
                          child.status === 'in_progress' ? '🔄' : '⏳';
        output.push(`- ${statusIcon} **${child.todoId}**: ${child.title} [${child.status}]\n`);
      }
    }
    
    output.push('\n---\n\n');
  } else {
    output.push('## Tier Status\n');
    output.push(`**Status:** Todo not found\n`);
    output.push(`**Suggestion:** Create the todo first using planning commands\n`);
    output.push('\n---\n\n');
  }
  
  // Include changes if requested
  if (params.includeChanges !== false) {
    output.push('## Recent Changes\n');
    const changesOutput = await queryChanges({
      tier: params.tier,
      identifier: params.identifier,
      featureName,
      filters: {
        since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // Last 7 days
      }
    });
    output.push(changesOutput);
    output.push('\n---\n\n');
  }
  
  // Include citations if requested
  if (params.includeCitations !== false) {
    output.push('## Citations\n');
    const citationsOutput = await queryCitationsForTier({
      tier: params.tier,
      identifier: params.identifier,
      featureName,
      filters: {
        unreviewed: true // Show unreviewed citations by default
      }
    });
    output.push(citationsOutput);
  }
  
  return output.join('\n');
}

