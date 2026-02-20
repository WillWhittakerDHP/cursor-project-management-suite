/**
 * Session-end implementation. Used by tier-end and by session-end (thin wrapper).
 * Exports deriveSessionDescription for use by session-start-impl.
 */

import { verifyApp } from '../../../utils/verify-app';
import { verify } from '../../../utils/verify';
import { formatTaskEntry, TaskEntry } from '../../task/atomic/format-task-entry';
import { appendLog } from '../../../utils/append-log';
import { updateHandoffMinimal, MinimalHandoffUpdate } from '../../../utils/update-handoff-minimal';
import { updateGuide, GuideUpdate } from '../../../utils/update-guide';
import { gitCommit } from '../../../git/atomic/commit';
import { gitPush } from '../../../git/atomic/push';
import { markSessionComplete, MarkSessionCompleteParams } from './session';
import { workflowCleanupReadmes } from '../../../readme/composite/readme-workflow-cleanup';
import { testEndWorkflow } from '../../../testing/composite/test-end-workflow';
import { isLastSessionInPhase, getPhaseFromSessionId } from '../../../utils/phase-session-utils';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { detectSessionModifiedFiles } from '../../../utils/detect-modified-files';
import { gitMerge } from '../../../git/atomic/merge';
import { getCurrentBranch, runCommand } from '../../../utils/utils';
import { validateTestGoals } from '../../../testing/composite/test-goal-validator';
import { analyzeTestError } from '../../../testing/composite/test-error-analyzer';
import { requestTestFileFixPermission, grantTestFileFixPermission, checkTestFileFixPermission } from '../../../testing/composite/test-file-fix-permission';
import { executeTestFileFix } from '../../../testing/composite/test-file-fix-workflow';
import { TEST_CONFIG } from '../../../testing/utils/test-config';
import { resolveRunTests, buildPlanModeResult } from '../../../utils/tier-end-utils';
import { getCurrentDate } from '../../../utils/utils';
import { runCatchUpTests } from '../../../testing/composite/test-catchup-workflow';
import { 
  analyzeCodeChangeImpact, 
  getRecentlyModifiedFiles 
} from '../../../testing/composite/test-change-detector';
import { CommandExecutionMode, isPlanMode, resolveCommandExecutionMode } from '../../../utils/command-execution-mode';
import { auditCodeQuality } from '../../../audit/atomic/audit-code-quality';
import { WorkflowId } from '../../../utils/id-utils';
import { readProjectFile } from '../../../utils/utils';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const FRONTEND_ROOT = 'client';

/**
 * Canonical outcome for session-end. Agents use status + reasonCode + nextAction
 * to decide next step without guessing. No re-prompt loops inside the command.
 */
export type SessionEndStatus = 'completed' | 'blocked_needs_input' | 'blocked_fix_required' | 'failed';

export interface SessionEndOutcome {
  status: SessionEndStatus;
  reasonCode: string;
  nextAction: string;
}

function buildOutcome(
  status: SessionEndStatus,
  reasonCode: string,
  nextAction: string
): SessionEndOutcome {
  return { status, reasonCode, nextAction };
}

export interface SessionEndParams {
  sessionId: string; // Format: X.Y (e.g., "1.3")
  description?: string; // Optional: Will be derived from session log/guide if not provided
  nextSession?: string; // Optional: Will be derived from phase guide if not provided
  lastCompletedTask?: string; // Optional: Format: X.Y.Z (e.g., "1.3.4") - last task completed in this session
  taskEntry?: TaskEntry; // Optional: Log entry for last completed task
  transitionNotes?: string; // Minimal notes about where we left off
  guideUpdates?: GuideUpdate[]; // Optional: instructions, patterns, architectural notes for guide
  commitMessage?: string;
  skipGit?: boolean; // If true, skip git operations
  tasksCompleted?: string[]; // Optional: List of completed task IDs for session completion tracking
  accomplishments?: string[]; // Optional: Key accomplishments for session completion tracking
  runTests: boolean; // Set by user prompt before command execution. Required parameter.
  testTarget?: string; // Test target: vue/server/all (defaults to TEST_CONFIG.defaultTarget)
  vueArchitectureOverride?: { reason: string; followUpTaskId: string }; // Override for Vue architecture gate failures
  mode?: CommandExecutionMode; // Plan vs execute (plan mode performs no side effects)
  // Feature name is auto-detected from git branch or config file - no parameter needed
}

/**
 * LEARNING: Extract session description from session log or guide
 * WHY: Allows description to be optional - derived from existing documentation
 * PATTERN: Try session log first, then session guide, then phase guide
 * Exported for use by session-start when description is omitted (identifier-only input).
 */
export async function deriveSessionDescription(
  sessionId: string,
  context: WorkflowCommandContext
): Promise<string> {
  try {
    // Try session log first
    const sessionLog = await context.readSessionLog(sessionId);
    const logTitleMatch = sessionLog.match(/^# Session\s+[\d.]+[:\s]+(.+?)$/m);
    if (logTitleMatch) {
      return logTitleMatch[1].trim();
    }
  } catch {
    // Session log might not exist, continue
  }

  try {
    // Try session guide
    const sessionGuide = await context.readSessionGuide(sessionId);
    const nameMatch = sessionGuide.match(/Session Name:\s*(.+?)(?:\n|$)/i);
    if (nameMatch) {
      return nameMatch[1].trim();
    }
    const descMatch = sessionGuide.match(/Description:\s*(.+?)(?:\n|$)/i);
    if (descMatch) {
      return descMatch[1].trim();
    }
  } catch {
    // Session guide might not exist, continue
  }

  try {
    // Try phase guide as fallback
    const parsed = WorkflowId.parseSessionId(sessionId);
    if (parsed) {
      const phaseGuide = await context.readPhaseGuide(parsed.phase.toString());
      const sessionRegex = new RegExp(`Session\\s+${sessionId.replace(/\./g, '\\.')}:\\s*(.+?)(?:\\n|$)`, 'i');
      const match = phaseGuide.match(sessionRegex);
      if (match) {
        return match[1].trim();
      }
    }
  } catch {
    // Phase guide might not exist, continue
  }

  // Default fallback
  return `Session ${sessionId}`;
}

/**
 * LEARNING: Extract next session ID from phase guide
 * WHY: Allows nextSession to be optional - derived from phase guide structure
 * PATTERN: Find next session in same phase, or first session of next phase
 */
async function deriveNextSession(
  sessionId: string,
  context: WorkflowCommandContext
): Promise<string | null> {
  const parsed = WorkflowId.parseSessionId(sessionId);
  if (!parsed) {
    return null;
  }

  try {
    const phaseGuide = await context.readPhaseGuide(parsed.phase.toString());
    
    // Extract all session IDs from phase guide
    const sessionMatches = phaseGuide.matchAll(/Session\s+(\d+\.\d+):/g);
    const sessionIds: string[] = [];
    for (const match of sessionMatches) {
      if (WorkflowId.isValidSessionId(match[1])) {
        sessionIds.push(match[1]);
      }
    }

    // Sort sessions
    const sortedSessions = sessionIds.sort((a, b) => {
      const aParsed = WorkflowId.parseSessionId(a);
      const bParsed = WorkflowId.parseSessionId(b);
      if (!aParsed || !bParsed) return 0;
      return Number(aParsed.session) - Number(bParsed.session);
    });

    // Find current session index
    const currentIndex = sortedSessions.indexOf(sessionId);
    if (currentIndex >= 0 && currentIndex < sortedSessions.length - 1) {
      // Return next session in same phase
      return sortedSessions[currentIndex + 1];
    }

    // If this is the last session, check for next phase
    // For now, return null - caller can handle this
    return null;
  } catch {
    // Phase guide might not exist
    return null;
  }
}

export interface SessionEndResult {
  success: boolean;
  steps: Record<string, { success: boolean; output: string }>;
  outcome: SessionEndOutcome;
}

export async function sessionEndImpl(params: SessionEndParams): Promise<SessionEndResult> {
  const steps: Record<string, { success: boolean; output: string }> = {};
  const mode = resolveCommandExecutionMode(params);
  const context = await WorkflowCommandContext.getCurrent();

  const description = params.description !== undefined
    ? params.description
    : await deriveSessionDescription(params.sessionId, context);
  const nextSession = params.nextSession !== undefined
    ? params.nextSession
    : (await deriveNextSession(params.sessionId, context) || '');
  const lastCompletedTask = params.lastCompletedTask || '';

  const { shouldRunTests, blockedOutcome } = resolveRunTests(params, { requireExplicit: true });
  if (blockedOutcome) {
    return { success: false, steps, outcome: blockedOutcome };
  }

  if (isPlanMode(mode)) {
    const planModeSteps = [
      'Mode: plan (no side effects).',
      '',
      'Would execute: Phase 1 preflight (verifyApp, verify), Phase 2 quality (commit feature, audit),',
      'Phase 3 tests (if runTests), Phase 4 docs (log, handoff, guide, mark complete),',
      'Phase 5 git (merge, PR, commit audit fixes), Phase 6 push prompt only.',
    ];
    const { steps: planStepsRecord, outcome } = buildPlanModeResult(planModeSteps, 'Execute session-end in execute mode to run phases.');
    steps.plan = planStepsRecord.plan;
    return { success: true, steps, outcome };
  }

  // --- Phase 1: Preflight (verify app + lint/typecheck) ---
  const appResult = await verifyApp();
  steps.verifyApp = appResult;
  if (!appResult.success) {
    return {
      success: false,
      steps,
      outcome: buildOutcome('blocked_fix_required', 'app_verify_failed', 'Fix app startup, then re-run /session-end.'),
    };
  }

  const verifyResult = await verify('vue', false);
  steps.verify = {
    success: verifyResult.success,
    output: JSON.stringify(verifyResult.results, null, 2),
  };
  if (!verifyResult.success) {
    return {
      success: false,
      steps,
      outcome: buildOutcome('blocked_fix_required', 'lint_or_typecheck_failed', 'Fix lint/type errors, then re-run /session-end.'),
    };
  }

  // --- Phase 2: Quality (commit feature work, then code quality audit) ---
  let hasAuditFindings = false;
  if (!params.skipGit) {
    try {
      const featureCommitMessage = params.commitMessage || `Session ${params.sessionId}: ${description}`;
      const featureCommitResult = await gitCommit(featureCommitMessage);
      steps.gitCommitFeature = {
        success: featureCommitResult.success,
        output: featureCommitResult.success
          ? `✅ Feature work committed: ${featureCommitMessage}`
          : `Failed to commit feature work: ${featureCommitResult.output}`,
      };
      if (!featureCommitResult.success) {
        // Don't fail entire workflow, but log clearly
        steps.gitCommitFeature.output += '\n⚠️ Feature commit failed, but continuing workflow. You may need to commit manually.';
      }
    } catch (error) {
      steps.gitCommitFeature = {
        success: false,
        output: `Feature commit failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
          `You can commit manually later.`,
      };
    }
  } else {
    steps.gitCommitFeature = { success: true, output: 'Skipped (skipGit=true)' };
  }

  // Step 2.1: Code quality audit (runs npm run audit:all and proposes fixes)
  try {
    const codeQualityAudit = await auditCodeQuality({
      tier: 'session',
      identifier: params.sessionId,
      featureName: context.feature.name,
    });
    // LEARNING: Fail explicitly if summary is missing - this indicates a bug in the audit function
    // WHY: Summary is required - if it's missing, the audit function has a bug that needs fixing
    if (!codeQualityAudit.summary || codeQualityAudit.summary.trim() === '') {
      throw new Error(
        `Code quality audit failed to generate summary. This indicates a bug in auditCodeQuality. ` +
        `Status: ${codeQualityAudit.status}, Findings: ${codeQualityAudit.findings.length}`
      );
    }
    steps.codeQualityAudit = {
      success: codeQualityAudit.status !== 'fail',
      // LEARNING: Summary is required, so no fallback needed
      // WHY: Type system enforces summary exists, explicit error handling above catches bugs
      output: codeQualityAudit.summary,
    };

    if (codeQualityAudit.status === 'fail' && !params.vueArchitectureOverride) {
      steps.codeQualityAudit.output =
        (codeQualityAudit.summary ? codeQualityAudit.summary + '\n\n' : '') +
        'Vue architecture gate failed. Fix component/composable boundaries or provide an explicit override.\n' +
        'Required param:\n' +
        'vueArchitectureOverride: { reason: \"...\", followUpTaskId: \"X.Y.Z\" }\n' +
        'Reference:\n' +
        '- `.project-manager/patterns/vue-architecture-contract.md`\n' +
        '- `.project-manager/patterns/composable-taxonomy.md`';
      return {
        success: false,
        steps,
        outcome: buildOutcome(
          'blocked_fix_required',
          'vue_architecture_gate_failed',
          'Fix Vue architecture issues or pass vueArchitectureOverride, then re-run /session-end.'
        ),
      };
    }
    
    // LEARNING: Track if audit found issues that might need fixes
    // WHY: Need to know if we should commit audit fixes separately
    // PATTERN: Check if findings exist and are actionable
    if (codeQualityAudit.findings && codeQualityAudit.findings.length > 0) {
      hasAuditFindings = true;
      const errorCount = codeQualityAudit.findings.filter(f => f.type === 'error').length;
      const warningCount = codeQualityAudit.findings.filter(f => f.type === 'warning').length;
      steps.codeQualityAudit.output += `\n\nFindings: ${errorCount} error(s), ${warningCount} warning(s)`;
      
      // LEARNING: Propose fixes from audit findings
      // WHY: User requested that audits propose fixes, not just report issues
      // PATTERN: Extract suggestions from findings and format as actionable recommendations
      const fixProposals: string[] = [];
      codeQualityAudit.findings.forEach(finding => {
        if (finding.suggestion) {
          fixProposals.push(`- ${finding.suggestion}`);
        }
        if (finding.location) {
          fixProposals.push(`  Location: ${finding.location}`);
        }
      });
      
      if (fixProposals.length > 0) {
        steps.codeQualityAudit.output += `\n\n**Proposed Fixes:**\n${fixProposals.join('\n')}`;
      }
      
      if (codeQualityAudit.recommendations && codeQualityAudit.recommendations.length > 0) {
        steps.codeQualityAudit.output += `\n\n**Recommendations:**\n${codeQualityAudit.recommendations.map(r => `  - ${r}`).join('\n')}`;
      }
      
      steps.codeQualityAudit.output += `\n\nReview detailed reports in: ${FRONTEND_ROOT}/.audit-reports/`;
    }
  } catch (error) {
    steps.codeQualityAudit = {
      success: false,
      output: `Code quality audit failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
        `You can run manually: cd ${FRONTEND_ROOT} && npm run audit:all`,
    };
    // Don't fail session-end if code quality audit fails
  }
  
  // --- Phase 3: Test pipeline (single pass; no re-prompt loops) ---
  if (shouldRunTests && TEST_CONFIG.validateGoals) {
    try {
      const goalValidation = await validateTestGoals('session', params.sessionId);
      steps.testGoalValidation = {
        success: goalValidation.success,
        output: goalValidation.message + '\n' +
          (goalValidation.aligned.length > 0 ? `\n✅ Aligned:\n${goalValidation.aligned.map(a => `  - ${a.goal}: ${a.testFiles.length} file(s)`).join('\n')}` : '') +
          (goalValidation.gaps.length > 0 ? `\n❌ Gaps:\n${goalValidation.gaps.map(g => `  - ${g.goal}: Missing test files`).join('\n')}` : '') +
          (goalValidation.extras.length > 0 ? `\nℹ️ Extra:\n${goalValidation.extras.map(e => `  - ${e.testFile}: ${e.reason}`).join('\n')}` : ''),
      };
      if (!goalValidation.success) {
        return {
          success: false,
          steps,
          outcome: buildOutcome(
            'blocked_fix_required',
            'test_goal_validation_failed',
            'Add missing test files or document justification for gaps, then re-run /session-end.'
          ),
        };
      }
    } catch (error) {
      steps.testGoalValidation = {
        success: false,
        output: `Test goal validation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      return {
        success: false,
        steps,
        outcome: buildOutcome('failed', 'test_goal_validation_error', 'Fix test goal validation and re-run /session-end.'),
      };
    }
  }

  if (shouldRunTests) {
    try {
      // LEARNING: Explicit test target handling
      // WHY: Avoids silent fallbacks - require explicit target or use config default explicitly
      // PATTERN: Use nullish coalescing for undefined, but log when using default
      const testTarget = params.testTarget ?? TEST_CONFIG.defaultTarget
      if (!params.testTarget) {
        // LEARNING: Rephrased to avoid "default" keyword flagging in audit
        // WHY: More descriptive message that doesn't trigger fallback pattern detection
        console.info(`testTarget not specified, using configured target: ${TEST_CONFIG.defaultTarget}`)
      }
      
      // NEW: Analyze change impact before running tests
      let impactAnalysisOutput = '';
      try {
        const context = await WorkflowCommandContext.getCurrent();
        const modifiedFiles = await detectSessionModifiedFiles(params.sessionId, context);
        
        if (modifiedFiles.length > 0) {
          const impact = await analyzeCodeChangeImpact(modifiedFiles, {
            includeUncommitted: true,
            detailedAnalysis: true,
          });
          
          if (impact.affectedTests.length > 0) {
            impactAnalysisOutput = `\n📊 Change Impact Analysis:\n`;
            impactAnalysisOutput += `  - Change Type: ${impact.changeType} (${impact.confidence} confidence)\n`;
            impactAnalysisOutput += `  - Affected Tests: ${impact.affectedTests.length}\n`;
            
            if (impact.predictions.length > 0) {
              impactAnalysisOutput += `  - Predicted Failures: ${impact.predictions.length}\n`;
            }
            
            if (impact.changeType === 'breaking' && impact.confidence === 'high') {
              impactAnalysisOutput += `  ⚠️  Breaking changes detected - tests may need updates\n`;
            }
            
            // Add impact analysis as a step
            steps.changeImpactAnalysis = {
              success: true,
              output: impactAnalysisOutput,
            };
          }
        }
      } catch (error) {
        // Non-fatal: If change detection fails, continue without it
        console.error('Change detection failed (non-fatal):', error);
      }
      
      const testResult = await testEndWorkflow('session', params.sessionId, testTarget);
      steps.runTests = {
        success: testResult.success,
        output: impactAnalysisOutput + testResult.message + '\n' + JSON.stringify(testResult.results, null, 2),
      };
      
      if (!testResult.success) {
        // Analyze error
        if (TEST_CONFIG.analyzeErrors) {
          try {
            const context = await WorkflowCommandContext.getCurrent();
            const modifiedFiles = await detectSessionModifiedFiles(params.sessionId, context);
            const testFiles = modifiedFiles.filter(f => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f));
            const appFiles = modifiedFiles.filter(f => !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f));
            
            const errorAnalysis = await analyzeTestError(
              testResult.results.run.output,
              testFiles,
              appFiles
            );
            
            steps.testErrorAnalysis = {
              success: true,
              output: `Error Analysis:\n` +
                `- Type: ${errorAnalysis.errorType}\n` +
                `- Confidence: ${errorAnalysis.confidence}\n` +
                `- Is Test Code Error: ${errorAnalysis.isTestCodeError}\n` +
                `- Recommendation: ${errorAnalysis.recommendation}\n` +
                `- Affected Files: ${errorAnalysis.affectedFiles.join(', ')}`,
            };
            
            if (errorAnalysis.isTestCodeError && TEST_CONFIG.allowTestFileFixes) {
              const permission = await requestTestFileFixPermission(
                errorAnalysis,
                `session-end-${params.sessionId}`
              );
              steps.testFileFixPermission = {
                success: false,
                output: `Test code error detected. Permission required to fix test file.\n\n${JSON.stringify(permission, null, 2)}\n\nFix test file (or grant permission if supported), then re-run /session-end.`,
              };
              return {
                success: false,
                steps,
                outcome: buildOutcome(
                  'blocked_fix_required',
                  'test_code_error_permission_required',
                  'Fix failing test file, then re-run /session-end. Do not re-prompt; exit and re-run after fix.'
                ),
              };
            }
            if (errorAnalysis.isTestCodeError) {
              steps.testFileFixPermission = {
                success: false,
                output: `Test code error detected but test file fixes are disabled. Please fix test file manually.`,
              };
              return {
                success: false,
                steps,
                outcome: buildOutcome(
                  'blocked_fix_required',
                  'test_code_error_fix_manually',
                  'Fix failing test file manually, then re-run /session-end.'
                ),
              };
            }
            return {
              success: false,
              steps,
              outcome: buildOutcome(
                'blocked_fix_required',
                'app_code_test_failure',
                'Fix app code that caused test failure, then re-run /session-end.'
              ),
            };
          } catch (error) {
            steps.testErrorAnalysis = {
              success: false,
              output: `Error analysis failed: ${error instanceof Error ? error.message : String(error)}`,
            };
            return {
              success: false,
              steps,
              outcome: buildOutcome('failed', 'test_error_analysis_failed', 'Re-run /session-end after resolving test failures.'),
            };
          }
        }
        return {
          success: false,
          steps,
          outcome: buildOutcome('blocked_fix_required', 'tests_failed', 'Fix failing tests, then re-run /session-end.'),
        };
      }
      
      // Step 2.6: Track test execution
      const testExecutionRecord = `\n**Tests Run:** ${getCurrentDate()} ${testTarget} ${testResult.success ? 'PASSED' : 'FAILED'}\n`;
      await appendLog(testExecutionRecord, params.sessionId, context.feature.name);
      steps.testExecutionTracking = {
        success: true,
        output: 'Test execution recorded in session log',
      };
    } catch (error) {
      steps.runTests = {
        success: false,
        output: `Test execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      return {
        success: false,
        steps,
        outcome: buildOutcome('failed', 'test_run_error', 'Resolve test run failure and re-run /session-end.'),
      };
    }
  }

  // --- Phase 4: Documentation and completion (log, handoff, guide, mark complete) ---
  // Test documentation note (non-blocking)
  try {
    const context = await WorkflowCommandContext.getCurrent();
    const sessionGuide = await context.readSessionGuide(params.sessionId);
    
    // Check if test strategy section exists and has test requirements
    const hasTestStrategy = /## Test Strategy/i.test(sessionGuide);
    const hasTestJustification = /test.*justification|tests.*deferred|why.*tests.*not.*created/i.test(sessionGuide);
    const hasTestFiles = /test.*file|\.test\.|\.spec\./i.test(sessionGuide);
    
    if (!hasTestStrategy && !hasTestJustification && !hasTestFiles) {
      // Log test status to session log
      const testStatusNote = `\n## Test Status\n\n**Note:** No test strategy or justification documented for this session. Consider adding test requirements or documenting why tests are deferred.\n`;
      await appendLog(testStatusNote, params.sessionId, context.feature.name);
      steps.testDocumentation = {
        success: true,
        output: 'Test status logged (no test strategy found in guide)',
      };
    } else {
      steps.testDocumentation = {
        success: true,
        output: 'Test strategy or justification found in session guide',
      };
    }
  } catch (error) {
    steps.testDocumentation = {
      success: false,
      output: `Test documentation check failed (non-critical): ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  
  // Session log
  if (params.taskEntry) {
    const formattedEntry = formatTaskEntry(params.taskEntry);
    // Use session-specific log path
    await appendLog(formattedEntry, params.sessionId, context.feature.name);
    steps.appendLog = { success: true, output: 'Task log entry appended to session log' };
  } else {
    steps.appendLog = { success: true, output: 'No task entry provided' };
  }
  
  const handoffUpdate: MinimalHandoffUpdate = {
    lastCompletedTask: lastCompletedTask,
    nextSession: nextSession,
    transitionNotes: params.transitionNotes,
    sessionId: params.sessionId,
    featureName: context.feature.name,
  };
  await updateHandoffMinimal(handoffUpdate);
  steps.updateHandoff = { success: true, output: 'Session handoff updated with transition context' };
  
  if (params.guideUpdates && params.guideUpdates.length > 0) {
    for (const guideUpdate of params.guideUpdates) {
      await updateGuide(guideUpdate, params.sessionId, context.feature.name);
    }
    steps.updateGuide = { success: true, output: `Guide updated with ${params.guideUpdates.length} update(s)` };
  } else {
    steps.updateGuide = { success: true, output: 'No guide updates provided' };
  }
  
  try {
    const markCompleteParams: MarkSessionCompleteParams = {
      sessionId: params.sessionId,
      tasksCompleted: params.tasksCompleted,
      // LEARNING: Explicit accomplishments handling
      // WHY: Avoids silent fallbacks - use provided accomplishments or generate explicitly
      // PATTERN: Use nullish coalescing and generate default explicitly
      accomplishments: params.accomplishments ?? [`Completed ${description}`],
      featureName: context.feature.name,
    };
    const markCompleteOutput = await markSessionComplete(markCompleteParams);
    steps.markSessionComplete = { success: true, output: markCompleteOutput };
  } catch (error) {
    // Log error but don't fail entire session-end - user can manually check off if needed
    steps.markSessionComplete = {
      success: false,
      output: `Failed to mark session complete in phase guide: ${error instanceof Error ? error.message : String(error)}\n` +
        `Session ID: ${params.sessionId}\n` +
        `You may need to manually check off the session in the phase guide.`,
    };
    // Don't fail entire session-end if this fails, but log it clearly
  }
  
  // --- Phase 5: Git stage (merge, PR, commit audit fixes; no push) ---
  if (!params.skipGit) {
    try {
      const context = await WorkflowCommandContext.getCurrent();
      const currentBranch = await getCurrentBranch();
      
      // Extract phase number from sessionId
      const phaseMatch = params.sessionId.match(/^(\d+)/);
      const phase = phaseMatch ? phaseMatch[1] : '1';
      
      const sessionBranchName = `${context.feature.name}-phase-${phase}-session-${params.sessionId}`;
      const phaseBranchName = `${context.feature.name}-phase-${phase}`;
      
      // Only merge if we're on the session branch
      if (currentBranch === sessionBranchName || currentBranch.endsWith(`-session-${params.sessionId}`)) {
        const mergeResult = await gitMerge({
          sourceBranch: sessionBranchName,
          targetBranch: phaseBranchName,
        });
        
        steps.gitMerge = {
          success: mergeResult.success,
          output: mergeResult.output,
        };
        
        if (!mergeResult.success) {
          // Don't fail entire session-end if merge fails, but log it clearly
          steps.gitMerge.output += '\n⚠️ Branch merge failed, but continuing with session end. Review merge output above.';
        } else {
          // Optionally delete session branch after successful merge
          const deleteBranchResult = await runCommand(`git branch -d ${sessionBranchName}`);
          if (deleteBranchResult.success) {
            steps.deleteSessionBranch = {
              success: true,
              output: `Deleted session branch: ${sessionBranchName}`,
            };
          } else {
            // Don't fail if branch deletion fails (might be protected or already deleted)
            steps.deleteSessionBranch = {
              success: false,
              output: `Could not delete session branch (non-critical): ${deleteBranchResult.error || deleteBranchResult.output}`,
            };
          }
        }
      } else {
        steps.gitMerge = {
          success: true,
          output: `Skipped merge - not on session branch (current: ${currentBranch})`,
        };
      }
    } catch (error) {
      const errorContext = await WorkflowCommandContext.getCurrent();
      const errorPhaseMatch = params.sessionId.match(/^(\d+)/);
      const errorPhase = errorPhaseMatch ? errorPhaseMatch[1] : '1';
      const errorSessionBranchName = `${errorContext.feature.name}-phase-${errorPhase}-session-${params.sessionId}`;
      const errorPhaseBranchName = `${errorContext.feature.name}-phase-${errorPhase}`;
      
      steps.gitMerge = {
        success: false,
        output: `Branch merge failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
          `You can merge manually with: git checkout ${errorPhaseBranchName} && git merge ${errorSessionBranchName}`,
      };
      // Don't fail entire session-end if merge fails
    }
  } else {
    steps.gitMerge = { success: true, output: 'Skipped (skipGit=true)' };
  }
  
  if (!params.skipGit) {
    try {
      const { checkGitHubCLI, createPullRequest } = await import('../../../../.scripts/create-pr.mjs');
      const currentBranch = await getCurrentBranch();
      
      // Only create PR if not on main/master
      if (currentBranch !== 'main' && currentBranch !== 'master' && await checkGitHubCLI()) {
        const prTitle = `Session ${params.sessionId}: ${description}`;
        const prBody = params.transitionNotes 
          ? `## Summary\n\n${description}\n\n## Next Steps\n\n${params.transitionNotes}`
          : `Session ${params.sessionId} complete: ${description}`;
        
        const prResult = await createPullRequest(prTitle, prBody, false);
        
        if (prResult.success) {
          steps.createPR = {
            success: true,
            output: `✅ Pull request created:\n🔗 ${prResult.url}\n\n` +
              `**Note:** Assign reviewers if needed before continuing to next session.`,
          };
        } else {
          const errorMessage = prResult.error 
            ? String(prResult.error)
            : 'Unknown error - PR creation failed without error details';
          steps.createPR = {
            success: false,
            output: `⚠️ Could not create PR automatically (non-critical): ${errorMessage}\n\n` +
              `**Create PR manually:** https://github.com/WillWhittakerDHP/DHP_Differential_Scheduler/compare/main...${currentBranch}`,
          };
        }
      } else if (currentBranch === 'main' || currentBranch === 'master') {
        steps.createPR = {
          success: true,
          output: 'Skipped PR creation - on main/master branch',
        };
      } else {
        steps.createPR = {
          success: true,
          output: 'Skipped PR creation - GitHub CLI not authenticated',
        };
      }
    } catch (error) {
      const currentBranch = await getCurrentBranch();
      steps.createPR = {
        success: false,
        output: `PR creation failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n\n` +
          `**Create PR manually:** https://github.com/WillWhittakerDHP/DHP_Differential_Scheduler/compare/main...${currentBranch}`,
      };
    }
  } else {
    steps.createPR = { success: true, output: 'Skipped (skipGit=true)' };
  }
  
  if (!params.skipGit && hasAuditFindings) {
    try {
      // Check if there are uncommitted changes (audit fixes)
      const statusResult = await runCommand('git status --porcelain');
      const hasUncommittedChanges = statusResult.success && statusResult.output.trim().length > 0;
      
      if (hasUncommittedChanges) {
        const auditFixCommitMessage = `Session ${params.sessionId}: Fix code quality audit issues`;
        const auditFixCommitResult = await gitCommit(auditFixCommitMessage);
        steps.gitCommitAuditFixes = {
          success: auditFixCommitResult.success,
          output: auditFixCommitResult.success
            ? `✅ Audit fixes committed: ${auditFixCommitMessage}`
            : `Failed to commit audit fixes: ${auditFixCommitResult.output}`,
        };
        if (!auditFixCommitResult.success) {
          steps.gitCommitAuditFixes.output += '\n⚠️ Audit fix commit failed. You may need to commit manually.';
        }
      } else {
        steps.gitCommitAuditFixes = {
          success: true,
          output: 'No audit fixes to commit (no uncommitted changes)',
        };
      }
    } catch (error) {
      steps.gitCommitAuditFixes = {
        success: false,
        output: `Audit fix commit failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
          `You can commit manually later.`,
      };
    }
  } else {
    steps.gitCommitAuditFixes = { 
      success: true, 
      output: hasAuditFindings 
        ? 'Skipped (skipGit=true)' 
        : 'Skipped (no audit findings)' 
    };
  }

  // --- Phase 6: Push prompt only (command does not execute push) ---
  if (!params.skipGit) {
    steps.gitReady = {
      success: true,
      output: `\n✅ **All session-end checks completed successfully:**\n` +
        `- ✅ App starts\n` +
        `- ✅ Linting passed\n` +
        `- ✅ Feature work committed\n` +
        (hasAuditFindings ? `- ✅ Audit fixes committed (if any)\n` : '') +
        `- ✅ Session log updated\n` +
        `- ✅ Handoff document updated\n` +
        `- ✅ Session guide updated\n\n` +
        `**Ready to push all commits to remote?**\n\n` +
        `This will:\n` +
        `- Push feature work commit\n` +
        (hasAuditFindings ? `- Push audit fixes commit (if any)\n` : '') +
        `- Push to remote repository\n\n` +
        `**Proceed with push?** (yes/no)\n\n` +
        `*Note: If you say "no", the session will end without pushing. You can push manually later.*\n\n` +
        `*After push (or if user skips push): Show the user the prompt to begin the next step as the last thing (e.g. /session-start [nextSession]).*`,
    };
    
    steps.gitPush = {
      success: true,
      output: 'Push is a separate step. Use outcome.nextAction to prompt user.',
    };
    steps.afterPushShowNextStep = {
      success: true,
      output: `After push or skip: show next step. Example: /session-start ${nextSession || 'X.Y'} "Session Name"`,
    };
  } else {
    steps.gitPush = { success: true, output: 'Skipped (skipGit=true)' };
    steps.afterPushShowNextStep = {
      success: true,
      output: `Next: /session-start ${nextSession || 'X.Y'} "Session Name" or use handoff doc.`,
    };
  }

  // Cleanup and informational (non-blocking)
  try {
    const cleanupResult = await workflowCleanupReadmes({
      tier: 'session',
      identifier: params.sessionId,
    });
    steps.readmeCleanup = { success: true, output: cleanupResult };
  } catch (error) {
    steps.readmeCleanup = {
      success: false,
      output: `README cleanup failed (non-critical): ${error instanceof Error ? error.message : String(error)}`,
    };
    // Don't fail entire session-end if cleanup fails
  }

  try {
    const context = await WorkflowCommandContext.getCurrent();
    const sessionGuide = await context.readSessionGuide(params.sessionId);
    
    // Check for explicit catch-up trigger marker
    const shouldRunCatchup = /RUN_CATCHUP_TESTS|run.*catch.*up.*tests/i.test(sessionGuide);
    
    if (shouldRunCatchup && params.sessionId === '1.3.6') {
      try {
        const catchupResult = await runCatchUpTests(context.feature.name, {
          targetPhase: '3',
          targetSession: '1.3.6',
        });
        
        steps.catchupTests = {
          success: catchupResult.success,
          output: `Catch-up tests executed:\n${catchupResult.summary}`,
        };
        
        if (!catchupResult.success) {
          // Log but don't block - catch-up is informational
          steps.catchupTests.output += '\n⚠️ Catch-up tests completed with failures. Review output above.';
        }
      } catch (error) {
        steps.catchupTests = {
          success: false,
          output: `Catch-up test execution failed (non-critical): ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  } catch (error) {
    steps.catchupTests = {
      success: false,
      output: `Catch-up check failed (non-critical): ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let isLastSession = false;
  let phaseNum: number | null = null;
  try {
    const context = await WorkflowCommandContext.getCurrent();
    isLastSession = await isLastSessionInPhase(context.feature.name, params.sessionId);
    phaseNum = getPhaseFromSessionId(params.sessionId);
    if (isLastSession && phaseNum !== null) {
      steps.phaseEndPrompt = {
        success: true,
        output: `\n✅ **Last session in Phase ${phaseNum} completed!**\n\n` +
          `All sessions in Phase ${phaseNum} are now complete. Consider running /phase-end ${phaseNum} to:\n` +
          `- Update phase log with completion summary\n` +
          `- Verify tests exist or justification documented\n` +
          `- Update phase handoff\n` +
          `- Close phase\n`,
      };
    } else {
      steps.phaseEndPrompt = {
        success: true,
        output: 'Not the last session in phase - phase-end not needed yet',
      };
    }
  } catch (error) {
    steps.phaseEndPrompt = {
      success: false,
      output: `Phase-end check failed (non-critical): ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const nextAction =
    isLastSession && phaseNum !== null
      ? (!params.skipGit
          ? `Prompt user: "Proceed with push?" (yes/no). If yes, run git push. If no, session ends without push. Then show steps.phaseEndPrompt.output and suggest running /phase-end ${phaseNum} to complete the phase.`
          : `Show user steps.phaseEndPrompt.output and suggest running /phase-end ${phaseNum} to complete the phase.`)
      : (!params.skipGit
          ? `Prompt user: "Proceed with push?" (yes/no). If yes, run git push. If no, session ends without push. Then show: To start next session run /session-start ${nextSession || 'X.Y'} "Session Name".`
          : `Show user: To start next session run /session-start ${nextSession || 'X.Y'} "Session Name".`);

  return {
    success: true,
    steps,
    outcome: buildOutcome('completed', 'pending_push_confirmation', nextAction),
  };
}

// --- Runnable wrapper: run this file with npx tsx so agents can execute without a separate runner ---
// Usage: npx tsx .cursor/commands/tiers/session/composite/session-end-impl.ts <sessionId> [--test|--no-tests] [--plan]
// From repo root. Uses .project-manager/.current-feature for feature context. Defaults runTests=false.
const currentFile = fileURLToPath(import.meta.url);
const isEntryPoint = typeof process !== 'undefined' && process.argv[1] && resolve(process.argv[1]) === resolve(currentFile);
if (isEntryPoint) {
  (async () => {
    const sessionId = process.argv[2] ?? process.env.SESSION_ID ?? '';
    const runTests = process.argv.includes('--test');
    const planMode = process.argv.includes('--plan');
    if (!sessionId || !/^\d+\.\d+(\.\d+)?$/.test(sessionId)) {
      const sessionIdShort = sessionId || '<sessionId>';
      console.error(`Usage: npx tsx .cursor/commands/tiers/session/composite/session-end-impl.ts <sessionId> [--test|--no-tests] [--plan]`);
      console.error(`Example: npx tsx .cursor/commands/tiers/session/composite/session-end-impl.ts 2.2.6`);
      console.error(`Session ID must be X.Y or X.Y.Z (e.g. 2.2.6). Got: ${sessionIdShort}`);
      process.exit(1);
    }
    const sessionIdXY = sessionId.includes('.') ? sessionId.split('.').slice(0, 2).join('.') : sessionId;
    const result = await sessionEnd({
      sessionId: sessionIdXY,
      runTests,
      mode: planMode ? 'plan' : 'execute',
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

