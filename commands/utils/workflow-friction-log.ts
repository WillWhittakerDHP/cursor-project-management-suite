/**
 * Append-only markdown log for non-git harness / planning / audit friction.
 * Mirrors git-friction-log ergonomics; uses the same reason-code normalization as control-plane routing.
 *
 * Canonical programmatic API for agents and tooling: recordWorkflowFriction (use forcePolicy for
 * material friction without a harness failure outcome). Do not add parallel friction files.
 */

import { appendFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import type { FlowReasonCode, ReasonCode } from '../harness/contracts';
import { isFailureReasonCode, parseReasonCode } from '../harness/reason-code';
import { PROJECT_ROOT } from './utils';

const WORKFLOW_FRICTION_LOG = join(PROJECT_ROOT, '.project-manager', 'WORKFLOW_FRICTION_LOG.md');

const MAX_NEXT_ACTION = 1500;
const MAX_DELIVERABLES = 2000;

export type HarnessWorkflowFrictionMode = 'off' | 'failures' | 'verbose';

/** Expected gate / flow stops: do not auto-append when these appear on failure-shaped results. */
const FLOW_REASON_CODES_SUPPRESS_AUTO_LOG: ReadonlySet<FlowReasonCode> = new Set([
  'context_gathering',
  'guide_fill_pending',
  'guide_incomplete',
  'planning_doc_incomplete',
  'start_ok',
  'end_ok',
  'task_complete',
  'reopen_ok',
  'pending_push',
  'verification_suggested',
]);

export function getHarnessWorkflowFrictionMode(): HarnessWorkflowFrictionMode {
  if (typeof process === 'undefined') return 'failures';
  const v = (process.env.HARNESS_WORKFLOW_FRICTION ?? 'failures').trim().toLowerCase();
  if (v === 'off' || v === '0' || v === 'false') return 'off';
  if (v === 'verbose') return 'verbose';
  return 'failures';
}

export interface WorkflowFrictionEntry {
  /** ISO date YYYY-MM-DD for title line */
  date?: string;
  /** Short title fragment after date / id / tier in ### heading */
  title?: string;
  symptom: string;
  context: string;
  whatWeTried?: string;
  outcome?: string;
  suggestion?: string;
  reasonCodeRaw: string;
  reasonCodeNormalized: ReasonCode;
  isFailureReason: boolean;
  tier?: string;
  action?: 'start' | 'end' | 'add';
  identifier?: string;
  featureName?: string;
  stepPath?: string[];
}

function truncate(text: string | undefined, max: number): string | undefined {
  if (text == null || text === '') return undefined;
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n\n…(truncated)`;
}

/**
 * Whether orchestrator-driven auto-logging should append for this failure-shaped outcome.
 */
export function shouldAppendWorkflowFriction(input: {
  success: boolean;
  reasonCodeRaw: string;
}): boolean {
  if (getHarnessWorkflowFrictionMode() === 'off') return false;
  if (input.success) return false;
  const normalized = parseReasonCode(input.reasonCodeRaw);
  if (FLOW_REASON_CODES_SUPPRESS_AUTO_LOG.has(normalized as FlowReasonCode)) {
    return false;
  }
  if (isFailureReasonCode(normalized)) {
    return true;
  }
  /** Flow code but not suppressed (e.g. uncommitted_blocking): still worth capturing. */
  if (normalized === 'uncommitted_blocking') {
    return true;
  }
  return false;
}

function formatWorkflowFrictionMarkdown(entry: WorkflowFrictionEntry): string {
  const date = entry.date ?? new Date().toISOString().slice(0, 10);
  const id = entry.identifier?.trim() || '—';
  const tier = entry.tier?.trim() || '—';
  const act =
    entry.action === 'start' || entry.action === 'end' || entry.action === 'add'
      ? entry.action
      : '—';
  const shortTitle = entry.title?.trim() || entry.reasonCodeNormalized;
  const lines: string[] = [
    `### ${date} — ${id} — ${tier} — ${act} — ${shortTitle}`,
    '',
    `- **reasonCodeRaw:** ${entry.reasonCodeRaw}`,
    `- **reasonCodeNormalized:** ${entry.reasonCodeNormalized}`,
    `- **isFailureReason:** ${entry.isFailureReason}`,
    `- **tier:** ${tier}`,
    `- **action:** ${act}`,
    `- **identifier:** ${id}`,
    `- **featureName:** ${entry.featureName?.trim() || '—'}`,
    `- **stepPath:** ${entry.stepPath?.length ? entry.stepPath.join(', ') : '—'}`,
    '',
    `- **Symptom:** ${entry.symptom}`,
    `- **Context:** ${entry.context}`,
  ];
  if (entry.whatWeTried) lines.push(`- **What we tried:** ${entry.whatWeTried}`);
  if (entry.outcome) lines.push(`- **Outcome / workaround:** ${entry.outcome}`);
  if (entry.suggestion) lines.push(`- **Suggestion:** ${entry.suggestion}`);
  return lines.join('\n');
}

/**
 * Append one markdown block (best-effort; never throws to callers).
 */
export async function appendWorkflowFriction(entry: WorkflowFrictionEntry): Promise<void> {
  const block = formatWorkflowFrictionMarkdown(entry);
  try {
    await mkdir(dirname(WORKFLOW_FRICTION_LOG), { recursive: true });
    await appendFile(WORKFLOW_FRICTION_LOG, `\n${block}\n`, 'utf8');
  } catch (err) {
    console.warn(
      `[appendWorkflowFriction] could not write: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export type RecordWorkflowFrictionInput = WorkflowFrictionEntry & { forcePolicy?: boolean };

/**
 * Fire-and-forget append. When forcePolicy is true, bypass shouldAppend policy (still no writes if env is off).
 * **Canonical API for agents, slash-command helpers, and scripts** recording material non-git friction.
 */
export function recordWorkflowFriction(entry: RecordWorkflowFrictionInput): void {
  const mode = getHarnessWorkflowFrictionMode();
  if (mode === 'off') return;
  const { forcePolicy, ...rest } = entry;
  if (!forcePolicy && !shouldAppendWorkflowFriction({ success: false, reasonCodeRaw: rest.reasonCodeRaw })) {
    return;
  }
  void appendWorkflowFriction(rest);
}

/**
 * Build a log entry from tier orchestrator context + outcome (start or end).
 */
export function buildWorkflowFrictionEntryFromOrchestrator(params: {
  action: 'start' | 'end' | 'add';
  tier: string;
  identifier: string;
  featureName?: string;
  reasonCodeRaw: string;
  stepPath?: string[];
  nextAction?: string;
  deliverablesExcerpt?: string;
  symptom?: string;
  /** When set, replaces the default tier/identifier/nextAction/deliverables context block. */
  context?: string;
}): WorkflowFrictionEntry {
  const reasonCodeRaw = String(params.reasonCodeRaw ?? '');
  const normalized = parseReasonCode(reasonCodeRaw);
  const symptom =
    params.symptom ??
    `Harness ${params.action} failed (reasonCode=${reasonCodeRaw}).`;
  const contextParts = [
    `tier=${params.tier}`,
    `identifier=${params.identifier}`,
    params.featureName ? `featureName=${params.featureName}` : null,
  ].filter(Boolean);
  const next = truncate(params.nextAction, MAX_NEXT_ACTION);
  const del = truncate(params.deliverablesExcerpt, MAX_DELIVERABLES);
  const context =
    params.context ??
    contextParts.join('; ') +
      (next ? `\n\nnextAction:\n${next}` : '') +
      (del ? `\n\ndeliverables (excerpt):\n${del}` : '');
  return {
    reasonCodeRaw,
    reasonCodeNormalized: normalized,
    isFailureReason: isFailureReasonCode(normalized),
    tier: params.tier,
    action: params.action,
    identifier: params.identifier,
    featureName: params.featureName,
    stepPath: params.stepPath,
    symptom,
    context,
  };
}

/**
 * Verbose-only step warning (deliverables check, governance envelope, etc.).
 */
export function recordWorkflowFrictionWarning(
  stepId: string,
  message: string,
  extra?: Partial<Pick<WorkflowFrictionEntry, 'tier' | 'action' | 'identifier' | 'featureName'>>
): void {
  if (getHarnessWorkflowFrictionMode() !== 'verbose') return;
  const reasonCodeRaw = 'harness_step_warning';
  const normalized = parseReasonCode(reasonCodeRaw);
  recordWorkflowFriction({
    ...extra,
    reasonCodeRaw,
    reasonCodeNormalized: normalized,
    isFailureReason: isFailureReasonCode(normalized),
    title: stepId,
    symptom: `[${stepId}] ${message}`,
    context: 'Harness verbose friction logging (HARNESS_WORKFLOW_FRICTION=verbose).',
    forcePolicy: true,
  });
}
