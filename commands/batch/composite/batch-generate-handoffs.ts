/**
 * Composite Command: /batch-generate-handoffs [tier] [identifiers...]
 * Generate multiple handoffs
 * 
 * Tier: Cross-tier utility
 * Operates on: Batch handoff generation
 */

import { generateHandoff, HandoffTier, GenerateHandoffParams } from '../../handoff/atomic/generate-handoff';
import { executeBatchOperation } from '../atomic/batch-operation';

export interface BatchGenerateHandoffsParams {
  tier: HandoffTier;
  identifiers: string[];
  featureName?: string;
  nextIdentifiers?: Record<string, string>; // Map of identifier to next identifier
  transitionNotes?: Record<string, string>; // Map of identifier to transition notes
}

/**
 * Generate multiple handoffs
 * 
 * @param params Batch generate handoffs parameters
 * @returns Formatted batch output
 */
export async function batchGenerateHandoffs(params: BatchGenerateHandoffsParams): Promise<string> {
  const featureName = params.featureName || 'vue-migration';
  const output: string[] = [];
  
  output.push(`# Batch Generate Handoffs: ${params.tier}\n`);
  output.push(`**Identifiers:** ${params.identifiers.join(', ')}\n`);
  output.push('---\n\n');
  
  // Execute batch operation
  const result = await executeBatchOperation(
    params.identifiers,
    async (identifier: string) => {
      const generateParams: GenerateHandoffParams = {
        tier: params.tier,
        identifier,
        featureName,
        nextIdentifier: params.nextIdentifiers?.[identifier],
        transitionNotes: params.transitionNotes?.[identifier]
      };
      
      const handoffOutput = await generateHandoff(generateParams);
      return { identifier, output: handoffOutput };
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
      if (item.output) {
        // Show preview of output
        const preview = (item.output as string).substring(0, 200);
        output.push(`  Preview: ${preview}...\n`);
      }
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

