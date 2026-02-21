/**
 * Composite Command: /test-catchup [phase?] [session?]
 * Run catch-up tests for previous phases/sessions
 * 
 * Runs tests for all previous phases/sessions that haven't had tests run yet.
 */

import { runCatchUpTests } from './test-catchup-workflow';
import { WorkflowCommandContext } from '../../utils/command-context';

export interface TestCatchupParams {
  phase?: string; // Optional: Only catch up to this phase
  session?: string; // Optional: Only catch up to this session
  featureName?: string; // Optional: Feature name (auto-detected if not provided)
}

/**
 * Run catch-up tests
 */
export async function testCatchup(params: TestCatchupParams = {}): Promise<{
  success: boolean;
  output: string;
}> {
  try {
    // Auto-detect feature if not provided
    let featureName = params.featureName;
    if (!featureName) {
      const context = await WorkflowCommandContext.getCurrent();
      featureName = context.feature.name;
    }
    
    const result = await runCatchUpTests(featureName, {
      targetPhase: params.phase,
      targetSession: params.session,
    });
    
    return {
      success: result.success,
      output: result.summary,
    };
  } catch (_error) {
    return {
      success: false,
      output: `Catch-up test execution failed: ${_error instanceof Error ? _error.message : String(_error)}`,
    };
  }
}

