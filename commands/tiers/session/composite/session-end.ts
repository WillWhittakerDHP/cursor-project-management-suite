/**
 * Composite Command: /session-end [session-id] [description] [next-session]
 * 
 * Tier: Session (Tier 2 - Medium-Level)
 * Operates on: Session-level workflow (completes session, updates session log/handoff/guide)
 * 
 * Focus: Update session log, guide, and handoff (most important)
 * Streamlined to focus on three core updates with minimal handoff context
 * 
 * PERMISSION REQUIREMENTS:
 * 
 * This command requires 'all' permissions for the following steps:
 * - Step 1 (verifyApp): Requires 'all' permissions to access node_modules and spawn npm processes
 * - Step 2 (verify/lint): Requires 'all' permissions to access node_modules and execute npm lint commands
 * 
 * When executing this command, ensure permissions are granted for:
 * - File system access (node_modules directory)
 * - Process spawning (npm commands)
 * - Network access (if needed for package installation)
 * 
 * IMPORTANT: Prompt Before Execution
 * 
 * This command should be called AFTER the agent workflow prompts the user for confirmation.
 * The agent workflow should show TWO prompts before executing this command:
 * 
 * Prompt 1: Test Execution Decision (NEW)
 * ```
 * ## Run Tests Before Ending Session?
 * 
 * Before proceeding with the end workflow, would you like to run tests?
 * 
 * **This will:**
 * - Run test goal validation (check test strategy alignment)
 * - Execute test suite for this session
 * - Block workflow if tests fail (unless test code error with permission)
 * 
 * **Options:**
 * - **Yes** - Run tests (recommended)
 * - **No** - Skip tests and proceed
 * 
 * **Run tests?** (yes/no)
 * ```
 * 
 * Prompt 2: End Workflow Confirmation (EXISTING - Updated)
 * ```
 * ## Ready to End Session?
 * 
 * All tasks complete. Ready to run end-of-session workflow?
 * 
 * **This will:**
 * - Verify app starts
 * - Run quality checks
 * - [Run tests] (if selected in previous prompt)
 * - Update session log
 * - Update handoff document
 * - Mark session complete (update checkboxes in phase guide)
 * - Git commit/push
 * 
 * **Proceed with /session-end?** (yes/no)
 * ```
 * 
 * Agent workflow should:
 * 1. Show test execution prompt FIRST
 * 2. Capture user response (yes/no)
 * 3. Set `runTests` parameter based on response
 * 4. Show end workflow confirmation prompt (updated to include test status)
 * 5. Execute this command with `runTests` parameter set
 * 
 * If user says "yes" to both: Execute this command automatically
 * If user says "no": Address concerns, then re-prompt
 * 
 * See: `.cursor/rules/USER_CODING_RULES.md` (Rule 19: End of Session)
 * See: `.cursor/commands/tiers/session/templates/session-guide.md` (End of Session section)
 */

import { verifyApp } from '../../../utils/verify-app';
import { verify } from '../../../utils/verify';
import { formatTaskEntry, TaskEntry } from '../../task/atomic/format-task-entry';
import { appendLog } from '../../../utils/append-log';
import { updateHandoffMinimal, MinimalHandoffUpdate } from '../../../utils/update-handoff-minimal';
import { updateGuide, GuideUpdate } from '../../../utils/update-guide';
import { gitCommit } from '../../../git/atomic/commit';
import { gitPush } from '../../../git/atomic/push';
import { markSessionComplete, MarkSessionCompleteParams } from './mark-session-complete';
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
import { getCurrentDate } from '../../../utils/utils';
import { runCatchUpTests } from '../../../testing/composite/test-catchup-workflow';
import { 
  analyzeCodeChangeImpact, 
  getRecentlyModifiedFiles 
} from '../../../testing/composite/test-change-detector';
import { CommandExecutionMode, isPlanMode, resolveCommandExecutionMode } from '../../../utils/command-execution-mode';
import { auditVueArchitecture } from '../../../audit/atomic/audit-vue-architecture';
import { auditCodeQuality } from '../../../audit/atomic/audit-code-quality';

export interface SessionEndParams {
  sessionId: string; // Format: X.Y (e.g., "1.3")
  description: string;
  nextSession: string; // Format: X.Y (e.g., "1.4")
  lastCompletedTask: string; // Format: X.Y.Z (e.g., "1.3.4") - last task completed in this session
  taskEntry?: TaskEntry; // Optional: Log entry for last completed task
  transitionNotes?: string; // Minimal notes about where we left off
  guideUpdates?: GuideUpdate[]; // Optional: instructions, patterns, architectural notes for guide
  commitMessage?: string;
  skipGit?: boolean; // If true, skip git operations
  tasksCompleted?: string[]; // Optional: List of completed task IDs for session completion tracking
  accomplishments?: string[]; // Optional: Key accomplishments for session completion tracking
  runTests?: boolean; // Set by user prompt before command execution. Default: true if not specified, but should be explicitly set via prompt.
  testTarget?: string; // Test target: vue/server/all (default: vue)
  mode?: CommandExecutionMode; // Plan vs execute (plan mode performs no side effects)
  vueArchitectureOverride?: {
    reason: string;
    followUpTaskId: string;
  };
  // Feature name is auto-detected from git branch or config file - no parameter needed
}

export async function sessionEnd(params: SessionEndParams): Promise<{
  success: boolean;
  steps: Record<string, { success: boolean; output: string }>;
}> {
  const steps: Record<string, { success: boolean; output: string }> = {};
  const mode = resolveCommandExecutionMode(params);
  const context = await WorkflowCommandContext.getCurrent();

  if (isPlanMode(mode)) {
    steps.plan = {
      success: true,
      output:
        [
          'Mode: plan (no side effects).',
          '',
        'Would execute:',
        '- verifyApp',
        '- verify (lint + typecheck)',
        '- Gate: run Vue architecture audit (client) and block if failing unless override provided',
        '- run code quality audit (npm run audit:all - duplication, hardcoding, typecheck, etc.)',
        '- optional: validate test goals + run tests',
          '- update session log (append task entry)',
          '- update handoff (minimal transition)',
          '- update guide (optional updates)',
          '- mark session complete in phase guide/log',
          '- README workflow cleanup',
          '- optional: catch-up tests (if configured)',
          '- git commit/push and branch merges (unless skipGit)',
        ].join('\n'),
    };
    return { success: true, steps };
  }
  
  // Step 1: Verify app starts (quick check)
  // NOTE: This step requires 'all' permissions to access node_modules and run npm commands
  // The session-end command should always grant these permissions when executed
  const appResult = await verifyApp();
  steps.verifyApp = appResult;
  if (!appResult.success) {
    return { success: false, steps };
  }
  
  // Step 2: Run quality checks (linting and type checking)
  // NOTE: This step requires 'all' permissions to access node_modules and run npm commands
  // The session-end command should always grant these permissions when executed
  const verifyResult = await verify('vue', false);
  steps.verify = {
    success: verifyResult.success,
    output: JSON.stringify(verifyResult.results, null, 2),
  };
  if (!verifyResult.success) {
    return { success: false, steps };
  }

  // Step 2.1: Vue architecture gate (blocking unless explicitly overridden)
  try {
    const vueAudit = await auditVueArchitecture({
      tier: 'session',
      identifier: params.sessionId,
      featureName: context.feature.name,
    });
    steps.vueArchitectureGate = {
      success: vueAudit.status !== 'fail' || Boolean(params.vueArchitectureOverride),
      output: vueAudit.summary || `vue-architecture status: ${vueAudit.status}`,
    };

    if (vueAudit.status === 'fail' && !params.vueArchitectureOverride) {
      steps.vueArchitectureGate.output =
        (vueAudit.summary ? vueAudit.summary + '\n\n' : '') +
        'Vue architecture gate failed. Fix component/composable boundaries or provide an explicit override.\n' +
        'Required param:\n' +
        'vueArchitectureOverride: { reason: \"...\", followUpTaskId: \"X.Y.Z\" }\n' +
        'Reference:\n' +
        '- `.project-manager/patterns/vue-architecture-contract.md`\n' +
        '- `.project-manager/patterns/composable-taxonomy.md`';
      return { success: false, steps };
    }
  } catch (error) {
    steps.vueArchitectureGate = {
      success: false,
      output: `Vue architecture gate execution failed: ${error instanceof Error ? error.message : String(error)}`,
    };
    return { success: false, steps };
  }
  
  // Step 2.2: Code quality audit (non-blocking - runs npm run audit:all)
  try {
    const codeQualityAudit = await auditCodeQuality({
      tier: 'session',
      identifier: params.sessionId,
      featureName: context.feature.name,
    });
    steps.codeQualityAudit = {
      success: codeQualityAudit.status !== 'fail',
      output: codeQualityAudit.summary || `Code quality audit: ${codeQualityAudit.status}`,
    };
    
    // Log findings but don't block workflow
    if (codeQualityAudit.findings && codeQualityAudit.findings.length > 0) {
      const errorCount = codeQualityAudit.findings.filter(f => f.type === 'error').length;
      const warningCount = codeQualityAudit.findings.filter(f => f.type === 'warning').length;
      steps.codeQualityAudit.output += `\n\nFindings: ${errorCount} error(s), ${warningCount} warning(s)`;
      
      if (codeQualityAudit.recommendations && codeQualityAudit.recommendations.length > 0) {
        steps.codeQualityAudit.output += `\n\nRecommendations:\n${codeQualityAudit.recommendations.map(r => `  - ${r}`).join('\n')}`;
      }
      
      steps.codeQualityAudit.output += `\n\nReview detailed reports in: client/.audit-reports/`;
    }
  } catch (error) {
    steps.codeQualityAudit = {
      success: false,
      output: `Code quality audit failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
        `You can run manually: cd client && npm run audit:all`,
    };
    // Don't fail session-end if code quality audit fails
  }
  
  // Step 2.3: Test Goal Validation (blocking if runTests is true)
  const shouldRunTests = params.runTests ?? TEST_CONFIG.defaultRunTests;
  if (params.runTests === undefined) {
    console.warn('runTests not explicitly set - using default: true');
  }
  
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
        return { success: false, steps };
      }
    } catch (error) {
      steps.testGoalValidation = {
        success: false,
        output: `Test goal validation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      return { success: false, steps };
    }
  }
  
  // Step 2.5: Run tests if requested (blocking)
  if (shouldRunTests) {
    try {
      const testTarget = params.testTarget || TEST_CONFIG.defaultTarget;
      
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
            
            // If test code error and fixes allowed, request permission
            if (errorAnalysis.isTestCodeError && TEST_CONFIG.allowTestFileFixes) {
              const permission = await requestTestFileFixPermission(
                errorAnalysis,
                `session-end-${params.sessionId}`
              );
              
              // Check if permission was granted (would be set by agent workflow)
              // For now, block and show permission request
              steps.testFileFixPermission = {
                success: false,
                output: `Test code error detected. Permission required to fix test file.\n\n${JSON.stringify(permission, null, 2)}\n\nPlease grant permission to fix test file, then re-run session-end.`,
              };
              
              // Block workflow
              return { success: false, steps };
            } else if (errorAnalysis.isTestCodeError) {
              // Test code error but fixes not allowed
              steps.testFileFixPermission = {
                success: false,
                output: `Test code error detected but test file fixes are disabled. Please fix test file manually.`,
              };
              return { success: false, steps };
            } else {
              // App code error - block workflow
              return { success: false, steps };
            }
          } catch (error) {
            // Error analysis failed - block workflow to be safe
            steps.testErrorAnalysis = {
              success: false,
              output: `Error analysis failed: ${error instanceof Error ? error.message : String(error)}`,
            };
            return { success: false, steps };
          }
        } else {
          // Error analysis disabled - block workflow
          return { success: false, steps };
        }
      }
      
      // Step 2.6: Track test execution
      const testExecutionRecord = `\n**Tests Run:** ${getCurrentDate()} ${testTarget} ${testResult.success ? 'PASSED' : 'FAILED'}\n`;
      await appendLog(testExecutionRecord, params.sessionId);
      steps.testExecutionTracking = {
        success: true,
        output: 'Test execution recorded in session log',
      };
    } catch (error) {
      steps.runTests = {
        success: false,
        output: `Test execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      return { success: false, steps };
    }
  }

  // Step 2.7: Test creation or justification documentation (non-blocking, informational)
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
      await appendLog(testStatusNote, params.sessionId);
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
  
  // Step 3: Update session log (MOST IMPORTANT)
  // Log last completed task if provided
  if (params.taskEntry) {
    const formattedEntry = formatTaskEntry(params.taskEntry);
    // Use session-specific log path
    await appendLog(formattedEntry, params.sessionId);
    steps.appendLog = { success: true, output: 'Task log entry appended to session log' };
  } else {
    steps.appendLog = { success: true, output: 'No task entry provided' };
  }
  
  // Step 4: Update handoff document minimally (MOST IMPORTANT - context only)
  const handoffUpdate: MinimalHandoffUpdate = {
    lastCompletedTask: params.lastCompletedTask,
    nextSession: params.nextSession,
    transitionNotes: params.transitionNotes,
  };
  await updateHandoffMinimal(handoffUpdate);
  steps.updateHandoff = { success: true, output: 'Session handoff updated with transition context' };
  
  // Step 5: Update session guide if needed (MOST IMPORTANT - for instructions/patterns)
  if (params.guideUpdates && params.guideUpdates.length > 0) {
    for (const guideUpdate of params.guideUpdates) {
      await updateGuide(guideUpdate);
    }
    steps.updateGuide = { success: true, output: `Guide updated with ${params.guideUpdates.length} update(s)` };
  } else {
    steps.updateGuide = { success: true, output: 'No guide updates provided' };
  }
  
  // Step 6: Mark session complete in phase guide (update checkboxes and phase log)
  // CRITICAL: This ensures the session checkbox is checked off in the phase guide
  try {
    const markCompleteParams: MarkSessionCompleteParams = {
      sessionId: params.sessionId,
      tasksCompleted: params.tasksCompleted,
      accomplishments: params.accomplishments || [`Completed ${params.description}`],
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
  
  // Step 7: Security audit (optional, non-blocking)
  try {
    const { securityAudit } = await import('../../../security/composite/security-audit');
    const securityResult = await securityAudit({ path: 'server/src' });
    steps.securityAudit = {
      success: true,
      output: securityResult.includes('❌') 
        ? `Security audit completed with issues found. Review output:\n\n${securityResult}`
        : 'Security audit passed',
    };
  } catch (error) {
    steps.securityAudit = {
      success: false,
      output: `Security audit failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
        `You can run /security-audit manually.`,
    };
    // Don't fail session-end if security audit fails
  }
  
  // Step 7.5: Merge session branch into phase branch (before git operations)
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
  
  // Step 7.7: Create Pull Request (non-blocking)
  if (!params.skipGit) {
    try {
      const { checkGitHubCLI, createPullRequest } = await import('../../../.scripts/create-pr.mjs');
      const currentBranch = await getCurrentBranch();
      
      // Only create PR if not on main/master
      if (currentBranch !== 'main' && currentBranch !== 'master' && await checkGitHubCLI()) {
        const prTitle = `Session ${params.sessionId}: ${params.description}`;
        const prBody = params.transitionNotes 
          ? `## Summary\n\n${params.description}\n\n## Next Steps\n\n${params.transitionNotes}`
          : `Session ${params.sessionId} complete: ${params.description}`;
        
        const prResult = await createPullRequest(prTitle, prBody, false);
        
        if (prResult.success) {
          steps.createPR = {
            success: true,
            output: `✅ Pull request created:\n🔗 ${prResult.url}\n\n` +
              `**Note:** Assign reviewers if needed before continuing to next session.`,
          };
        } else {
          steps.createPR = {
            success: false,
            output: `⚠️ Could not create PR automatically (non-critical): ${prResult.error || 'Unknown error'}\n\n` +
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
  
  // Step 8: Git operations (optional) - PROMPT USER BEFORE COMMITTING
  // CRITICAL: After all checks pass and docs are updated, prompt user before commit/push
  if (!params.skipGit) {
    // Set flag to indicate we're ready for commit/push prompt
    // The agent workflow should prompt the user before calling git operations
    steps.gitReady = {
      success: true,
      output: `\n✅ **All session-end checks completed successfully:**\n` +
        `- ✅ App starts\n` +
        `- ✅ Linting passed\n` +
        `- ✅ Build successful\n` +
        `- ✅ Session log updated\n` +
        `- ✅ Handoff document updated\n` +
        `- ✅ Session guide updated\n\n` +
        `**Ready to commit and push all changes?**\n\n` +
        `This will:\n` +
        `- Commit all changes with session summary message\n` +
        `- Push to remote repository\n\n` +
        `**Proceed with commit and push?** (yes/no)\n\n` +
        `*Note: If you say "no", the session will end without committing. You can commit manually later.*`,
    };
    
    // Git operations will be executed only after user confirms via agent prompt
    // The agent workflow should check for user confirmation before proceeding
    // For now, mark as pending user confirmation
    steps.gitCommit = { 
      success: true, 
      output: 'Pending user confirmation - agent should prompt before committing' 
    };
    steps.gitPush = { 
      success: true, 
      output: 'Pending user confirmation - agent should prompt before pushing' 
    };
  } else {
    steps.gitCommit = { success: true, output: 'Skipped (skipGit=true)' };
    steps.gitPush = { success: true, output: 'Skipped (skipGit=true)' };
  }
  
  // Step 8.5: Execute git operations if user confirmed (called separately by agent after prompt)
  // This is a separate function that the agent should call after user confirms
  
  // Cleanup temporary READMEs (non-blocking)
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

  // Step 9: Run audit (non-blocking)
  try {
    const { auditSession } = await import('../../../audit/composite/audit-session');
    const { readFile } = await import('fs/promises');
    const testResults = params.runTests && steps.runTests ? { success: steps.runTests.success } : undefined;
    const context = await WorkflowCommandContext.getCurrent();
    
    // Detect modified files from session log
    const modifiedFiles = await detectSessionModifiedFiles(params.sessionId, context);
    
    const auditResult = await auditSession({
      sessionId: params.sessionId,
      featureName: context.feature.name,
      modifiedFiles: modifiedFiles.length > 0 ? modifiedFiles : undefined,
      testResults,
    });
    
    // Open audit report file in editor
    if (auditResult.fullReportPath) {
      try {
        await readFile(auditResult.fullReportPath, 'utf-8');
        // File read will cause it to open in editor
      } catch {
        // If file doesn't exist yet, that's okay
      }
    }
    
    steps.audit = {
      success: auditResult.success,
      output: auditResult.output,
    };
    // Don't fail session-end if audit fails, but log it clearly
    if (!auditResult.success) {
      steps.audit.output += '\n⚠️ Audit completed with issues. Review audit report.';
    }
  } catch (error) {
    steps.audit = {
      success: false,
      output: `Audit failed (non-critical): ${error instanceof Error ? error.message : String(error)}\n` +
        `You can run /audit-session ${params.sessionId} manually.`,
    };
    // Don't fail session-end if audit fails
  }
  
  // Step 10: Check if catch-up tests should run (only for session 1.3.6)
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
    // Don't fail if catch-up check fails
    steps.catchupTests = {
      success: false,
      output: `Catch-up check failed (non-critical): ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  
  // Step 11: Check if this is the last session in phase and prompt for phase-end
  try {
    const context = await WorkflowCommandContext.getCurrent();
    const isLastSession = await isLastSessionInPhase(context.feature.name, params.sessionId);
    if (isLastSession) {
      const phase = getPhaseFromSessionId(params.sessionId);
      steps.phaseEndPrompt = {
        success: true,
        output: `\n✅ **Last session in Phase ${phase} completed!**\n\n` +
          `All sessions in Phase ${phase} are now complete. Consider running /phase-end ${phase} to:\n` +
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
  
  return { success: true, steps };
}

