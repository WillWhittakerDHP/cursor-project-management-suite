/**
 * Reusable step modules for the tier start workflow.
 * Each step uses shared primitives (formatBranchHierarchy, runTierPlan, buildCascadeDown, runStartAuditForTier)
 * and tier-supplied hooks. The orchestrator runs these in order; steps that can exit early return a result.
 */

import type { TierStartWorkflowContext, TierStartWorkflowHooks, TierStartReadResult, ContextQuestion } from './tier-start-workflow';
import type { TierStartResult, CascadeInfo } from '../../utils/tier-outcome';
import type { CannotStartTier } from '../../utils/tier-start-utils';
import { formatBranchHierarchy, formatPlanModePreview, formatCannotStart } from '../../utils/tier-start-utils';
import { resolveCommandExecutionMode, isPlanMode } from '../../utils/command-execution-mode';
import { runTierPlan } from './tier-plan';
import { buildCascadeDown } from '../../utils/tier-cascade';
import { runStartAuditForTier } from '../../audit/run-start-audit-for-tier';
import { buildGovernanceContext } from '../../audit/governance-context';
import { fillDirectChildrenInParentGuide } from './fill-direct-children';
import { writeProjectFile } from '../../utils/utils';

/** Early-exit result from a step; null means continue. */
export type StepExitResult = TierStartResult | null;

/** Append header and branch hierarchy (always run first). */
export function stepAppendHeaderAndBranchHierarchy(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): void {
  ctx.output.push(hooks.buildHeader(ctx).join('\n'));
}

export async function stepAppendBranchHierarchy(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  const section = await formatBranchHierarchy(hooks.getBranchHierarchyOptions(ctx));
  ctx.output.push(section);
}

/** Validate start; return result to exit early if cannot start. */
export async function stepValidateStart(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<StepExitResult> {
  const validation = await hooks.validate(ctx);
  if (!validation.canStart) {
    ctx.output.push(validation.validationMessage);
    ctx.output.push(formatCannotStart(ctx.config.name as CannotStartTier, ctx.identifier));
    return {
      success: false,
      output: ctx.output.join('\n\n'),
      outcome: {
        status: 'blocked',
        reasonCode: 'validation_failed',
        nextAction: validation.validationMessage,
      },
    };
  }
  return null;
}

/** If plan mode, append plan preview and return plan result; otherwise null.
 *  - Agent sees: workflow steps (getPlanModeSteps) + content summary (getPlanContentSummary) in ctx.output.
 *  - User sees: deliverables (getTierDeliverables) in AskQuestion via outcome.deliverables.
 */
export async function stepPlanModeExit(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<StepExitResult> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (!isPlanMode(executionMode)) return null;
  const planSteps = hooks.getPlanModeSteps(ctx);
  const rawSummary = await hooks.getPlanContentSummary(ctx);
  const intro = rawSummary?.trim();
  ctx.output.push(formatPlanModePreview(planSteps, intro ? { intro } : undefined));

  const deliverables = await hooks.getTierDeliverables(ctx);

  return {
    success: true,
    output: ctx.output.join('\n\n'),
    outcome: {
      status: 'plan',
      reasonCode: 'plan_mode',
      nextAction: 'Plan preview complete. Awaiting approval to execute.',
      deliverables: deliverables || undefined,
    },
  };
}

/** Ensure branch (optional); push messages and optionally exit on failure. */
export async function stepEnsureStartBranch(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<StepExitResult> {
  if (!hooks.ensureBranch) return null;
  const branchResult = await hooks.ensureBranch(ctx);
  for (const msg of branchResult.messages) {
    ctx.output.push(msg);
  }
  if (!branchResult.success) {
    if (branchResult.blockedByUncommitted) {
      const fileList = (branchResult.uncommittedFiles ?? []).map(f => `- \`${f}\``).join('\n');
      return {
        success: true,
        output: ctx.output.join('\n\n'),
        outcome: {
          status: 'blocked',
          reasonCode: 'uncommitted_changes_blocking',
          nextAction: 'Uncommitted changes must be resolved before switching branches.',
          deliverables: `**Uncommitted files blocking checkout:**\n${fileList}\n\nCommit these changes, or skip (stash) to proceed without committing.`,
        },
      };
    }
    return {
      success: false,
      output: ctx.output.join('\n\n'),
      outcome: {
        status: 'blocked',
        reasonCode: 'branch_failed',
        nextAction: branchResult.messages.join(' '),
      },
    };
  }
  if (hooks.afterBranch) {
    await hooks.afterBranch(ctx);
  }
  return null;
}

/** Ensure child docs exist (e.g. session guide + task sections). Execute mode only; no-op if hook missing. */
export async function stepEnsureChildDocs(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (isPlanMode(executionMode)) return;
  if (!hooks.ensureChildDocs) return;
  await hooks.ensureChildDocs(ctx);
}

/** Read handoff/guide/label and append to output (optional step). */
export async function stepReadStartContext(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  if (!hooks.readContext) return;
  const readResult: TierStartReadResult = await hooks.readContext(ctx);
  ctx.readResult = readResult;
  if (readResult.label) ctx.output.push(readResult.label);
  if (readResult.handoff) ctx.output.push(readResult.handoff);
  if (readResult.guide) {
    const title = readResult.sectionTitle ?? 'Guide';
    ctx.output.push(`## ${title}\n\n${readResult.guide}`);
  }
}

/** Fill implementation-plan fields for all direct children in parent guide (execute mode only). */
export async function stepFillDirectChildren(
  ctx: TierStartWorkflowContext,
  _hooks: TierStartWorkflowHooks
): Promise<void> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (isPlanMode(executionMode)) return;
  if (ctx.config.name === 'task') return;
  await fillDirectChildrenInParentGuide(ctx);
}

/** Gather context string and append if non-empty (optional step). */
export async function stepGatherContext(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  if (!hooks.gatherContext) return;
  const gathered = await hooks.gatherContext(ctx);
  if (gathered) ctx.output.push(gathered);
}

/** Inject tier-appropriate governance context (findings, thresholds, inventory). */
export async function stepGovernanceContext(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  const taskFiles = hooks.getTaskFilePaths
    ? await hooks.getTaskFilePaths(ctx)
    : undefined;

  const governance = await buildGovernanceContext({
    tier: ctx.config.name,
    taskFiles,
  });
  if (governance) ctx.output.push(governance);
}

/** Build planning doc path for task or session (sessions dir). */
function getPlanningDocPath(ctx: TierStartWorkflowContext): string {
  const base = ctx.context.paths.getBasePath();
  const tier = ctx.config.name;
  const id = ctx.identifier;
  if (tier === 'feature') {
    return `${base}/feature-planning.md`;
  }
  if (tier === 'phase') {
    return `${base}/phases/phase-${id}-planning.md`;
  }
  if (tier === 'task') {
    return `${base}/sessions/task-${id}-planning.md`;
  }
  return `${base}/sessions/session-${id}-planning.md`;
}

/** Format a single context item as Insight + Proposal + Decision block (or plain question fallback). */
function formatContextItemBlock(q: ContextQuestion, index: number): string {
  const parts: string[] = [];
  parts.push(`### ${index + 1}. ${q.insight ? 'Insight / Proposal / Decision' : 'Question'}`);
  if (q.insight) {
    parts.push('**What the docs indicate:** ' + q.insight);
  }
  if (q.proposal) {
    parts.push('**Proposed path:** ' + q.proposal);
  }
  parts.push('**Decision needed:** ' + q.question);
  if (q.context) {
    parts.push('*' + q.context + '*');
  }
  if (q.options && q.options.length > 0) {
    parts.push('**Options:** ' + q.options.join(' | '));
  }
  return parts.join('\n\n');
}

/** Build initial planning doc markdown (Loaded Context, Goal, Files, Approach, Checkpoint, Decisions Made, Insight/Proposal/Decision blocks). */
function buildPlanningDocContent(
  ctx: TierStartWorkflowContext,
  questions: ContextQuestion[]
): string {
  const tier = ctx.config.name;
  const title = ctx.resolvedDescription ?? ctx.resolvedId;
  const governanceSummary =
    ctx.output.length > 0
      ? 'Governance context has been loaded. Review the workflow output above for P0/P1 findings and inventory.'
      : 'No governance output yet.';
  const insightBlocks =
    questions.length > 0
      ? questions.map((q, i) => formatContextItemBlock(q, i)).join('\n\n---\n\n')
      : 'None yet.';

  return `# Planning: ${tier} ${ctx.resolvedId} -- ${title}

## Loaded Context
- **Scope:** ${ctx.resolvedId}
- **Governance highlights:** ${governanceSummary}
- **Related code:** See inventory in workflow output if present.

## Goal
[To be refined during discussion]

## Files
[To be refined during discussion]

## Approach
[To be refined during discussion]

## Checkpoint
[To be refined during discussion]

## Decisions Made
[Populated as conversation progresses]

## Insight / Proposal / Decisions
${insightBlocks}
`;
}

/**
 * Context gathering Q&A step. If contextGatheringComplete or hook missing or no questions, returns null.
 * Otherwise writes planning doc, sets ctx.planningDocPath, and returns early exit with reasonCode context_gathering.
 */
export async function stepContextGathering(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<StepExitResult> {
  if (ctx.options?.contextGatheringComplete) return null;
  if (!hooks.getContextQuestions) return null;

  const questions = await hooks.getContextQuestions(ctx);
  if (!questions.length) return null;

  const planningDocPath = getPlanningDocPath(ctx);
  const content = buildPlanningDocContent(ctx, questions);
  await writeProjectFile(planningDocPath, content);
  ctx.planningDocPath = planningDocPath;

  const messageLines: string[] = [
    `Planning document created: \`${planningDocPath}\``,
    '',
    '**From the docs (insight + proposal + decision):**',
    ...questions.map((q, i) => {
      const lines: string[] = [];
      const prefix = (first: boolean) => (first ? `${i + 1}. ` : '   ');
      let first = true;
      if (q.insight) {
        lines.push(`${prefix(first)}*Insight:* ${q.insight}`);
        first = false;
      }
      if (q.proposal) {
        lines.push(`${prefix(first)}*Proposal:* ${q.proposal}`);
        first = false;
      }
      lines.push(`${prefix(first)}*Decision:* ${q.question}`);
      first = false;
      if (q.options?.length) lines.push(`   *Options:* ${q.options.join(' | ')}`);
      if (q.context && !q.insight) lines.push(`   (${q.context})`);
      return lines.join('\n');
    }),
    '',
    "When satisfied, choose: **I'm satisfied with our plan and ready to begin**",
  ];
  const deliverables = messageLines.join('\n');

  return {
    success: true,
    output: ctx.output.join('\n\n'),
    outcome: {
      status: 'plan',
      reasonCode: 'context_gathering',
      nextAction: 'Context gathering: answer questions and update the planning doc, then re-invoke with contextGatheringComplete.',
      deliverables,
    },
  };
}

/** Tier-specific extras (e.g. feature load, server refresh) — optional. */
export async function stepRunExtras(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  if (!hooks.runExtras) return;
  const extra = await hooks.runExtras(ctx);
  if (extra) ctx.output.push(extra);
}

/** Run start audit for tier (single entry point); task skips. */
export async function stepStartAudit(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  if (hooks.runStartAudit === false) return;
  const featureName = ctx.context.feature.name;
  const auditOutput = await runStartAuditForTier({
    tier: ctx.config.name,
    identifier: ctx.identifier,
    featureName,
  });
  if (auditOutput) ctx.output.push(auditOutput);
}

/** Run tier plan and append output. */
export async function stepRunTierPlan(
  ctx: TierStartWorkflowContext,
  _hooks: TierStartWorkflowHooks
): Promise<void> {
  const featureName = ctx.context.feature.name;
  const planOutput = await runTierPlan(
    ctx.config,
    ctx.resolvedId,
    ctx.resolvedDescription,
    featureName,
    ctx.readResult?.guide
  );
  ctx.output.push(planOutput);
}

/** Build cascade and nextAction from hooks. */
export async function stepBuildStartCascade(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<{ cascade?: CascadeInfo; nextAction: string }> {
  let cascade: CascadeInfo | undefined;
  if (hooks.getFirstChildId) {
    const firstChildId = await hooks.getFirstChildId(ctx);
    if (firstChildId) {
      cascade = buildCascadeDown(ctx.config.name, firstChildId) ?? undefined;
    }
  }
  const nextAction =
    hooks.getCompactPrompt?.(ctx) ??
    `Proceed with ${ctx.config.name} "${ctx.resolvedId}" using the plan above.`;
  return { cascade, nextAction };
}
