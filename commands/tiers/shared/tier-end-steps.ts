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
import { runEndAuditForTier } from '../../audit/run-end-audit-for-tier';
import { buildTierEndOutcome } from '../../utils/tier-outcome';
import {
  commitRemaining,
  getExpectedBranchForTier,
  DEFAULT_ALLOWED_COMMIT_PREFIXES,
  propagateSharedFiles,
} from '../../git/shared/git-manager';
import { PROJECT_ROOT } from '../../utils/utils';
import type { TierName } from './types';

/**
 * Maps audit keyword patterns to the governance playbook + cursor rule the agent
 * MUST read before attempting fixes. Keyed by regex patterns that match audit
 * category names or finding text in the audit output.
 */
interface GovernanceRef {
  playbook: string;
  cursorRule: string;
  label: string;
}

const GOVERNANCE_REFS: Array<{ patterns: RegExp[]; ref: GovernanceRef }> = [
  {
    patterns: [/component-health/i, /component-logic/i, /component.coupling/i, /excessive.prop/i],
    ref: {
      playbook: '.project-manager/COMPONENT_AUTHORING_PLAYBOOK.md',
      cursorRule: '.cursor/rules/component-governance.mdc',
      label: 'Component governance',
    },
  },
  {
    patterns: [/composable-health/i, /composables-logic/i, /missing.return.type/i, /untyped.provide/i],
    ref: {
      playbook: '.project-manager/COMPOSABLE_AUTHORING_PLAYBOOK.md',
      cursorRule: '.cursor/rules/composable-governance.mdc',
      label: 'Composable governance',
    },
  },
  {
    patterns: [/function-complexity/i, /nesting/i, /branch/i],
    ref: {
      playbook: '.project-manager/FUNCTION_AUTHORING_PLAYBOOK.md',
      cursorRule: '.cursor/rules/function-governance.mdc',
      label: 'Function governance',
    },
  },
  {
    patterns: [/type-escape/i, /type-constant-inventory/i, /type-health/i, /type-similarity/i],
    ref: {
      playbook: '.project-manager/TYPE_AUTHORING_PLAYBOOK.md',
      cursorRule: '.cursor/rules/type-governance.mdc',
      label: 'Type governance',
    },
  },
];

/**
 * Tier-level governance docs that always apply for a given tier (regardless of
 * which specific audit categories triggered). These cover the coding standards
 * and the Vue architecture contract.
 */
const TIER_BASELINE_REFS: Partial<Record<TierName, string[]>> = {
  session: ['.cursor/rules/coding-standards.mdc'],
  phase: ['.cursor/rules/coding-standards.mdc'],
  task: ['.cursor/rules/coding-standards.mdc'],
};

function buildGovernanceGuidance(tier: TierName, auditOutput: string): string {
  const matched = new Map<string, GovernanceRef>();

  for (const { patterns, ref } of GOVERNANCE_REFS) {
    if (matched.has(ref.label)) continue;
    for (const p of patterns) {
      if (p.test(auditOutput)) {
        matched.set(ref.label, ref);
        break;
      }
    }
  }

  if (matched.size === 0) return '';

  const lines: string[] = [
    '',
    '---',
    '',
    '## Required reading before fixes',
    '',
    'Read these governance docs to ensure fixes comply with project patterns:',
    '',
  ];

  for (const [label, ref] of matched) {
    lines.push(`- **${label}**: \`${ref.playbook}\` (rules: \`${ref.cursorRule}\`)`);
  }

  const baselineRefs = TIER_BASELINE_REFS[tier];
  if (baselineRefs) {
    for (const path of baselineRefs) {
      lines.push(`- **Coding standards**: \`${path}\``);
    }
  }

  lines.push('');
  lines.push('Read each linked file before making changes. Extract, don\'t inline. Follow thresholds exactly.');

  return lines.join('\n');
}

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

/**
 * Commit only in-scope touched files (frontend-root/, server/) with a scope-from-context message.
 * Verifies current branch matches expected tier branch before committing; if wrong branch, returns early exit.
 * Never commits .cursor, .project-manager, or audit reports. Runs before stepTierGit.
 */
function commitPrefixFromContext(identifier: string): string {
  return `[${identifier}]`;
}

export async function stepCommitUncommittedNonCursor(
  ctx: TierEndWorkflowContext
): Promise<StepExitResult> {
  const expectedBranch = await getExpectedBranchForTier(ctx.config, ctx.identifier, ctx.context);
  const prefix = commitPrefixFromContext(ctx.identifier);
  const commitMessage = `${prefix} tier-end: commit remaining work`;

  const result = await commitRemaining(commitMessage, {
    expectedBranch: expectedBranch ?? undefined,
    allowedPrefixes: [...DEFAULT_ALLOWED_COMMIT_PREFIXES],
  });

  if (!result.success) {
    const outcome = buildTierEndOutcome(
      'blocked_fix_required',
      'wrong_branch_before_commit',
      result.output,
      undefined,
      result.output
    );
    return {
      success: false,
      output: ctx.output.join('\n\n'),
      steps: ctx.steps,
      outcome,
    };
  }

  if (!result.committed && !result.output) return null;
  // result.output may include carry note: "Carried uncommitted changes from X to Y and committed."
  ctx.steps.commitRemaining = { success: result.success, output: result.output };
  ctx.output.push(result.output);
  return null;
}

/** Call hook runGit; return its result or null. */
export async function stepTierGit(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<StepExitResult> {
  if (!hooks.runGit) return null;
  return hooks.runGit(ctx);
}

/** Propagate shared files (PROJECT_PLAN.md, .gitignore, .cursor) to other tier branches. Phase and session only; non-blocking. */
export async function stepPropagateShared(ctx: TierEndWorkflowContext): Promise<void> {
  const tier = ctx.config.name;
  if (tier !== 'phase' && tier !== 'session') return;

  try {
    const result = await propagateSharedFiles(undefined, { dryRun: false });
    ctx.steps.propagateShared = {
      success: result.success,
      output: result.summary + (result.details.length ? '\n' + result.details.map((d) => `${d.branch}: ${d.status} — ${d.message}`).join('\n') : ''),
    };
  } catch (err) {
    const msg = `Propagate shared files failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`;
    ctx.steps.propagateShared = { success: false, output: msg };
    console.warn(msg);
  }
}

const VERIFICATION_NEXT_ACTION =
  'Verification checklist suggested. See steps.verificationCheck. Present options in chat: add follow-up task/session/phase, do manually, or skip; then re-run this tier-end with continuePastVerification: true to run audits.';

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

/**
 * Auto-repair config drift (path integrity + stale allowlist entries) before
 * end-audit runs. Non-blocking: records results but never returns an early exit.
 */
export async function stepConfigFix(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<void> {
  if (hooks.runEndAudit !== true) return;

  const { execSync } = await import('child_process');
  const { join } = await import('path');
  const scriptPath = join(PROJECT_ROOT, 'client/.scripts/config-fix.mjs');

  try {
    const stdout = execSync(`node "${scriptPath}"`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
    });

    const hasAutoFixes = /Total auto-fixes applied: \*\*[1-9]/.test(stdout);
    ctx.steps.configFix = {
      success: true,
      output: hasAutoFixes ? stdout.trim() : 'Config health: no drift detected.',
    };
    if (hasAutoFixes) ctx.output.push(stdout.trim());
  } catch (err) {
    const msg = `Config fix failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`;
    ctx.steps.configFix = { success: false, output: msg };
    console.warn(msg);
  }
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
    auditsComplete: ctx.auditPrewarmPromise,
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
    const governance = buildGovernanceGuidance(ctx.config.name, auditOutput);
    const enrichedDeliverables = (auditOutput || '') + governance;

    return {
      success: false,
      output: ctx.output.join('\n\n'),
      steps: ctx.steps,
      outcome: buildTierEndOutcome(
        'blocked_fix_required',
        'audit_failed',
        'Fix audit warnings or errors per governance, then re-run this tier-end. Read the governance docs listed in deliverables FIRST.',
        undefined,
        enrichedDeliverables || undefined
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
