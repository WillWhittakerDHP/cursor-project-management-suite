/**
 * Composite Command: /batch-update-logs [tier] [identifiers...]
 * Update multiple logs
 * 
 * Tier: Cross-tier utility
 * Operates on: Batch log updates
 */

import { WorkflowCommandContext } from '../../utils/command-context';
import { executeBatchOperation } from '../atomic/batch-operation';

export type BatchTier = 'feature' | 'phase' | 'session';

export interface BatchUpdateLogsParams {
  tier: BatchTier;
  identifiers: string[];
  content: string;
  featureName?: string;
}

/**
 * Update multiple logs
 * 
 * @param params Batch update logs parameters
 * @returns Formatted batch output
 */
export async function batchUpdateLogs(params: BatchUpdateLogsParams): Promise<string> {
  const featureName = params.featureName || 'vue-migration';
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  output.push(`# Batch Update Logs: ${params.tier}\n`);
  output.push(`**Identifiers:** ${params.identifiers.join(', ')}\n`);
  output.push('---\n\n');
  
  // Execute batch operation
  const result = await executeBatchOperation(
    params.identifiers,
    async (identifier: string) => {
      // Append to log
      if (params.tier === 'feature') {
        await context.appendFeatureLog(params.content);
      } else if (params.tier === 'phase') {
        await context.appendPhaseLog(identifier, params.content);
      } else {
        await context.appendSessionLog(identifier, params.content);
      }
      
      return { identifier, success: true };
    }
  );
  
  // Output results
  output.push('## Results\n\n');
  output.push(`**Total:** ${result.summary.total}\n`);
  output.push(`**Successful:** ${result.summary.successful}\n`);
  output.push(`**Failed:** ${result.summary.failed}\n`);
  output.push('\n---\n\n');
  
  if (result.summary.successful > 0) {
    output.push('### Successful\n\n');
    for (const item of result.results.filter(r => r.success)) {
      output.push(`- ✅ ${item.identifier}\n`);
    }
    output.push('\n');
  }
  
  if (result.summary.failed > 0) {
    output.push('### Failed\n\n');
    for (const item of result.results.filter(r => !r.success)) {
      output.push(`- ❌ ${item.identifier}: ${item.error}\n`);
    }
  }
  
  return output.join('\n');
}

