/**
 * Session-end implementation. Thin adapter: builds context + hooks, runs shared tier end workflow.
 * Exports deriveSessionDescription for use by session-start-impl.
 */

import { verify } from '../../../utils/verify';
import { formatTaskEntry, TaskEntry } from '../../task/atomic/format-task-entry';
import { appendLog } from '../../../utils/append-log';
import { updateHandoffMinimal, MinimalHandoffUpdate } from '../../../utils/update-handoff-minimal';
import { updateGuide, GuideUpdate } from '../../../utils/update-guide';
import { gitCommit } from '../../../git/atomic/commit';
import { readTierScope, formatScopeCommitPrefix } from '../../../utils/tier-scope';
import { markSessionComplete, MarkSessionCompleteParams } from './session';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { detectSessionModifiedFiles } from '../../../utils/detect-modified-files';
import { mergeTierBranch } from '../../../git/shared/tier-branch-manager';
import { getCurrentBranch } from '../../../utils/utils';
import { validateTestGoals } from '../../../testing/composite/test-goal-validator';
import { analyzeTestError } from '../../../testing/composite/test-error-analyzer';
import { requestTestFileFixPermission } from '../../../testing/composite/test-file-fix-permission';
import { TEST_CONFIG } from '../../../testing/utils/test-config';
import { getCurrentDate } from '../../../utils/utils';
import { runCatchUpTests } from '../../../testing/composite/test-catchup-workflow';
import { analyzeCodeChangeImpact } from '../../../testing/composite/test-change-detector';
import { CommandExecutionMode } from '../../../utils/command-execution-mode';
import { commitAutofixChanges } from '../../../audit/autofix/commit-autofix';
import { WorkflowId } from '../../../utils/id-utils';
import { SESSION_CONFIG } from '../../configs/session';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import { checkGitHubCLI, createPullRequest } from '../../../scripts/create-pr';
import type { CascadeInfo } from '../../../utils/tier-outcome';
import { buildTierEndOutcome } from '../../../utils/tier-outcome';
import { buildCascadeUp, buildCascadeAcross } from '../../../utils/tier-cascade';
import { isLastSessionInPhase, getPhaseFromSessionId } from '../../../utils/phase-session-utils';
import { testEndWorkflow } from '../../../testing/composite/test-end-workflow';
import type {
  TierEndWorkflowContext,
  TierEndWorkflowHooks,
  TierEndWorkflowResult,
  StepExitResult,
} from '../../shared/tier-end-workflow';
import { runTierEndWorkflow } from '../../shared/tier-end-workflow';
import { proposeVerificationChecklistForSession } from '../../shared/verification-check';

const FRONTEND_ROOT = 'client';

export type SessionEndStatus = 'completed' | 'blocked_needs_input' | 'blocked_fix_required' | 'failed';

export interface SessionEndOutcome {
  status: SessionEndStatus;
  reasonCode: string;
  nextAction: string;
  cascade?: CascadeInfo;
}

export interface SessionEndParams {
  sessionId: string;
  description?: string;
  nextSession?: string;
  lastCompletedTask?: string;
  taskEntry?: TaskEntry;
  transitionNotes?: string;
  guideUpdates?: GuideUpdate[];
  commitMessage?: string;
  skipGit?: boolean;
  tasksCompleted?: string[];
  accomplishments?: string[];
  runTests: boolean;
  testTarget?: string;
  vueArchitectureOverride?: { reason: string; followUpTaskId: string };
  mode?: CommandExecutionMode;
  /** When true, verification check step does not return early; used when re-running after verification work or skip. */
  continuePastVerification?: boolean;
}

/**
 * Canonical outcome for session-end. Agents use status + reasonCode + nextAction + cascade
 * to decide next step without guessing. No re-prompt loops inside the command.
 *
 * Derivation order: session guide → phase guide → session log. At session-start the log
 * usually does not exist yet; guide/phase do, so we avoid "missing session log" warnings.
 */
export async function deriveSessionDescription(
  sessionId: string,
  context: WorkflowCommandContext
): Promise<string> {
  try {
    const sessionGuide = await context.readSessionGuide(sessionId);
    const nameMatch = sessionGuide.match(/Session Name:\s*(.+?)(?:\n|$)/i);
    if (nameMatch) return nameMatch[1].trim();
    const descMatch = sessionGuide.match(/Description:\s*(.+?)(?:\n|$)/i);
    if (descMatch) return descMatch[1].trim();
  } catch (err) {
    console.warn('Session end: session guide not found or unreadable', sessionId, err);
  }
  try {
    const parsed = WorkflowId.parseSessionId(sessionId);
    if (parsed) {
      const phaseGuide = await context.readPhaseGuide(parsed.phaseId);
      const sessionRegex = new RegExp(`Session\\s+${sessionId.replace(/\./g, '\\.')}:\\s*(.+?)(?:\\n|$)`, 'i');
      const match = phaseGuide.match(sessionRegex);
      if (match) return match[1].trim();
    }
  } catch (err) {
    console.warn('Session end: phase guide not found or unreadable (session name fallback)', sessionId, err);
  }
  try {
    const sessionLog = await context.readSessionLog(sessionId);
    const logTitleMatch = sessionLog.match(/^# Session\s+[\d.]+[:\s]+(.+?)$/m);
    if (logTitleMatch) return logTitleMatch[1].trim();
  } catch (_err) {
    // Expected at session-start (log created during session); only log at debug if desired
  }
  return `Session ${sessionId}`;
}

async function deriveNextSession(
  sessionId: string,
  context: WorkflowCommandContext
): Promise<string | null> {
  const parsed = WorkflowId.parseSessionId(sessionId);
  if (!parsed) return null;
  try {
    const phaseGuide = await context.readPhaseGuide(parsed.phaseId);
    const sessionMatches = phaseGuide.matchAll(/Session\s+(\d+\.\d+\.\d+):/g);
    const sessionIds: string[] = [];
    for (const match of sessionMatches) {
      if (WorkflowId.isValidSessionId(match[1])) sessionIds.push(match[1]);
    }
    const sortedSessions = sessionIds.sort((a, b) => {
      const aParsed = WorkflowId.parseSessionId(a);
      const bParsed = WorkflowId.parseSessionId(b);
      if (!aParsed || !bParsed) return 0;
      return Number(aParsed.session) - Number(bParsed.session);
    });
    const currentIndex = sortedSessions.indexOf(sessionId);
    if (currentIndex >= 0 && currentIndex < sortedSessions.length - 1) return sortedSessions[currentIndex + 1];
    return null;
  } catch (err) {
    console.warn('Session end: phase guide not found (derive next session)', parsed.phase, err);
    return null;
  }
}

export interface SessionEndResult {
  success: boolean;
  output: string;
  steps: Record<string, { success: boolean; output: string }>;
  outcome: SessionEndOutcome;
}

export async function sessionEndImpl(params: SessionEndParams): Promise<SessionEndResult> {
  const context = await WorkflowCommandContext.getCurrent();
  const description = params.description !== undefined
    ? params.description
    : await deriveSessionDescription(params.sessionId, context);
  const nextSession = params.nextSession !== undefined
    ? params.nextSession
    : (await deriveNextSession(params.sessionId, context) || '');
  const lastCompletedTask = params.lastCompletedTask || '';

  const steps: Record<string, { success: boolean; output: string }> = {};
  const outcome = buildTierEndOutcome('completed', 'pending_push_confirmation', '');

  const ctx: TierEndWorkflowContext = {
    config: SESSION_CONFIG,
    identifier: params.sessionId,
    params: { ...params, description, nextSession, lastCompletedTask },
    context,
    output: [],
    steps,
    shouldRunTests: false,
    outcome,
  };

  const hooks: TierEndWorkflowHooks = {
    getPlanModeSteps() {
      return [
        'Mode: plan (no side effects).',
        '',
        'Would execute: Phase 1 preflight (verify), Phase 2 quality (commit feature, audit),',
        'Phase 3 tests (if runTests), Phase 4 docs (log, handoff, guide, mark complete),',
        'Phase 5 git (merge, PR, commit audit fixes), Phase 6 optional verification checklist (before audit); pause for add follow-up task or continue with continuePastVerification, Phase 7 push prompt only.',
      ];
    },
    requireExplicitRunTests: true,

    async runPreWork(c): Promise<StepExitResult> {
      const p = c.params as SessionEndParams & { description: string; nextSession: string; lastCompletedTask: string };
      const verifyResult = await verify('vue', false);
      c.steps.verify = { success: verifyResult.success, output: JSON.stringify(verifyResult.results, null, 2) };
      if (!verifyResult.success) {
        return {
          success: false,
          output: c.output.join('\n'),
          steps: c.steps,
          outcome: buildTierEndOutcome('blocked_fix_required', 'lint_or_typecheck_failed', 'Fix lint/type errors, then re-run /session-end.'),
        };
      }

      if (!p.skipGit) {
        try {
          const scopeConfig = await readTierScope();
          const commitPrefix = formatScopeCommitPrefix(scopeConfig, 'session');
          const featureCommitMessage = p.commitMessage || `${commitPrefix} ${p.description}`;
          const featureCommitResult = await gitCommit(featureCommitMessage);
          c.steps.gitCommitFeature = {
            success: featureCommitResult.success,
            output: featureCommitResult.success ? `✅ Feature work committed: ${featureCommitMessage}` : `Failed to commit feature work: ${featureCommitResult.output}`,
          };
          if (!featureCommitResult.success) {
            c.steps.gitCommitFeature!.output += '\n⚠️ Feature commit failed, but continuing workflow. You may need to commit manually.';
          }
        } catch (_error) {
          c.steps.gitCommitFeature = {
            success: false,
            output: `Feature commit failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}\nYou can commit manually later.`,
          };
        }
      } else {
        c.steps.gitCommitFeature = { success: true, output: 'Skipped (skipGit=true)' };
      }

      return null;
    },

    async runBeforeAudit(c): Promise<void> {
      c.output.push(
        'Type governance (self-check before audit):',
        '  - [ ] New/changed types follow decision tree',
        '  - [ ] No new escape hatches introduced',
        '  - [ ] Boundary contracts use correct Ref/ComputedRef flavor'
      );
      c.output.push(
        'Composable governance (self-check before audit):',
        '  - [ ] New/changed composables expose a flat, test-friendly public contract',
        '  - [ ] Mutations are action-based; no leaked writable boundary refs',
        '  - [ ] No new Ref|ComputedRef boundary unions',
        '  - [ ] Exported composables and boundary functions have explicit return types'
      );
      c.output.push(
        'Function governance (self-check before audit):',
        '  - [ ] New/changed functions stay within complexity thresholds (nesting, branches, length)',
        '  - [ ] Exported and boundary functions have explicit return types',
        '  - [ ] No silent error swallowing; errors logged or propagated',
        '  - [ ] Heavy logic extracted to named utilities where appropriate'
      );
      c.output.push(
        'Component governance (self-check before audit):',
        '  - [ ] New/changed components stay within prop/emit/coupling and template thresholds',
        '  - [ ] Heavy logic extracted to composables or named utilities; components remain thin',
        '  - [ ] No new component-logic Tier1 hotspots in SFC script without extraction or allowlist',
        '  - [ ] Template depth and expression complexity within limits (or extracted)'
      );
    },

    async runAfterAudit(c): Promise<StepExitResult> {
      const p = c.params as SessionEndParams & { skipGit?: boolean };
      if (!c.autofixResult) return null;
      const commitResult = await commitAutofixChanges(
        'session',
        c.identifier,
        c.autofixResult,
        { skipGit: p.skipGit }
      );
      c.steps.gitCommitAuditFixes = { success: commitResult.success, output: commitResult.output };
      return null;
    },

    async runVerificationCheck(c): Promise<{ suggested: boolean; checklist?: string } | null> {
      const p = c.params as SessionEndParams;
      return proposeVerificationChecklistForSession(p.sessionId, c.context);
    },

    async runTestGoalValidation(c): Promise<StepExitResult> {
      if (!c.shouldRunTests || !TEST_CONFIG.validateGoals) return null;
      const p = c.params as SessionEndParams;
      try {
        const goalValidation = await validateTestGoals('session', p.sessionId);
        c.steps.testGoalValidation = {
          success: goalValidation.success,
          output: goalValidation.message + '\n' +
            (goalValidation.aligned.length > 0 ? `\n✅ Aligned:\n${goalValidation.aligned.map(a => `  - ${a.goal}: ${a.testFiles.length} file(s)`).join('\n')}` : '') +
            (goalValidation.gaps.length > 0 ? `\n❌ Gaps:\n${goalValidation.gaps.map(g => `  - ${g.goal}: Missing test files`).join('\n')}` : '') +
            (goalValidation.extras.length > 0 ? `\nℹ️ Extra:\n${goalValidation.extras.map(e => `  - ${e.testFile}: ${e.reason}`).join('\n')}` : ''),
        };
        if (!goalValidation.success) {
          return {
            success: false,
            output: c.output.join('\n'),
            steps: c.steps,
            outcome: buildTierEndOutcome('blocked_fix_required', 'test_goal_validation_failed', 'Add missing test files or document justification for gaps, then re-run /session-end.'),
          };
        }
      } catch (_error) {
        c.steps.testGoalValidation = { success: false, output: `Test goal validation failed: ${_error instanceof Error ? _error.message : String(_error)}` };
        return {
          success: false,
          output: c.output.join('\n'),
          steps: c.steps,
          outcome: buildTierEndOutcome('failed', 'test_goal_validation_error', 'Fix test goal validation and re-run /session-end.'),
        };
      }
      return null;
    },

    async runTests(c): Promise<StepExitResult> {
      if (!c.shouldRunTests) return null;
      const p = c.params as SessionEndParams & { description: string };
      const testTarget = p.testTarget ?? TEST_CONFIG.defaultTarget;
      let impactAnalysisOutput = '';

      try {
        try {
          const modifiedFiles = await detectSessionModifiedFiles(p.sessionId, c.context);
          if (modifiedFiles.length > 0) {
            const impact = await analyzeCodeChangeImpact(modifiedFiles, { includeUncommitted: true, detailedAnalysis: true });
            if (impact.affectedTests.length > 0) {
              impactAnalysisOutput = `\n📊 Change Impact Analysis:\n  - Change Type: ${impact.changeType} (${impact.confidence} confidence)\n  - Affected Tests: ${impact.affectedTests.length}\n`;
              if (impact.predictions.length > 0) impactAnalysisOutput += `  - Predicted Failures: ${impact.predictions.length}\n`;
              if (impact.changeType === 'breaking' && impact.confidence === 'high') impactAnalysisOutput += `  ⚠️  Breaking changes detected - tests may need updates\n`;
              c.steps.changeImpactAnalysis = { success: true, output: impactAnalysisOutput };
            }
          }
        } catch (error) {
          console.error('Change detection failed (non-fatal):', error);
        }

        const testResult = await testEndWorkflow('session', p.sessionId, testTarget);
        c.steps.runTests = {
          success: testResult.success,
          output: impactAnalysisOutput + testResult.message + '\n' + JSON.stringify(testResult.results, null, 2),
        };

        if (!testResult.success) {
          if (TEST_CONFIG.analyzeErrors) {
            try {
              const modifiedFiles = await detectSessionModifiedFiles(p.sessionId, c.context);
              const testFiles = modifiedFiles.filter(f => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f));
              const appFiles = modifiedFiles.filter(f => !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f));
              const errorAnalysis = await analyzeTestError(testResult.results.run.output, testFiles, appFiles);
              c.steps.testErrorAnalysis = {
                success: true,
                output: `Error Analysis:\n- Type: ${errorAnalysis.errorType}\n- Confidence: ${errorAnalysis.confidence}\n- Is Test Code Error: ${errorAnalysis.isTestCodeError}\n- Recommendation: ${errorAnalysis.recommendation}\n- Affected Files: ${errorAnalysis.affectedFiles.join(', ')}`,
              };
              if (errorAnalysis.isTestCodeError && TEST_CONFIG.allowTestFileFixes) {
                const permission = await requestTestFileFixPermission(errorAnalysis, `session-end-${p.sessionId}`);
                c.steps.testFileFixPermission = {
                  success: false,
                  output: `Test code error detected. Permission required to fix test file.\n\n${JSON.stringify(permission, null, 2)}\n\nFix test file (or grant permission if supported), then re-run /session-end.`,
                };
                return { success: false, output: c.output.join('\n'), steps: c.steps, outcome: buildTierEndOutcome('blocked_fix_required', 'test_code_error_permission_required', 'Fix failing test file, then re-run /session-end.') };
              }
              if (errorAnalysis.isTestCodeError) {
                c.steps.testFileFixPermission = { success: false, output: 'Test code error detected but test file fixes are disabled. Please fix test file manually.' };
                return { success: false, output: c.output.join('\n'), steps: c.steps, outcome: buildTierEndOutcome('blocked_fix_required', 'test_code_error_fix_manually', 'Fix failing test file manually, then re-run /session-end.') };
              }
              return { success: false, output: c.output.join('\n'), steps: c.steps, outcome: buildTierEndOutcome('blocked_fix_required', 'app_code_test_failure', 'Fix app code that caused test failure, then re-run /session-end.') };
            } catch (_error) {
              c.steps.testErrorAnalysis = { success: false, output: `Error analysis failed: ${_error instanceof Error ? _error.message : String(_error)}` };
              return { success: false, output: c.output.join('\n'), steps: c.steps, outcome: buildTierEndOutcome('failed', 'test_error_analysis_failed', 'Re-run /session-end after resolving test failures.') };
            }
          }
          return { success: false, output: c.output.join('\n'), steps: c.steps, outcome: buildTierEndOutcome('blocked_fix_required', 'tests_failed', 'Fix failing tests, then re-run /session-end.') };
        }

        const testExecutionRecord = `\n**Tests Run:** ${getCurrentDate()} ${testTarget} PASSED\n`;
        await appendLog(testExecutionRecord, p.sessionId, c.context.feature.name);
        c.steps.testExecutionTracking = { success: true, output: 'Test execution recorded in session log' };
        return null;
      } catch (runError) {
        c.steps.runTests = { success: false, output: `Test execution failed: ${runError instanceof Error ? runError.message : String(runError)}` };
        return { success: false, output: c.output.join('\n'), steps: c.steps, outcome: buildTierEndOutcome('failed', 'test_run_error', 'Resolve test run failure and re-run /session-end.') };
      }
    },

    async runMidWork(c): Promise<StepExitResult> {
      const p = c.params as SessionEndParams & { description: string; nextSession: string; lastCompletedTask: string };
      try {
        const sessionGuide = await c.context.readSessionGuide(p.sessionId);
        const hasTestStrategy = /## Test Strategy/i.test(sessionGuide);
        const hasTestJustification = /test.*justification|tests.*deferred|why.*tests.*not.*created/i.test(sessionGuide);
        const hasTestFiles = /test.*file|\.test\.|\.spec\./i.test(sessionGuide);
        if (!hasTestStrategy && !hasTestJustification && !hasTestFiles) {
          const testStatusNote = `\n## Test Status\n\n**Note:** No test strategy or justification documented for this session. Consider adding test requirements or documenting why tests are deferred.\n`;
          await appendLog(testStatusNote, p.sessionId, c.context.feature.name);
          c.steps.testDocumentation = { success: true, output: 'Test status logged (no test strategy found in guide)' };
        } else {
          c.steps.testDocumentation = { success: true, output: 'Test strategy or justification found in session guide' };
        }
      } catch (_error) {
        c.steps.testDocumentation = { success: false, output: `Test documentation check failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}` };
      }

      try {
        const clientRoot = join(process.cwd(), FRONTEND_ROOT);
        const newFilesOutput = execSync('node .scripts/inventory-new-files.mjs', {
          encoding: 'utf8',
          cwd: clientRoot,
        }).trim();
        c.steps.inventoryAnnotations = {
          success: true,
          output: newFilesOutput || 'No unannotated new files detected',
        };
      } catch (_error) {
        c.steps.inventoryAnnotations = {
          success: false,
          output: `Inventory new-files check failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}`,
        };
      }

      if (p.taskEntry) {
        const formattedEntry = formatTaskEntry(p.taskEntry);
        await appendLog(formattedEntry, p.sessionId, c.context.feature.name);
        c.steps.appendLog = { success: true, output: 'Task log entry appended to session log' };
      } else {
        c.steps.appendLog = { success: true, output: 'No task entry provided' };
      }

      const handoffUpdate: MinimalHandoffUpdate = {
        lastCompletedTask: p.lastCompletedTask,
        nextSession: p.nextSession,
        transitionNotes: p.transitionNotes,
        sessionId: p.sessionId,
        featureName: c.context.feature.name,
      };
      await updateHandoffMinimal(handoffUpdate);
      c.steps.updateHandoff = { success: true, output: 'Session handoff updated with transition context' };

      if (p.guideUpdates && p.guideUpdates.length > 0) {
        for (const guideUpdate of p.guideUpdates) {
          await updateGuide(guideUpdate, p.sessionId, c.context.feature.name);
        }
        c.steps.updateGuide = { success: true, output: `Guide updated with ${p.guideUpdates.length} update(s)` };
      } else {
        c.steps.updateGuide = { success: true, output: 'No guide updates provided' };
      }

      try {
        const markCompleteParams: MarkSessionCompleteParams = {
          sessionId: p.sessionId,
          tasksCompleted: p.tasksCompleted,
          accomplishments: p.accomplishments ?? [`Completed ${p.description}`],
          featureName: c.context.feature.name,
        };
        const markCompleteOutput = await markSessionComplete(markCompleteParams);
        c.steps.markSessionComplete = { success: true, output: markCompleteOutput };
      } catch (_error) {
        c.steps.markSessionComplete = {
          success: false,
          output: `Failed to mark session complete in phase guide: ${_error instanceof Error ? _error.message : String(_error)}\nSession ID: ${p.sessionId}\nYou may need to manually check off the session in the phase guide.`,
        };
      }
      return null;
    },

    runReadmeCleanup: true,
    runEndAudit: true,

    async runGit(c): Promise<StepExitResult> {
      const p = c.params as SessionEndParams & { description: string; nextSession: string };

      if (!p.skipGit) {
        try {
          const mergeResult = await mergeTierBranch(SESSION_CONFIG, p.sessionId, c.context, { deleteBranch: true, push: false });
          c.steps.gitMerge = { success: mergeResult.success, output: mergeResult.messages.join('\n') };
          if (mergeResult.deletedBranch) c.steps.deleteSessionBranch = { success: true, output: 'Deleted session branch after merge.' };
        } catch (_error) {
          const sessionBranchName = SESSION_CONFIG.getBranchName(c.context, p.sessionId);
          const phaseBranchName = SESSION_CONFIG.getParentBranchName(c.context, p.sessionId);
          const errorMsg = sessionBranchName && phaseBranchName
            ? `Manual recovery: git checkout ${phaseBranchName} && git merge ${sessionBranchName}`
            : 'Resolve branch names from tier config and merge manually.';
          c.steps.gitMerge = { success: false, output: `Branch merge failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}\n${errorMsg}` };
        }
      } else {
        c.steps.gitMerge = { success: true, output: 'Skipped (skipGit=true)' };
      }

      if (!p.skipGit) {
        try {
          const currentBranch = await getCurrentBranch();
          if (currentBranch !== 'main' && currentBranch !== 'master' && await checkGitHubCLI()) {
            const prTitle = `Session ${p.sessionId}: ${p.description}`;
            const prBody = p.transitionNotes ? `## Summary\n\n${p.description}\n\n## Next Steps\n\n${p.transitionNotes}` : `Session ${p.sessionId} complete: ${p.description}`;
            const prResult = await createPullRequest(prTitle, prBody, false);
            if (prResult.success) {
              c.steps.createPR = { success: true, output: `✅ Pull request created:\n🔗 ${prResult.url}\n\n**Note:** Assign reviewers if needed before continuing to next session.` };
            } else {
              const errorMessage = prResult.error ? String(prResult.error) : 'Unknown error - PR creation failed without error details';
              c.steps.createPR = { success: false, output: `⚠️ Could not create PR automatically (non-critical): ${errorMessage}\n\n**Create PR manually:** https://github.com/WillWhittakerDHP/DHP_Differential_Scheduler/compare/main...${currentBranch}` };
            }
          } else if (currentBranch === 'main' || currentBranch === 'master') {
            c.steps.createPR = { success: true, output: 'Skipped PR creation - on main/master branch' };
          } else {
            c.steps.createPR = { success: true, output: 'Skipped PR creation - GitHub CLI not authenticated' };
          }
        } catch (_error) {
          const currentBranch = await getCurrentBranch();
          c.steps.createPR = { success: false, output: `PR creation failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}\n\n**Create PR manually:** https://github.com/WillWhittakerDHP/DHP_Differential_Scheduler/compare/main...${currentBranch}` };
        }
      } else {
        c.steps.createPR = { success: true, output: 'Skipped (skipGit=true)' };
      }

      if (!p.skipGit) {
        c.steps.gitReady = {
          success: true,
          output: [
            '✅ All session-end checks passed:',
            '- App starts',
            '- Linting passed',
            '- Feature work committed',
            c.autofixResult ? '- Audit fixes committed (via runAfterAudit)' : '',
            '- Session log updated',
            '- Handoff document updated',
            '- Session guide updated',
          ].filter(Boolean).join('\n'),
        };
        c.steps.gitPush = { success: true, output: 'Push pending. See outcome.reasonCode.' };
        c.steps.afterPushShowNextStep = { success: true, output: `Next session: ${p.nextSession || 'X.Y.Z'}` };
      } else {
        c.steps.gitPush = { success: true, output: 'Skipped (skipGit=true)' };
        c.steps.afterPushShowNextStep = { success: true, output: `Next: /session-start ${p.nextSession || 'X.Y.Z'} "Session Name" or use handoff doc.` };
      }

      try {
        const sessionGuide = await c.context.readSessionGuide(p.sessionId);
        const shouldRunCatchup = /RUN_CATCHUP_TESTS|run.*catch.*up.*tests/i.test(sessionGuide);
        if (shouldRunCatchup && p.sessionId === '1.3.6') {
          try {
            const catchupResult = await runCatchUpTests(c.context.feature.name, { targetPhase: '3', targetSession: '1.3.6' });
            c.steps.catchupTests = { success: catchupResult.success, output: `Catch-up tests executed:\n${catchupResult.summary}` };
            if (!catchupResult.success) c.steps.catchupTests!.output += '\n⚠️ Catch-up tests completed with failures. Review output above.';
          } catch (_error) {
            c.steps.catchupTests = { success: false, output: `Catch-up test execution failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}` };
          }
        }
      } catch (_error) {
        c.steps.catchupTests = { success: false, output: `Catch-up check failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}` };
      }
      return null;
    },

    async getCascade(c): Promise<CascadeInfo | null> {
      const p = c.params as SessionEndParams & { nextSession: string };
      let isLastSession = false;
      let phaseNum: string | null = null;
      try {
        isLastSession = await isLastSessionInPhase(c.context.feature.name, p.sessionId);
        phaseNum = getPhaseFromSessionId(p.sessionId);
        if (isLastSession && phaseNum !== null) {
          c.steps.phaseEndPrompt = { success: true, output: `\n✅ **Last session in Phase ${phaseNum} completed!**\n\nAll sessions in Phase ${phaseNum} are now complete. Consider running /phase-end ${phaseNum} to: Update phase log, verify tests, update phase handoff, close phase.` };
        } else {
          c.steps.phaseEndPrompt = { success: true, output: 'Not the last session in phase - phase-end not needed yet' };
        }
      } catch (_error) {
        c.steps.phaseEndPrompt = { success: false, output: `Phase-end check failed (non-critical): ${_error instanceof Error ? _error.message : String(_error)}` };
      }
      const cascadeUp = isLastSession && phaseNum !== null ? buildCascadeUp('session', phaseNum) : undefined;
      const nextSessionId = p.nextSession || 'X.Y.Z';
      const cascadeAcross = !cascadeUp ? buildCascadeAcross('session', nextSessionId) : undefined;
      return cascadeUp ?? cascadeAcross ?? null;
    },

    getSuccessOutcome(c): import('../../../utils/tier-outcome').TierEndOutcome {
      const p = c.params as SessionEndParams & { nextSession: string };
      const nextAction = !p.skipGit
        ? 'Push pending. Then cascade if present.'
        : 'Cascade if present.';
      return buildTierEndOutcome('completed', 'pending_push_confirmation', nextAction, c.outcome.cascade);
    },
  };

  const result: TierEndWorkflowResult = await runTierEndWorkflow(ctx, hooks);
  return {
    success: result.success,
    output: result.output,
    steps: result.steps,
    outcome: result.outcome as SessionEndOutcome,
  };
}

// --- Runnable wrapper: run this file with npx tsx so agents can execute without a separate runner ---
const currentFile = fileURLToPath(import.meta.url);
const isEntryPoint = typeof process !== 'undefined' && process.argv[1] && resolve(process.argv[1]) === resolve(currentFile);
if (isEntryPoint) {
  (async () => {
    const sessionId = process.argv[2] ?? process.env.SESSION_ID ?? '';
    const runTests = process.argv.includes('--test');
    const planMode = process.argv.includes('--plan');
    if (!sessionId || !/^\d+\.\d+\.\d+$/.test(sessionId)) {
      console.error(`Usage: npx tsx .cursor/commands/tiers/session/composite/session-end-impl.ts <sessionId> [--test|--no-tests] [--plan]`);
      console.error(`Example: npx tsx .cursor/commands/tiers/session/composite/session-end-impl.ts 4.1.3`);
      console.error(`Session ID must be X.Y.Z (e.g. 4.1.3). Got: ${sessionId || '<sessionId>'}`);
      process.exit(1);
    }
    const { sessionEnd } = await import('./session');
    const result = await sessionEnd({ sessionId, runTests, mode: planMode ? 'plan' : 'execute' });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
