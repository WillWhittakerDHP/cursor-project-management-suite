/**
 * /harness-repair: plan (triage + advisory context) and execute (addressed flags + Policy A parent SHA stamp).
 * Git side effects only via git-manager. Friction log utilities from read-workflow-friction.
 */

import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { WorkflowCommandContext } from '../../utils/command-context';
import type { TierName } from '../../utils/workflow-scope';
import type { TierParamsBag } from '../../utils/workflow-scope';
import type { CommandExecutionOptions, CommandExecutionMode } from '../../utils/command-execution-mode';
import { PROJECT_ROOT } from '../../utils/utils';
import { classifyWorkProfile } from '../work-profile-classifier';
import { buildTierAdvisoryContext } from '../tier-advisory-context';
import {
  analyzeFrictionRecurrenceClusters,
  applyHarnessRepairBlocksToEntries,
  buildFrictionClusterKey,
  buildSuggestedNextHarnessActionsMarkdown,
  filterWorkflowFrictionEntriesForHarness,
  formatHarnessRepairAddressedBlock,
  hasOpenWorkflowFrictionEntries,
  isFrictionEntryOpenForHarnessGate,
  readFullWorkflowFrictionLog,
  splitWorkflowFrictionLogFile,
  stampPendingParentRepoCommitsInMarkdown,
  type ParsedWorkflowFrictionEntry,
} from '../../utils/read-workflow-friction';
import {
  commitCursorSubmoduleAndStageParentGitlink,
  commitRemaining,
  getCursorSubmoduleStatus,
  runGitCommand,
} from '../../git/shared/git-manager';
import { getWorkflowFrictionLogPath, WORKFLOW_FRICTION_LOG_RELATIVE } from '../../utils/workflow-friction-log';

export interface HarnessRepairParams {
  featureId: string;
  tier?: TierName;
  sessionId?: string;
  phaseId?: string;
  taskId?: string;
  featureName?: string;
  taskFiles?: string[];
  mode?: 'plan' | 'execute';
  options?: CommandExecutionOptions;
  /** Required for execute mode (safety gate). */
  confirmed?: boolean;
  /** Section headings (`###` line text) to mark addressed. */
  entryHeadings?: string[];
  /** Free-text note stored on each addressed entry. */
  note?: string;
  runSubmoduleCommit?: boolean;
  submoduleCommitMessage?: string;
  projectRoot?: string;
}

export interface HarnessRepairResult {
  success: boolean;
  output: string;
}

function buildTierParamsBag(p: HarnessRepairParams): TierParamsBag {
  return {
    featureId: p.featureId,
    featureName: p.featureName,
    sessionId: p.sessionId,
    phaseId: p.phaseId,
    taskId: p.taskId,
  };
}

function buildReferenceMarkdown(): string {
  return [
    '## Reference',
    '',
    '- `.project-manager/HARNESS_CHARTER.md`',
    '- `.cursor/commands/tiers/START_END_PLAYBOOK_STRUCTURE.md` (workflow friction)',
    '- `.cursor/commands/harness/workflow-friction-manager.ts`',
    '- `.cursor/skills/tier-workflow-agent/reason-codes.md`',
    '- `.cursor/commands/git/shared/git-manager.ts`',
    '- `.project-manager/WORKFLOW_FRICTION_LOG.md`',
  ].join('\n');
}

function renderAdvisorySections(advisory: Awaited<ReturnType<typeof buildTierAdvisoryContext>>): string {
  const parts: string[] = ['## Advisory context (buildTierAdvisoryContext)', ''];
  if (advisory.taskGovernanceDeferred && advisory.taskGovernanceDeferredMessage) {
    parts.push(advisory.taskGovernanceDeferredMessage, '');
  } else {
    parts.push(advisory.governanceContractBlock, '');
  }
  parts.push(advisory.workProfileSection.trim(), '');
  if (advisory.architectureExcerpt?.trim()) {
    parts.push(advisory.architectureExcerpt.trim(), '');
  }
  return parts.join('\n').trimEnd();
}

function openEntriesTable(entries: ParsedWorkflowFrictionEntry[]): string {
  const open = entries.filter((e) => isFrictionEntryOpenForHarnessGate(e.body));
  if (open.length === 0) {
    return '## Open entries\n\n(none — no entries require harness-repair triage for push gate)\n';
  }
  const rows = open.map((e) => {
    const key = buildFrictionClusterKey(e);
    return `| ${e.heading.replace(/\|/g, '\\|')} | \`${key.slice(0, 80)}${key.length > 80 ? '…' : ''}\` |`;
  });
  return [
    '## Open entries',
    '',
    '| Section | Cluster key (abbrev) |',
    '|---------|----------------------|',
    ...rows,
    '',
  ].join('\n');
}

async function buildPlanMarkdown(ctx: {
  tier: TierName;
  workProfile: ReturnType<typeof classifyWorkProfile>;
  entries: ParsedWorkflowFrictionEntry[];
  projectRoot: string;
}): Promise<string> {
  const advisory = await buildTierAdvisoryContext({
    tier: ctx.tier,
    workProfile: ctx.workProfile,
    projectRoot: ctx.projectRoot,
  });
  const clusters = analyzeFrictionRecurrenceClusters(ctx.entries);
  const nextActions = buildSuggestedNextHarnessActionsMarkdown({
    clusters,
    workProfileSummary: [
      `- **Execution intent:** ${ctx.workProfile.executionIntent}`,
      `- **Context pack:** ${ctx.workProfile.contextPack ?? '—'}`,
    ].join('\n'),
  });
  const sub = await getCursorSubmoduleStatus(ctx.projectRoot);
  const subMd =
    sub.available === false
      ? `**Submodule:** ${sub.skipReason ?? 'unavailable'}`
      : `**Submodule \`.cursor\`:** dirty=${sub.dirty}, branch=${sub.branchLabel}, head=${sub.headSha ?? '—'}`;

  return [
    '# Harness repair (plan mode)',
    '',
    subMd,
    '',
    openEntriesTable(ctx.entries),
    '',
    '## Recurrence analysis',
    '',
    clusters.length === 0
      ? '(no sections in log)'
      : clusters
          .map((c) => {
            const flag =
              c.addressedClosedCount >= 2 && c.openCount >= 1 ? ' **recurring**' : '';
            return `- **${c.clusterKey}**${flag} — open: ${c.openCount}, addressed (any): ${c.addressedHistoricalCount}, closed: ${c.addressedClosedCount}`;
          })
          .join('\n'),
    '',
    nextActions,
    '',
    renderAdvisorySections(advisory),
    '',
    buildReferenceMarkdown(),
    '',
  ].join('\n');
}

/**
 * Plan or execute harness repair for workflow friction log + optional `.cursor` submodule.
 */
export async function harnessRepair(params: HarnessRepairParams): Promise<HarnessRepairResult> {
  const projectRoot = params.projectRoot ?? PROJECT_ROOT;
  const mode: CommandExecutionMode =
    (params.options?.mode ?? params.mode ?? 'plan') as CommandExecutionMode;
  const tier: TierName = params.tier ?? 'feature';

  if (tier !== 'feature') {
    const id =
      tier === 'session'
        ? params.sessionId
        : tier === 'phase'
          ? params.phaseId
          : params.taskId;
    if (!id?.trim()) {
      return {
        success: false,
        output: `tier "${tier}" requires sessionId, phaseId, or taskId respectively.`,
      };
    }
  }

  let context: WorkflowCommandContext;
  try {
    context = await WorkflowCommandContext.contextFromParams(tier, buildTierParamsBag(params));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, output: `Failed to resolve workflow context: ${msg}` };
  }

  const workProfile = classifyWorkProfile({
    tier,
    action: 'start',
    reasonCode: 'workflow_bug_fix',
  });

  const rawLog = await readFullWorkflowFrictionLog(projectRoot);
  const { preamble, entries } = splitWorkflowFrictionLogFile(rawLog);
  const entriesForPlan = filterWorkflowFrictionEntriesForHarness(entries);

  if (mode === 'plan') {
    const md = await buildPlanMarkdown({ tier, workProfile, entries: entriesForPlan, projectRoot });
    return { success: true, output: md };
  }

  if (params.confirmed !== true) {
    return {
      success: false,
      output:
        'Execute mode requires `confirmed: true`. Run plan mode first, then execute with explicit confirmation.',
    };
  }

  const headings = params.entryHeadings?.map((h) => h.trim()).filter(Boolean) ?? [];
  if (headings.length === 0) {
    return {
      success: false,
      output: 'Execute mode requires `entryHeadings` (section titles matching `###` lines in the friction log).',
    };
  }

  const target = new Set(headings);
  for (const h of headings) {
    if (!entries.some((e) => e.heading === h)) {
      return {
        success: false,
        output: `No friction section found with heading exactly matching: "${h}"`,
      };
    }
  }

  let subShaOut = '—';
  if (params.runSubmoduleCommit === true) {
    const msg =
      params.submoduleCommitMessage?.trim() ||
      '[harness-repair] submodule harness updates';
    const subRes = await commitCursorSubmoduleAndStageParentGitlink({
      message: msg,
      projectRoot,
    });
    if (!subRes.success) {
      return { success: false, output: subRes.output };
    }
    if (subRes.submoduleSha) {
      subShaOut = subRes.submoduleSha;
    } else {
      const st = await getCursorSubmoduleStatus(projectRoot);
      subShaOut = st.headSha ?? '—';
    }
  } else {
    const st = await getCursorSubmoduleStatus(projectRoot);
    if (st.available && st.headSha) {
      subShaOut = st.headSha;
    }
  }

  const iso = new Date().toISOString();
  const note = params.note?.trim() || '(no note)';
  const block = formatHarnessRepairAddressedBlock({
    isoTime: iso,
    note,
    parentRepoCommit: 'pending',
    cursorSubmoduleCommit: subShaOut,
  });

  const updated = applyHarnessRepairBlocksToEntries(preamble, entries, target, block);
  const logPath = getWorkflowFrictionLogPath(projectRoot);
  await writeFile(logPath, updated, 'utf8');

  const commit1 = await commitRemaining(
    {
      subject: '[harness-repair] mark workflow friction addressed',
      body: `Sections: ${headings.join('; ')}`,
    },
    { allowedPrefixes: ['.project-manager/', 'client/', 'server/'] }
  );

  if (!commit1.success) {
    return {
      success: false,
      output: `Wrote ${WORKFLOW_FRICTION_LOG_RELATIVE} but parent commit failed: ${commit1.output}`,
    };
  }

  const head = await runGitCommand('git rev-parse HEAD', 'harnessRepair-revParse');
  if (!head.success || !head.output.trim()) {
    return {
      success: false,
      output: `Committed but could not read parent HEAD: ${head.error ?? head.output}`,
    };
  }
  const sha = head.output.trim();

  const stamped = stampPendingParentRepoCommitsInMarkdown(updated, sha);
  if (stamped === updated) {
    return {
      success: true,
      output: `${commit1.output}\n\nNote: no \`parentRepoCommit: pending\` lines found to stamp (file unchanged after stamp pass).`,
    };
  }

  await writeFile(logPath, stamped, 'utf8');

  const commit2 = await commitRemaining({
    subject: 'chore: stamp harness-repair parent SHA',
    body: `Recorded parent ${sha} for harness-repair addressed entries.`,
  });

  if (!commit2.success) {
    return {
      success: false,
      output: `First commit ok (${sha}), but stamp commit failed: ${commit2.output}. Fix git state manually.`,
    };
  }

  return {
    success: true,
    output: [
      commit1.output,
      `Stamped **parentRepoCommit:** \`${sha}\` in ${WORKFLOW_FRICTION_LOG_RELATIVE}.`,
      commit2.output,
    ].join('\n\n'),
  };
}

// ─── CLI (npx tsx) ─────────────────────────────────────────────────────────

const harnessRepairThisFile = fileURLToPath(import.meta.url);
const isHarnessRepairCli =
  typeof process !== 'undefined' &&
  Boolean(process.argv[1]) &&
  resolvePath(process.argv[1]!) === resolvePath(harnessRepairThisFile);

if (isHarnessRepairCli) {
  void (async (): Promise<void> => {
    const a = process.argv;
    const fi = a.indexOf('--feature');
    const featureId =
      (fi >= 0 && a[fi + 1] ? a[fi + 1] : '') ||
      process.env.FEATURE_ID ||
      process.env.FEATURE_REF ||
      '';
    const si = a.indexOf('--session');
    const pi = a.indexOf('--phase');
    const ti = a.indexOf('--task');
    let tier: TierName = 'feature';
    let sessionId: string | undefined;
    let phaseId: string | undefined;
    let taskId: string | undefined;
    if (si >= 0 && a[si + 1]) {
      tier = 'session';
      sessionId = a[si + 1];
    } else if (pi >= 0 && a[pi + 1]) {
      tier = 'phase';
      phaseId = a[pi + 1];
    } else if (ti >= 0 && a[ti + 1]) {
      tier = 'task';
      taskId = a[ti + 1];
    }
    const execute = a.includes('--execute');
    const confirmed = a.includes('--confirm');
    const hi = a.indexOf('--headings');
    const entryHeadings =
      hi >= 0 && a[hi + 1] ? a[hi + 1].split(',').map((s) => s.trim()).filter(Boolean) : [];
    const ni = a.indexOf('--note');
    const note = ni >= 0 && a[ni + 1] ? a[ni + 1] : undefined;
    const runSubmoduleCommit = a.includes('--commit-submodule');
    const sm = a.indexOf('--submodule-message');
    const submoduleCommitMessage = sm >= 0 && a[sm + 1] ? a[sm + 1] : undefined;

    if (!featureId.trim()) {
      console.error(
        'Usage: npx tsx .cursor/commands/harness/composite/harness-repair-impl.ts --feature <id> [--session <sid>|--phase <pid>|--task <tid>] [--plan|--execute --confirm --headings "h1,h2" [--note "…"] [--commit-submodule] [--submodule-message "…"]]'
      );
      process.exit(1);
      return;
    }

    const r = await harnessRepair({
      featureId: featureId.trim(),
      tier,
      sessionId,
      phaseId,
      taskId,
      mode: execute ? 'execute' : 'plan',
      confirmed: execute ? confirmed : undefined,
      entryHeadings: execute ? entryHeadings : undefined,
      note,
      runSubmoduleCommit: execute ? runSubmoduleCommit : undefined,
      submoduleCommitMessage,
    });
    console.log(r.output);
    process.exit(r.success ? 0 : 1);
  })();
}
