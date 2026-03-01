/**
 * Reusable step modules for the tier start workflow.
 * Each step uses shared primitives (formatBranchHierarchy, runTierPlan, buildCascadeDown, runStartAuditForTier)
 * and tier-supplied hooks. The orchestrator runs these in order; steps that can exit early return a result.
 */

import type {
  TierStartWorkflowContext,
  TierStartWorkflowHooks,
  TierStartReadResult,
  ContextQuestion,
} from './tier-start-workflow-types';
import type { TierStartResult, CascadeInfo } from '../../utils/tier-outcome';
import type { CannotStartTier } from '../../utils/tier-start-utils';
import { formatBranchHierarchy, formatCannotStart } from '../../utils/tier-start-utils';
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

/**
 * Read guide/handoff in plan mode without appending to ctx.output.
 * Populates ctx.readResult so getContextQuestions(ctx) has content. Only runs in plan mode.
 */
export async function stepReadContextLight(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<void> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (!isPlanMode(executionMode)) return;
  if (!hooks.readContext) return;
  if (ctx.readResult) return;

  try {
    ctx.readResult = await hooks.readContext(ctx);
  } catch {
    // Non-blocking: guide/handoff may not exist yet.
  }
}

/**
 * Plan-mode-only wrapper for stepContextGathering.
 * Use at the early position (before stepPlanModeExit) so explicit execute-mode
 * calls without contextGatheringComplete do not accidentally trigger Q&A.
 */
export async function stepContextGatheringPlanMode(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<StepExitResult> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (!isPlanMode(executionMode)) return null;
  return stepContextGathering(ctx, hooks);
}

/** If plan mode, append plan summary and return plan result; otherwise null.
 *  - Agent sees: content summary (getPlanContentSummary) + tier-aware one-line process hint in ctx.output.
 *  - User sees: deliverables (getTierDeliverables) in AskQuestion via outcome.deliverables.
 */
export async function stepPlanModeExit(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): Promise<StepExitResult> {
  const executionMode = resolveCommandExecutionMode(ctx.options, 'plan');
  if (!isPlanMode(executionMode)) return null;
  const rawSummary = await hooks.getPlanContentSummary(ctx);
  if (rawSummary?.trim()) {
    ctx.output.push(rawSummary.trim());
  }
  const processLine =
    ctx.config.name === 'task'
      ? 'On approval (Begin Coding), execute mode will load context and begin implementation.'
      : 'On approval, execute mode will set up the branch, load context, run audit, and cascade to the first child tier.';
  ctx.output.push(processLine);

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

/** Max characters to include from guide/handoff in planning doc so the doc stays readable. */
const LOADED_CONTEXT_EXCERPT_MAX = 3200;

function truncateForLoadedContext(text: string, maxLen: number = LOADED_CONTEXT_EXCERPT_MAX): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen) + '\n\n*(excerpt truncated)*';
}

function extractGovernanceHighlights(output: string): string[] {
  const lines = output.split('\n');
  const findings = lines
    .map(line => line.trim())
    .filter(line =>
      line.length > 0 &&
      (line.includes('P0') || line.includes('P1') || line.includes('violations') || line.includes('hotspot'))
    )
    .slice(0, 6);
  return findings;
}

function extractInventoryHints(output: string): string[] {
  const lines = output.split('\n');
  const hints = lines
    .map(line => line.trim())
    .filter(line =>
      line.startsWith('- `') ||
      line.includes('Related Existing Code') ||
      line.includes('reuse')
    )
    .slice(0, 8);
  return hints;
}

/**
 * Enforce tierUp-only: loaded context in the planning doc is from tierUp sources only;
 * tierDown docs are excluded. Call when building planning doc in plan mode.
 */
function getTierUpOnlyPolicyNote(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks
): string | undefined {
  const policy = hooks.getContextSourcePolicy?.(ctx);
  if (!policy?.tierUpOnly) return undefined;
  const desc = policy.allowedSourceDescription?.trim();
  return desc
    ? `- **Context source policy:** tierUp only. ${desc}`
    : `- **Context source policy:** tierUp only. TierDown documents are excluded from planning.`;
}

/** Task design artifact shape for "Design Before Execute" section in task planning doc. */
export interface TaskDesignArtifact {
  codingGoal: string;
  files: string[];
  pseudocodeSteps: string[];
  snippets: string;
  acceptanceChecks: string[];
}

/** Build initial planning doc markdown (Loaded Context, Goal, Files, Approach, Checkpoint, Decisions Made, Insight/Proposal/Decision blocks). For task, adds Design Before Execute when taskDesign present. */
function buildPlanningDocContent(
  ctx: TierStartWorkflowContext,
  hooks: TierStartWorkflowHooks,
  questions: ContextQuestion[],
  governanceContext?: string,
  contextWorkBrief?: {
    planningSummary: string;
    executionProposal: string;
    taskDesign?: TaskDesignArtifact;
  }
): string {
  const tier = ctx.config.name;
  const title = ctx.resolvedDescription ?? ctx.resolvedId;
  const readResult = ctx.readResult;
  const fullOutput = [ctx.output.join('\n'), governanceContext ?? ''].filter(Boolean).join('\n');
  const governanceHighlights = extractGovernanceHighlights(fullOutput);
  const inventoryHints = extractInventoryHints(fullOutput);
  const governanceSummary = governanceHighlights.length > 0
    ? `Loaded ${governanceHighlights.length} governance highlights from current audits.`
    : 'No governance findings were extracted from current output.';

  const loadedContextLines: string[] = [`- **Scope:** ${ctx.resolvedId}`];
  const policyNote = getTierUpOnlyPolicyNote(ctx, hooks);
  if (policyNote) loadedContextLines.push('', policyNote, '');
  if (contextWorkBrief?.planningSummary?.trim()) {
    loadedContextLines.push('', '### What We Are Planning (from context)', '', contextWorkBrief.planningSummary.trim(), '');
  }
  if (contextWorkBrief?.executionProposal?.trim()) {
    loadedContextLines.push('', '### Proposed Implementation Plan', '', contextWorkBrief.executionProposal.trim(), '');
  }
  if (readResult?.label?.trim()) {
    loadedContextLines.push('', readResult.label.trim(), '');
  }
  if (readResult?.handoff?.trim()) {
    loadedContextLines.push('### Transition context (handoff)', '', truncateForLoadedContext(readResult.handoff, 2000), '');
  }
  if (readResult?.guide?.trim()) {
    const guideTitle = readResult.sectionTitle ?? 'Guide';
    loadedContextLines.push(`### ${guideTitle}`, '', truncateForLoadedContext(readResult.guide), '');
  }
  if (governanceContext?.trim()) {
    loadedContextLines.push(
      '### Governance Context (audit digest)',
      '',
      truncateForLoadedContext(governanceContext, 1800),
      ''
    );
  }
  loadedContextLines.push('- **Governance highlights:** ' + governanceSummary);
  if (governanceHighlights.length > 0) {
    loadedContextLines.push('', '### Governance Findings', '', ...governanceHighlights.map(g => `- ${g}`), '');
  }
  if (inventoryHints.length > 0) {
    loadedContextLines.push('### Reuse Opportunities', '', ...inventoryHints.map(i => `- ${i.replace(/^- /, '')}`), '');
  } else {
    loadedContextLines.push('- **Related code:** No inventory reuse hints were extracted from current output.');
  }

  const insightBlocks =
    questions.length > 0
      ? questions.map((q, i) => formatContextItemBlock(q, i)).join('\n\n---\n\n')
      : 'None yet.';

  const designSection =
    tier === 'task' && contextWorkBrief?.taskDesign
      ? [
          '',
          '## Design Before Execute',
          '',
          '### Coding Goal',
          contextWorkBrief.taskDesign.codingGoal.trim() || '[Define explicit coding goal before beginning implementation]',
          '',
          '### Files',
          contextWorkBrief.taskDesign.files.length > 0
            ? contextWorkBrief.taskDesign.files.map(f => `- ${f}`).join('\n')
            : '[List files to touch]',
          '',
          '### Pseudocode',
          contextWorkBrief.taskDesign.pseudocodeSteps.length > 0
            ? contextWorkBrief.taskDesign.pseudocodeSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')
            : '[Outline steps before coding]',
          '',
          '### Snippets (scaffold)',
          contextWorkBrief.taskDesign.snippets.trim() || '[Key code shapes or signatures]',
          '',
          '### Acceptance / Test Intent',
          contextWorkBrief.taskDesign.acceptanceChecks.length > 0
            ? contextWorkBrief.taskDesign.acceptanceChecks.map(c => `- ${c}`).join('\n')
            : '[What to verify when done]',
          '',
        ].join('\n')
      : '';

  const goalFilesApproach =
    tier === 'task' && contextWorkBrief?.taskDesign
      ? ''
      : `

## Goal
[To be refined during discussion]

## Files
[To be refined during discussion]

## Approach
[To be refined during discussion]

## Checkpoint
[To be refined during discussion]
`;

  return `# Planning: ${tier} ${ctx.resolvedId} -- ${title}

## Loaded Context
${loadedContextLines.join('\n')}
${designSection}
${goalFilesApproach}

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

  const taskFiles = hooks.getTaskFilePaths
    ? await hooks.getTaskFilePaths(ctx)
    : undefined;
  const governanceContext = await buildGovernanceContext({
    tier: ctx.config.name,
    taskFiles,
  });
  const contextWorkBrief = hooks.getContextWorkBrief
    ? await hooks.getContextWorkBrief(ctx)
    : undefined;

  const planningDocPath = getPlanningDocPath(ctx);
  const content = buildPlanningDocContent(ctx, hooks, questions, governanceContext, contextWorkBrief);
  await writeProjectFile(planningDocPath, content);
  ctx.planningDocPath = planningDocPath;

  const messageLines: string[] = [
    `Planning document created: \`${planningDocPath}\``,
    '',
  ];
  if (contextWorkBrief?.planningSummary?.trim()) {
    messageLines.push(
      '**What the context says we are planning/building:**',
      contextWorkBrief.planningSummary.trim(),
      ''
    );
  }
  if (contextWorkBrief?.executionProposal?.trim()) {
    messageLines.push(
      '**Proposed implementation approach (project/code execution):**',
      contextWorkBrief.executionProposal.trim(),
      ''
    );
  }
  messageLines.push(
    '**Discussion first:** We should review/adjust the concrete work plan above before final satisfaction.',
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
    "After we discuss/refine the concrete work plan, choose: **I'm satisfied with our plan and ready to begin**",
  );
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
