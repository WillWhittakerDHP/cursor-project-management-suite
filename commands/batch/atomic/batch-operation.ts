/**
 * Atomic Command: Core batch operation logic
 * 
 * Tier: Cross-tier utility
 * Operates on: Batch operations across multiple identifiers
 */

export interface BatchOperationResult<T> {
  success: boolean;
  results: Array<{
    identifier: string;
    success: boolean;
    output?: T;
    error?: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

/**
 * Execute batch operation
 * 
 * @param identifiers Array of identifiers to process
 * @param operation Operation function to execute for each identifier
 * @returns Batch operation result
 */
export async function executeBatchOperation<T>(
  identifiers: string[],
  operation: (identifier: string) => Promise<T>
): Promise<BatchOperationResult<T>> {
  const results: BatchOperationResult<T>['results'] = [];
  
  for (const identifier of identifiers) {
    try {
      const output = await operation(identifier);
      results.push({
        identifier,
        success: true,
        output
      });
    } catch (error) {
      results.push({
        identifier,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  return {
    success: failed === 0,
    results,
    summary: {
      total: identifiers.length,
      successful,
      failed
    }
  };
}

