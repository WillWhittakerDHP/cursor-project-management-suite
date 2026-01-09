/**
 * Composite Command: Test Catch-Up Workflow
 * 
 * Runs tests for all previous phases/sessions that haven't had tests run yet.
 */

import { WorkflowCommandContext } from '../../utils/command-context';
import { readProjectFile } from '../../utils/utils';
import { testEndWorkflow } from './test-end-workflow';
import { TEST_CONFIG } from '../utils/test-config';
import { access } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';

export interface CatchUpTestResult {
  success: boolean;
  phasesTested: string[];
  sessionsTested: string[];
  failures: Array<{
    tier: 'phase' | 'session';
    id: string;
    error: string;
  }>;
  summary: string;
}

/**
 * Check if tests were run for a phase/session by checking logs
 */
async function hasTestsRun(
  tier: 'phase' | 'session',
  id: string,
  context: WorkflowCommandContext
): Promise<boolean> {
  try {
    let logContent = '';
    
    if (tier === 'session') {
      const logPath = context.paths.getSessionLogPath(id);
      logContent = await readProjectFile(logPath);
    } else if (tier === 'phase') {
      const logPath = context.paths.getPhaseLogPath(id);
      logContent = await readProjectFile(logPath);
    }
    
    // Check for test execution record
    const testRunPattern = /\*\*Tests Run:\*\*/i;
    return testRunPattern.test(logContent);
  } catch {
    // If log doesn't exist, assume tests haven't run
    return false;
  }
}

/**
 * Get all completed phases for a feature
 * Falls back to feature-plan.md if feature guide doesn't exist
 */
async function getCompletedPhases(
  context: WorkflowCommandContext
): Promise<string[]> {
  try {
    let featureContent = '';
    
    // Try to read feature guide first
    try {
      featureContent = await context.readFeatureGuide();
    } catch {
      // Fall back to feature-plan.md if guide doesn't exist
      const planPath = context.paths.getFeaturePlanPath();
      try {
        const fullPath = join(PROJECT_ROOT, planPath);
        await access(fullPath);
        featureContent = await readProjectFile(planPath);
      } catch {
        featureContent = '';
      }
      
      if (!featureContent) {
        // If neither exists, return empty array
        return [];
      }
    }
    
    // Match Phase X or Phase X.Y format (e.g., "Phase 1" or "Phase 1.2")
    const phaseMatches = Array.from(featureContent.matchAll(/Phase\s+(\d+(?:\.\d+)?)/g));
    const phases: string[] = [];
    
    for (const match of phaseMatches) {
      const phase = match[1];
      // Check if phase is marked complete
      try {
        const phaseGuide = await context.readPhaseGuide(phase);
        const isComplete = /\*\*Status:\*\*\s*Complete/i.test(phaseGuide);
        if (isComplete) {
          phases.push(phase);
        }
      } catch {
        // Skip phases we can't read
      }
    }
    
    return phases;
  } catch {
    return [];
  }
}

/**
 * Get all completed sessions for a phase
 */
async function getCompletedSessions(
  phase: string,
  context: WorkflowCommandContext
): Promise<string[]> {
  try {
    const phaseGuide = await context.readPhaseGuide(phase);
    const sessionMatches = phaseGuide.matchAll(/Session\s+(\d+\.\d+)/g);
    const sessions: string[] = [];
    
    for (const match of sessionMatches) {
      const sessionId = match[1];
      // Check if session is marked complete (checkbox checked)
      const sessionGuide = await context.readSessionGuide(sessionId);
      const isComplete = /- \[x\]/i.test(sessionGuide) || 
                        /Session.*complete/i.test(sessionGuide);
      if (isComplete) {
        sessions.push(sessionId);
      }
    }
    
    return sessions;
  } catch {
    return [];
  }
}

/**
 * Run catch-up tests for previous phases/sessions
 */
export async function runCatchUpTests(
  featureName: string,
  options?: {
    targetPhase?: string; // Only catch up to this phase
    targetSession?: string; // Only catch up to this session
  }
): Promise<CatchUpTestResult> {
  if (!TEST_CONFIG.catchUpEnabled) {
    return {
      success: false,
      phasesTested: [],
      sessionsTested: [],
      failures: [],
      summary: 'Catch-up test flow is disabled in configuration',
    };
  }
  
  const context = new WorkflowCommandContext(featureName);
  const phasesTested: string[] = [];
  const sessionsTested: string[] = [];
  const failures: CatchUpTestResult['failures'] = [];
  
  // Get all completed phases
  const completedPhases = await getCompletedPhases(context);
  
  // Filter to target phase if specified
  const phasesToTest = options?.targetPhase
    ? completedPhases.filter(p => parseInt(p) <= parseInt(options.targetPhase))
    : completedPhases;
  
  // Test each phase
  for (const phase of phasesToTest) {
    const hasRun = await hasTestsRun('phase', phase, context);
    if (!hasRun) {
      try {
        const testResult = await testEndWorkflow('phase', phase, TEST_CONFIG.defaultTarget);
        phasesTested.push(phase);
        
        if (!testResult.success) {
          failures.push({
            tier: 'phase',
            id: phase,
            error: testResult.message,
          });
        }
      } catch (error) {
        failures.push({
          tier: 'phase',
          id: phase,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    // Test sessions in this phase
    const completedSessions = await getCompletedSessions(phase, context);
    const sessionsToTest = options?.targetSession
      ? completedSessions.filter(s => {
          const [p, sn] = s.split('.');
          const [targetP, targetSn] = options.targetSession!.split('.');
          return parseInt(p) < parseInt(targetP) || 
                 (parseInt(p) === parseInt(targetP) && parseInt(sn) <= parseInt(targetSn));
        })
      : completedSessions;
    
    for (const sessionId of sessionsToTest) {
      const hasRun = await hasTestsRun('session', sessionId, context);
      if (!hasRun) {
        try {
          const testResult = await testEndWorkflow('session', sessionId, TEST_CONFIG.defaultTarget);
          sessionsTested.push(sessionId);
          
          if (!testResult.success) {
            failures.push({
              tier: 'session',
              id: sessionId,
              error: testResult.message,
            });
          }
        } catch (error) {
          failures.push({
            tier: 'session',
            id: sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }
  
  const success = failures.length === 0;
  const summary = `Catch-up test execution complete:
- Phases tested: ${phasesTested.length}
- Sessions tested: ${sessionsTested.length}
- Failures: ${failures.length}
${failures.length > 0 ? `\nFailures:\n${failures.map(f => `  - ${f.tier} ${f.id}: ${f.error}`).join('\n')}` : ''}`;
  
  return {
    success,
    phasesTested,
    sessionsTested,
    failures,
    summary,
  };
}

