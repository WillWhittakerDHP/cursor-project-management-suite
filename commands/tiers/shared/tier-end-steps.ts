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
import type { AuditTier } from '../../audit/types';
import { commitAutofixChanges } from '../../audit/autofix/commit-autofix';
import { buildTierEndOutcome } from '../../utils/tier-outcome';
import {
  commitRemaining,
  getInScopeDiffPreviewForCommit,
  DEFAULT_ALLOWED_COMMIT_PREFIXES,
  preflightFeatureBranchForHarness,
  propagateSharedFiles,
  type InScopeDiffPreviewResult,
} from '../../git/shared/git-manager';
import {
  DocumentManagerWriteBlockedError,
  type DocumentTier,
} from '../../utils/document-manager';
import { PROJECT_ROOT } from '../../utils/utils';
import type { TierName } from './types';
import type { PlanningTier } from '../../utils/planning-doc-paths';
import { analyzeDeliverablesDriftFromContent } from './tier-end-deliverables-drift';
import {
  buildAuditFixContextEnvelope,
  resolveTaskFilesForAuditFix,
} from '../../audit/atomic/audit-fix-prompt';
import {
  buildWorkflowFrictionEntryFromOrchestrator,
  recordHarnessVerboseWarning,
  recordWorkflowFriction,
} from '../../harness/workflow-friction-manager';
import {
  resolveDocRollupProfile,
  docRollupRunsLogHandoff,
  docRollupRunsGuideSafe,
} from '../../utils/doc-rollup-policy';

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

/** Audit-output regex targeting (playbook + rule pointers). Kept alongside harness-injected markdown. */
function buildTargetedGovernanceGuidance(tier: TierName, auditOutput: string): string {
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

/**
 * Targeted refs from audit output plus full governance + architecture markdown (same primitives as /audit-fix).
 */
async function buildGovernanceGuidance(
  tier: TierName,
  auditOutput: string,
  options: { featureName?: string; identifier?: string }
): Promise<string> {
  const targeted = buildTargetedGovernanceGuidance(tier, auditOutput);

  let shared = '';
  try {
    const taskFiles = await resolveTaskFilesForAuditFix({
      tier,
      featureName: options.featureName,
      identifier: options.identifier,
    });
    const envelope = await buildAuditFixContextEnvelope({
      tier,
      taskFiles: taskFiles ?? [],
    });
    const injected: string[] = [];
    if (envelope.architectureExcerpt?.trim()) {
      injected.push(
        `## Architecture context (harness-injected)\n\n${envelope.architectureExcerpt.trim()}`
      );
    }
    if (envelope.governanceBlock?.trim()) {
      injected.push(`## Governance context (harness-injected)\n\n${envelope.governanceBlock.trim()}`);
    }
    if (injected.length > 0) {
      shared = `\n\n---\n\n${injected.join('\n\n')}`;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[tier-end] buildGovernanceGuidance harness context failed: ${msg}`);
    recordHarnessVerboseWarning('buildGovernanceGuidance', msg, {
      tier,
      identifier: options.identifier,
      featureName: options.featureName,
    });
  }

  return targeted + shared;
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
 * Commit only in-scope touched files (`client/`, `server/`, `.project-manager/`) with a scope-from-context message.
 * Runs **preflightFeatureBranchForHarness** (fetch, checkout from origin when local branch is missing, remote coherence)
 * when this tier has an expected feature branch; then **commitRemaining** with expected branch. Runs before stepTierGit.
 */
function commitPrefixFromContext(identifier: string): string {
  return `[${identifier}]`;
}

function buildCommitPreviewMarkdown(preview: InScopeDiffPreviewResult): string {
  const lines: string[] = ['## Harness: commit preview (in-scope diff)', ''];
  if (preview.paths.length === 0) {
    lines.push('_No in-scope paths (or clean)._');
    return lines.join('\n');
  }
  lines.push(`Paths (${preview.paths.length}): \`${preview.paths.join('`, `')}\``);
  lines.push('');
  lines.push('### `git diff --stat HEAD`');
  if (preview.truncatedStat) {
    lines.push('_(stat truncated to cap)_');
  }
  lines.push('');
  lines.push('```text');
  lines.push(preview.stat.length > 0 ? preview.stat : '(empty)');
  lines.push('```');
  lines.push('');
  lines.push('### `git diff HEAD`');
  if (preview.truncatedDiff) {
    lines.push('_(diff truncated to cap)_');
  }
  lines.push('');
  lines.push('```diff');
  lines.push(preview.diffExcerpt.length > 0 ? preview.diffExcerpt : '(empty)');
  lines.push('```');
  return lines.join('\n');
}

function resolveCommitPreviewLogTarget(
  ctx: TierEndWorkflowContext
): { tier: DocumentTier; id: string | undefined } | null {
  const tierName = ctx.config.name;
  if (tierName === 'feature') {
    return { tier: 'feature', id: undefined };
  }
  if (tierName === 'phase') {
    return { tier: 'phase', id: ctx.identifier };
  }
  if (tierName === 'session') {
    return { tier: 'session', id: ctx.identifier };
  }
  if (tierName === 'task') {
    const p = ctx.params as { sessionId?: string };
    if (p.sessionId) {
      return { tier: 'session', id: p.sessionId };
    }
    return null;
  }
  return null;
}

/**
 * Advisory: AC verification prompt + deliverables vs working tree (git-manager paths only).
 * Runs before commit_remaining so uncommitted scope is still visible.
 */
export async function stepDeliverablesAndPlanningHints(ctx: TierEndWorkflowContext): Promise<void> {
  if (ctx.options?.workProfile?.gateProfile === 'express') {
    return;
  }
  const tier = ctx.config.name;
  const planningTier = tier as PlanningTier;
  const planningIdForDoc = tier === 'feature' ? '' : ctx.identifier;
  try {
    if (!(await ctx.context.documents.planningDocExists(planningTier, planningIdForDoc))) {
      return;
    }
    const content = await ctx.context.documents.readPlanningDoc(planningTier, planningIdForDoc);
    const planPath = ctx.context.documents.getPlanningDocRelativePath(planningTier, planningIdForDoc);

    ctx.output.push(
      [
        '',
        '---',
        '',
        '## Acceptance criteria verification (advisory, non-gating)',
        '',
        `Before inviting **/task-end**, **/session-end**, **/phase-end**, or **/feature-end**, re-read **## Acceptance Criteria** and **## Deliverables** (when present) in \`${planPath}\`. In chat, state whether each item was met and how — **not a harness gate**. See \`.cursor/skills/tier-workflow-agent/SKILL.md\` → *Acceptance criteria verification*.`,
        '',
      ].join('\n')
    );

    const drift = await analyzeDeliverablesDriftFromContent(content);
    if (drift.kind === 'rollup_marker' || drift.kind === 'no_planned_paths') {
      return;
    }
    const { scopeCreep, missed } = drift;

    const lines: string[] = ['', '---', '', '## Deliverables drift (advisory)', ''];
    if (scopeCreep.length > 0) {
      lines.push('**Unplanned paths touched:**', ...scopeCreep.map(f => `- \`${f}\``), '');
    }
    if (missed.length > 0) {
      lines.push('**Planned deliverables not seen in working tree:**', ...missed.map(p => `- \`${p}\``), '');
    }
    if (scopeCreep.length === 0 && missed.length === 0) {
      lines.push('**Deliverables check:** planned paths appear aligned with working tree changes (heuristic).', '');
    }
    ctx.output.push(lines.join('\n'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[tier-end deliverables_check] skipped:', msg);
    recordHarnessVerboseWarning('deliverables_check', msg, {
      tier,
      identifier: ctx.identifier,
      featureName: ctx.context.feature.name,
    });
  }
}

const GAP_ANALYSIS_NEXT_ACTION =
  'Gap analysis found possible open items. Review the report and the **LLM review packet (v1)** inside it; respond in chat using the **### Review — …** headings from the packet rubric. Register follow-up tiers with **tier-add** then **tier-start** if needed. Re-run this tier-end using **nextInvoke** from the control plane (sets `continuePastGapAnalysis`), or pass `continuePastGapAnalysis: true` under **params.options** to bypass after review.';

/**
 * Soft gate: optional `runGapAnalysis` hook; stops with `gap_analysis_pending` when gaps reported unless bypassed.
 * Runs after deliverables_check and before planning_rollup. Non-gating on hook errors (friction log only).
 */
export async function stepGapAnalysis(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<StepExitResult> {
  if (ctx.options?.workProfile?.gateProfile === 'express') {
    return null;
  }
  if (!hooks.runGapAnalysis) {
    return null;
  }
  const continuePast = ctx.options?.continuePastGapAnalysis === true;
  const tierName = ctx.config.name;
  try {
    const result = await hooks.runGapAnalysis(ctx);
    let block = (result.report ?? '').trim();
    if (result.recommendedAdds && result.recommendedAdds.length > 0) {
      const addLines = result.recommendedAdds.map(
        r =>
          `- **/${r.tier}-add** — ${r.description ?? `id: ${r.identifier}`}`
      );
      block = [block, '', '**Suggested follow-up registration (advisory):**', ...addLines].join('\n');
    }
    if (block) {
      ctx.steps.gapAnalysis = { success: true, output: block };
      ctx.output.push(block);
    }
    if (!result.hasGaps) {
      return null;
    }
    if (continuePast) {
      return null;
    }
    const outcome = buildTierEndOutcome(
      'completed',
      'gap_analysis_pending',
      GAP_ANALYSIS_NEXT_ACTION,
      undefined,
      block || result.report
    );
    return {
      success: true,
      output: ctx.output.join('\n\n'),
      steps: ctx.steps,
      outcome,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[tier-end gap_analysis] non-gating error:', msg);
    recordHarnessVerboseWarning('gap_analysis', msg, {
      tier: tierName,
      identifier: ctx.identifier,
      featureName: ctx.context.feature.name,
    });
    recordWorkflowFriction({
      ...buildWorkflowFrictionEntryFromOrchestrator({
        action: 'end',
        tier: tierName,
        identifier: ctx.identifier,
        featureName: ctx.context.feature.name,
        reasonCodeRaw: 'gap_analysis_failed',
        stepPath: ctx.stepPath,
        symptom: `Gap analysis failed: ${msg}`,
        context: `gap_analysis; non-gating. ${msg}`,
      }),
      forcePolicy: true,
    });
    return null;
  }
}

/**
 * Consolidate child planning docs into the parent file and archive sources (non-gating).
 * Runs after deliverables_check and before any git steps. Express profile skips.
 */
export async function stepPlanningRollup(ctx: TierEndWorkflowContext): Promise<void> {
  if (ctx.options?.workProfile?.gateProfile === 'express') {
    return;
  }
  const tierName = ctx.config.name;
  if (tierName !== 'feature' && tierName !== 'phase' && tierName !== 'session') {
    ctx.steps.planning_rollup = {
      success: true,
      output: `Skipped planning rollup (tier ${tierName}).`,
    };
    return;
  }
  const planningTier = tierName as PlanningTier;
  const planningId = tierName === 'feature' ? '' : ctx.identifier;
  const frictionHint =
    'If rollup logged friction: `npx tsx .cursor/commands/utils/read-workflow-friction.ts --last 20`';
  try {
    const result = await ctx.context.documents.rollupPlanningArtifacts(planningTier, planningId);
    const detail = result.skipped
      ? `Skipped (${result.skipReason ?? 'unknown'}): \`${result.path}\`.`
      : result.changed
        ? `Wrote consolidated \`${result.path}\`; archived ${result.archivedPaths.length} source file(s).`
        : `No write: \`${result.path}\`.`;
    const block = ['', '---', '', '## Planning rollup', '', detail, '', frictionHint, ''].join('\n');
    ctx.output.push(block);
    ctx.steps.planning_rollup = { success: true, output: block };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[tier-end planning_rollup] error (non-gating):', msg);
    recordHarnessVerboseWarning('planning_rollup', msg, {
      tier: tierName,
      action: 'end',
      identifier: ctx.identifier,
      featureName: ctx.context.feature.name,
    });
    recordWorkflowFriction({
      ...buildWorkflowFrictionEntryFromOrchestrator({
        action: 'end',
        tier: tierName,
        identifier: ctx.identifier,
        featureName: ctx.context.feature.name,
        reasonCodeRaw: 'planning_rollup_failed',
        stepPath: ctx.stepPath,
        symptom: `Planning rollup failed: ${msg}`,
        context: `planning_rollup; non-gating. ${msg}`,
      }),
      forcePolicy: true,
    });
    const block = [
      '',
      '---',
      '',
      '## Planning rollup',
      '',
      `⚠️ Rollup failed (non-gating): ${msg}`,
      '',
      frictionHint,
      '',
    ].join('\n');
    ctx.output.push(block);
    ctx.steps.planning_rollup = { success: true, output: block };
  }
}

/**
 * Log + handoff + optional guide (safe) rollup after planning_rollup, before git. Non-gating.
 * Scope from `ctx.options.docRollupProfile` or `HARNESS_DOC_ROLLUP` (default `planning_only`; set `all_non_guides` or `all` to run).
 */
export async function stepDocRollup(ctx: TierEndWorkflowContext): Promise<void> {
  if (ctx.options?.workProfile?.gateProfile === 'express') {
    return;
  }
  const tierName = ctx.config.name;
  if (tierName !== 'feature' && tierName !== 'phase' && tierName !== 'session') {
    ctx.steps.doc_rollup = {
      success: true,
      output: `Skipped doc rollup (tier ${tierName}).`,
    };
    return;
  }

  const profile = resolveDocRollupProfile(ctx.options);
  if (profile === 'off' || profile === 'planning_only') {
    ctx.steps.doc_rollup = {
      success: true,
      output: `Doc rollup skipped (docRollupProfile=${profile}).`,
    };
    return;
  }

  const planningTier = tierName as PlanningTier;
  const planningId = tierName === 'feature' ? '' : ctx.identifier;
  const frictionHint =
    'If rollup logged friction: `npx tsx .cursor/commands/utils/read-workflow-friction.ts --last 20`';

  const lines: string[] = ['', '---', '', '## Doc rollup (log / handoff / guide)', '', `Profile: **${profile}**`, ''];

  async function runOne(
    label: string,
    fn: () => Promise<{ skipped?: boolean; skipReason?: string; changed: boolean; path: string; archivedPaths: string[] }>
  ): Promise<void> {
    try {
      const result = await fn();
      const detail = result.skipped
        ? `${label}: skipped (${result.skipReason ?? 'unknown'}) \`${result.path}\``
        : result.changed
          ? `${label}: wrote \`${result.path}\`; archived ${result.archivedPaths.length} file(s)`
          : `${label}: no write \`${result.path}\``;
      lines.push(`- ${detail}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[tier-end doc_rollup] ${label} error (non-gating):`, msg);
      recordHarnessVerboseWarning('doc_rollup', `${label}: ${msg}`, {
        tier: tierName,
        action: 'end',
        identifier: ctx.identifier,
        featureName: ctx.context.feature.name,
      });
      recordWorkflowFriction({
        ...buildWorkflowFrictionEntryFromOrchestrator({
          action: 'end',
          tier: tierName,
          identifier: ctx.identifier,
          featureName: ctx.context.feature.name,
          reasonCodeRaw: 'doc_rollup_failed',
          stepPath: ctx.stepPath,
          symptom: `${label} rollup failed: ${msg}`,
          context: `doc_rollup; non-gating. ${msg}`,
        }),
        forcePolicy: true,
      });
      lines.push(`- ${label}: failed (non-gating): ${msg}`);
    }
  }

  if (docRollupRunsLogHandoff(profile)) {
    await runOne('Log', () => ctx.context.documents.rollupLogArtifacts(planningTier, planningId));
    await runOne('Handoff', () => ctx.context.documents.rollupHandoffArtifacts(planningTier, planningId));
  }
  if (docRollupRunsGuideSafe(profile)) {
    await runOne('Guide', () => ctx.context.documents.rollupGuideArtifacts(planningTier, planningId));
  }

  lines.push('', frictionHint, '');
  const block = lines.join('\n');
  ctx.output.push(block);
  ctx.steps.doc_rollup = { success: true, output: block };
}

export async function stepCommitUncommittedNonCursor(
  ctx: TierEndWorkflowContext
): Promise<StepExitResult> {
  const prefix = commitPrefixFromContext(ctx.identifier);
  const fallbackSubject = `${prefix} tier-end: commit remaining work`;
  const optSubject = ctx.options?.commitMessage?.trim();
  const subject = optSubject && optSubject.length > 0 ? optSubject : fallbackSubject;
  const body = ctx.options?.commitMessageBody?.trim();
  const commitArg = body && body.length > 0 ? { subject, body } : subject;

  const pre = await preflightFeatureBranchForHarness(ctx.config, ctx.identifier, ctx.context, {
    syncRemote: true,
    tier: ctx.config.name,
    tierId: ctx.identifier,
  });
  ctx.steps.preflightBranch = { success: pre.ok, output: pre.messages.join('\n') };
  if (pre.messages.length > 0) {
    ctx.output.push('### Branch preflight\n\n' + pre.messages.join('\n'));
  }
  if (!pre.ok) {
    const detail = pre.messages.join('\n');
    const outcome = buildTierEndOutcome(
      'blocked_fix_required',
      'preflight_branch_failed',
      detail,
      undefined,
      detail
    );
    return {
      success: false,
      output: ctx.output.join('\n\n'),
      steps: ctx.steps,
      outcome,
    };
  }
  const expectedBranch = pre.expectedBranch;

  const preview = await getInScopeDiffPreviewForCommit({
    allowedPrefixes: [...DEFAULT_ALLOWED_COMMIT_PREFIXES],
  });
  const previewMd = buildCommitPreviewMarkdown(preview);
  ctx.output.push(previewMd);

  const logTarget = resolveCommitPreviewLogTarget(ctx);
  if (logTarget) {
    try {
      await ctx.context.documents.upsertAnchoredLogSection(
        logTarget.tier,
        logTarget.id,
        'commit-preview',
        previewMd
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof DocumentManagerWriteBlockedError) {
        console.warn('[tier-end commit_remaining] commit preview log upsert blocked:', msg);
      } else {
        console.warn('[tier-end commit_remaining] commit preview log upsert failed:', msg);
      }
      recordHarnessVerboseWarning('commit_preview_log', msg, {
        identifier: ctx.identifier,
        featureName: ctx.context.feature.name,
      });
    }
  }

  const result = await commitRemaining(commitArg, {
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

/** Propagate shared files (PROJECT_PLAN.md, .gitignore, .cursor) to other `feature/*` branches. Non-blocking; scoped by feature. */
export async function stepPropagateShared(ctx: TierEndWorkflowContext): Promise<void> {
  const tier = ctx.config.name;
  if (tier === 'task') return;

  try {
    const featureBranch = `feature/${ctx.context.feature.name}`;
    const result = await propagateSharedFiles(undefined, {
      dryRun: false,
      featureScope: { tierId: ctx.identifier, featureBranchName: featureBranch },
    });
    ctx.steps.propagateShared = {
      success: result.success,
      output: result.summary + (result.details.length ? '\n' + result.details.map((d) => `${d.branch}: ${d.status} — ${d.message}`).join('\n') : ''),
    };
  } catch (err) {
    const msg = `Propagate shared files failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`;
    ctx.steps.propagateShared = { success: false, output: msg };
    console.warn(msg);
    recordHarnessVerboseWarning('propagate_shared', msg, {
      tier,
      action: 'end',
      identifier: ctx.identifier,
      featureName: ctx.context.feature.name,
    });
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
    recordHarnessVerboseWarning('config_fix', msg, {
      tier: ctx.config.name,
      action: 'end',
      identifier: ctx.identifier,
      featureName: ctx.context.feature.name,
    });
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
    const governance = await buildGovernanceGuidance(ctx.config.name, auditOutput, {
      featureName: ctx.context.feature.name,
      identifier: ctx.identifier,
    });
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

/**
 * Optional tier-specific hook, then shared commit of script-applied autofix (all tier ends).
 * Fails tier-end if commit fails (strict).
 */
export async function stepAfterAudit(
  ctx: TierEndWorkflowContext,
  hooks: TierEndWorkflowHooks
): Promise<StepExitResult> {
  if (hooks.runAfterAudit) {
    const hookExit = await hooks.runAfterAudit(ctx);
    if (hookExit) return hookExit;
  }

  const params = ctx.params as { skipGit?: boolean } | undefined;
  if (params?.skipGit || !ctx.autofixResult) {
    return null;
  }

  const tier = ctx.config.name as AuditTier;
  const commitResult = await commitAutofixChanges(tier, ctx.identifier, ctx.autofixResult, {
    skipGit: params?.skipGit,
  });
  ctx.steps.gitCommitAuditFixes = { success: commitResult.success, output: commitResult.output };

  if (!commitResult.success) {
    return {
      success: false,
      output: ctx.output.join('\n\n'),
      steps: ctx.steps,
      outcome: buildTierEndOutcome(
        'blocked_fix_required',
        'audit_fix_commit_failed',
        'Autofix produced changes but committing them failed. Resolve git state and re-run this tier-end.'
      ),
    };
  }

  if (
    commitResult.output &&
    !commitResult.output.includes('No audit fixes to commit') &&
    !commitResult.output.includes('Skipped (skipGit=true)')
  ) {
    ctx.output.push(commitResult.output);
  }

  return null;
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
