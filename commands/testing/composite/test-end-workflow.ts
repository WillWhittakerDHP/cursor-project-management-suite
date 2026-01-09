/**
 * Composite Command: /test-end-workflow [tier] [id] [target]
 * End-of-workflow test suite
 * 
 * This command runs appropriate tests based on workflow tier:
 * - Task: Unit tests for changed files
 * - Session: Relevant tests for session scope
 * - Phase: Full test suite
 * - Feature: All tests + coverage
 */

import { testRun } from '../atomic/test-run';
import { testCoverage } from '../atomic/test-coverage';
import { testWorkflow } from './test-workflow';

export type WorkflowTier = 'task' | 'session' | 'phase' | 'feature';

export interface TestEndWorkflowResult {
  success: boolean;
  tier: WorkflowTier;
  results: {
    run: { success: boolean; output: string };
    coverage?: { success: boolean; output: string };
  };
  message: string;
}

/**
 * Run end-of-workflow test suite
 */
export async function testEndWorkflow(
  tier: WorkflowTier,
  id: string,
  target: string = 'vue'
): Promise<TestEndWorkflowResult> {
  const results: any = {};
  
  switch (tier) {
    case 'task':
      // Task level: Run unit tests for changed files
      const taskResult = await testRun(target);
      results.run = taskResult;
      return {
        success: taskResult.success,
        tier,
        results,
        message: taskResult.success 
          ? 'Task-level tests passed' 
          : 'Task-level tests failed',
      };
    
    case 'session':
      // Session level: Run relevant tests
      const sessionResult = await testRun(target);
      results.run = sessionResult;
      return {
        success: sessionResult.success,
        tier,
        results,
        message: sessionResult.success 
          ? 'Session-level tests passed' 
          : 'Session-level tests failed',
      };
    
    case 'phase':
      // Phase level: Run full test suite
      const phaseResult = await testWorkflow(target, false);
      results.run = phaseResult.results.run;
      return {
        success: phaseResult.success,
        tier,
        results,
        message: phaseResult.success 
          ? 'Phase-level tests passed' 
          : 'Phase-level tests failed',
      };
    
    case 'feature':
      // Feature level: Run all tests + coverage
      const featureRunResult = await testRun('all');
      results.run = featureRunResult;
      
      const featureCoverageResult = await testCoverage('all');
      results.coverage = featureCoverageResult;
      
      const featureSuccess = featureRunResult.success && featureCoverageResult.success;
      
      return {
        success: featureSuccess,
        tier,
        results,
        message: featureSuccess 
          ? 'Feature-level tests and coverage passed' 
          : 'Feature-level tests or coverage failed',
      };
    
    default:
      return {
        success: false,
        tier,
        results: {},
        message: `Unknown workflow tier: ${tier}`,
      };
  }
}

