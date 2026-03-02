/**
 * Reusable step modules for the tier end workflow.
 * Steps use shared primitives and tier-supplied hooks; optional steps run when hook is provided.
 */

import type {
  TierEndWorkflowContext,
  TierEndWorkflowHooks,
  StepExitResult,
} from './tier-end-workflow-types';
import { resolveCommandExecutionMode, isPlanMode } from '../../utils/command-execution-mode';
import { resolveRunTests, buildPlanModeResult } from '../../utils/tier-end-utils';
import { workflowCleanupReadmes } from '../../readme/composite/readme-workflow-cleanup';
import { updateTierScope, clearTierScope } from '../../utils/tier-scope';
import { runEndAuditForTier } from '../../audit/run-end-audit-for-tier';
import { buildTierEndOutcome } from '../../utils/tier-outcome';

/** If plan mode, build plan result and return it; else null. Uses same options contract as tier-start (ctx.options, default execute). */
export function stepPlanModeExit(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): StepExitResult {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'execute');
  if (!isPlanMode(executionMode)) return null;
  const planSteps = hooks.getPlanModeSteps(ctx);
  const { steps, outcome } = buildPlanModeResult(planSteps, 'Execute in execute mode to run workflow.');
  return {
    success: true,
    output: steps.plan?.output ?? planSteps.join('\n'),
    steps,
    outcome,
  };
}

/** Resolve runTests; if blocked, return early result; else set ctx.shouldRunTests. */
export function stepResolveRunTests(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): StepExitResult {
  const params = ctx.params as { runTests?: boolean };
  const { shouldRunTests, blockedOutcome } = resolveRunTests(params, {
    requireExplicit: hooks.requireExplicitRunTests === true,
  });
  ctx.shouldRunTests = shouldRunTests;
  if (blockedOutcome) {
    return {
      success: false,
      output: ctx.output.join('\n'),
      steps: ctx.steps,
      outcome: blockedOutcome,
    };
  }
  return null;
}

/** Call hook runPreWork; return its result or null. */
export async function stepTierPreWork(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<StepExitResult> {
  if (!hooks.runPreWork) return null;
  return hooks.runPreWork(ctx);
}

/** Call hook for test goal validation; return its result or null. */
export async function stepTestGoalValidation(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<StepExitResult> {
  if (!hooks.runTestGoalValidation) return null;
  return hooks.runTestGoalValidation(ctx);
}

/** Call hook for running tests; return its result or null. */
export async function stepRunTests(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<StepExitResult> {
  if (!hooks.runTests) return null;
  return hooks.runTests(ctx);
}

/** Call hook runMidWork; return its result or null. */
export async function stepTierMidWork(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<StepExitResult> {
  if (!hooks.runMidWork) return null;
  return hooks.runMidWork(ctx);
}

/** Call hook runCommentCleanup; return its result or null. */
export async function stepCommentCleanup(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<StepExitResult> {
  if (!hooks.runCommentCleanup) return null;
  return hooks.runCommentCleanup(ctx);
}

/** Run README cleanup when hook says so; append to steps and output. */
export async function stepReadmeCleanup(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<void> {
  if (hooks.runReadmeCleanup !== true) return;
  const tier = ctx.config.name;
  if (tier !== 'feature' && tier !== 'phase' && tier !== 'session') return;
  const report = await workflowCleanupReadmes({
    tier,
    identifier: ctx.identifier,
    featureName: ctx.context.feature.name,
  });
  ctx.steps.readmeCleanup = { success: true, output: report };
  ctx.output.push(report);
}

/** Call hook runGit; return its result or null. */
export async function stepTierGit(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<StepExitResult> {
  if (!hooks.runGit) return null;
  return hooks.runGit(ctx);
}

const VERIFICATION_NEXT_ACTION =
  'Verification checklist suggested. See steps.verificationCheck. Use AskQuestion: add follow-up task/session/phase, do manually, or skip; then re-run this tier-end with continuePastVerification: true to run audits.';

/** Call hook runVerificationCheck; when suggested and not continuePastVerification, return early with reasonCode verification_work_suggested. */
export async function stepVerificationCheck(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<StepExitResult> {
  if (!hooks.runVerificationCheck) return null;
  const result = await hooks.runVerificationCheck(ctx);
  if (!result || !result.suggested || !result.checklist?.trim()) {
    if (result?.suggested === false) {
      ctx.steps.verificationCheck = { success: true, output: 'No verification checklist suggested.' };
    }
    return null;
  }
  const continuePast = (ctx.params as { continuePastVerification?: boolean }).continuePastVerification === true;
  const parts: string[] = [];
  if (result.productChecklist?.trim()) {
    parts.push(`## What to verify (what we built)\n\n${result.productChecklist.trim()}`);
  }
  if (result.artifactChecklist?.trim()) {
    parts.push(`## Artifacts / docs\n\n${result.artifactChecklist.trim()}`);
  }
  if (parts.length === 0 && result.checklist?.trim()) {
    parts.push(`## Verification checklist (suggested)\n\n${result.checklist.trim()}`);
  }
  const output = parts.join('\n\n');
  ctx.steps.verificationCheck = { success: true, output };
  ctx.output.push(output);
  if (continuePast) return null;
  const outcome = buildTierEndOutcome(
    'completed',
    'verification_work_suggested',
    VERIFICATION_NEXT_ACTION,
    undefined,
    output,
  );
  return {
    success: true,
    output: ctx.output.join('\n\n'),
    steps: ctx.steps,
    outcome,
  };
}

/** Run end audit via runEndAuditForTier when hook says so; append to steps and output. Returns exit on warn/fail (Option B: only tier-end stops on warnings). */
export async function stepEndAudit(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<StepExitResult> {
  if (hooks.runEndAudit !== true) return null;
  if (hooks.runBeforeAudit) await hooks.runBeforeAudit(ctx);
  const auditResult = await runEndAuditForTier({
    tier: ctx.config.name,
    identifier: ctx.identifier,
    params: ctx.auditPayload ?? ctx.params,
    featureName: ctx.context.feature.name,
  });
  const raw = typeof auditResult === 'string' ? { output: auditResult } : auditResult;
  const auditOutput = raw.output ?? '';
  const passed = typeof auditResult === 'object' && auditResult.success === true;

  if (auditOutput) {
    ctx.steps.audit = { success: passed, output: auditOutput };
    ctx.output.push(auditOutput);
  }
  if (typeof auditResult === 'object' && auditResult.autofixResult) {
    ctx.autofixResult = auditResult.autofixResult;
  }

  if (!passed) {
    return {
      success: false,
      output: ctx.output.join('\n\n'),
      steps: ctx.steps,
      outcome: buildTierEndOutcome(
        'blocked_fix_required',
        'audit_failed',
        'Fix audit warnings or errors per governance, then re-run this tier-end.',
        undefined,
        auditOutput || undefined
      ),
    };
  }
  return null;
}

/** Run runAfterAudit hook when provided (e.g. commit autofix changes). */
export async function stepAfterAudit(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<StepExitResult> {
  if (!hooks.runAfterAudit) return null;
  return hooks.runAfterAudit(ctx);
}

/** Clear tier scope (feature: clearTierScope; others: updateTierScope(tier, null)). */
export async function stepClearScope(ctx: TierEndWorkflowContext): Promise<void> {
  if (ctx.config.name === 'feature') {
    await clearTierScope();
  } else {
    await updateTierScope(ctx.config.name, null);
  }
  const msg = `Scope cleared for ${ctx.config.name} tier.`;
  ctx.steps.clearScope = { success: true, output: msg };
  ctx.output.push(msg);
}

/** Build cascade from hook and set ctx.outcome.cascade. */
export async function stepBuildEndCascade(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<void> {
  if (!hooks.getCascade) return;
  const cascade = await hooks.getCascade(ctx);
  if (cascade) {
    ctx.outcome = { ...ctx.outcome, cascade };
  }
}
