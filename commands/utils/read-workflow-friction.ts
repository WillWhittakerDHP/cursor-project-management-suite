/**
 * Parse and filter `.project-manager/WORKFLOW_FRICTION_LOG.md` (sections headed by `###`).
 * CLI: npx tsx .cursor/commands/utils/read-workflow-friction.ts [--last N] [--grep substring] [--reason normalizedCode] [--json]
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './utils';
import { parseReasonCode } from '../harness/reason-code';
import { getWorkflowFrictionLogPath } from './workflow-friction-log';

/** Bullet labels written by harness-repair execute (stable contract). */
export const HARNESS_REPAIR_BULLET_ADDRESSED = 'harnessRepairAddressed';
export const HARNESS_REPAIR_BULLET_NOTE = 'harnessRepairNote';
export const HARNESS_REPAIR_BULLET_PARENT_SHA = 'parentRepoCommit';
export const HARNESS_REPAIR_BULLET_SUB_SHA = 'cursorSubmoduleCommit';

export interface ParsedWorkflowFrictionEntry {
  /** First line without leading ### */
  heading: string;
  body: string;
  reasonCodeRaw?: string;
  reasonCodeNormalized?: string;
  isFailureReason?: boolean;
  raw: string;
}

/**
 * True for the markdown **entry template** heading in WORKFLOW_FRICTION_LOG.md (not a real incident).
 * WHY: `parseWorkflowFrictionLog` splits on `###`; the template inside the doc is parsed as a bogus open row.
 */
export function isWorkflowFrictionNoiseEntry(entry: ParsedWorkflowFrictionEntry): boolean {
  const h = entry.heading;
  return h.includes('[feature/phase/session/task id]') || /^YYYY-MM-DD — \[/.test(h);
}

/** Strip doc-template sections before harness-repair plan, recurrence, and push gate. */
export function filterWorkflowFrictionEntriesForHarness(
  entries: ParsedWorkflowFrictionEntry[]
): ParsedWorkflowFrictionEntry[] {
  return entries.filter((e) => !isWorkflowFrictionNoiseEntry(e));
}

export function extractWorkflowFrictionBullet(body: string, label: string): string | undefined {
  const re = new RegExp(`^-\\s*\\*\\*${label}:\\*\\*\\s*(.+)$`, 'im');
  const m = body.match(re);
  return m?.[1]?.trim();
}

/**
 * Split markdown content on `###` headings; only sections that start with `###` are returned.
 */
export function parseWorkflowFrictionLog(content: string): ParsedWorkflowFrictionEntry[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  const chunks = trimmed.split(/\n(?=### )/);
  const out: ParsedWorkflowFrictionEntry[] = [];
  for (const chunk of chunks) {
    const c = chunk.trim();
    if (!c.startsWith('###')) continue;
    const nl = c.indexOf('\n');
    const headingLine = nl === -1 ? c.slice(4).trim() : c.slice(4, nl).trim();
    const body = nl === -1 ? '' : c.slice(nl + 1).trim();
    const reasonCodeRaw = extractWorkflowFrictionBullet(body, 'reasonCodeRaw');
    const reasonCodeNormalized = extractWorkflowFrictionBullet(body, 'reasonCodeNormalized');
    const isFailureStr = extractWorkflowFrictionBullet(body, 'isFailureReason');
    let isFailureReason: boolean | undefined;
    if (isFailureStr === 'true') isFailureReason = true;
    else if (isFailureStr === 'false') isFailureReason = false;
    out.push({
      heading: headingLine,
      body,
      reasonCodeRaw,
      reasonCodeNormalized,
      isFailureReason,
      raw: c,
    });
  }
  return out;
}

export function splitWorkflowFrictionLogFile(content: string): {
  preamble: string;
  entries: ParsedWorkflowFrictionEntry[];
} {
  const t = content.replace(/\r\n/g, '\n');
  const idx = t.search(/^### /m);
  if (idx === -1) {
    return { preamble: t.trimEnd(), entries: [] };
  }
  const preamble = t.slice(0, idx).trimEnd();
  const body = t.slice(idx);
  return { preamble, entries: parseWorkflowFrictionLog(body) };
}

export function joinWorkflowFrictionLogFile(
  preamble: string,
  entries: ParsedWorkflowFrictionEntry[]
): string {
  const sections = entries.map((e) => e.raw.trimEnd()).join('\n\n');
  const p = preamble.trimEnd();
  if (!sections) {
    return p ? `${p}\n` : '';
  }
  if (!p) {
    return `${sections}\n`;
  }
  return `${p}\n\n${sections}\n`;
}

/**
 * True when the entry still needs harness-repair triage before push: no addressed line, or parent SHA still `pending`.
 */
export function isFrictionEntryOpenForHarnessGate(body: string): boolean {
  const addressed = extractWorkflowFrictionBullet(body, HARNESS_REPAIR_BULLET_ADDRESSED);
  if (!addressed) return true;
  const parent = extractWorkflowFrictionBullet(body, HARNESS_REPAIR_BULLET_PARENT_SHA);
  if (parent != null && parent.trim().toLowerCase() === 'pending') return true;
  return false;
}

export async function readFullWorkflowFrictionLog(projectRoot?: string): Promise<string> {
  try {
    return await readFile(getWorkflowFrictionLogPath(projectRoot ?? PROJECT_ROOT), 'utf8');
  } catch {
    return '';
  }
}

export async function hasOpenWorkflowFrictionEntries(projectRoot?: string): Promise<boolean> {
  const raw = await readFullWorkflowFrictionLog(projectRoot);
  if (!raw.trim()) return false;
  const { entries } = splitWorkflowFrictionLogFile(raw);
  const filtered = filterWorkflowFrictionEntriesForHarness(entries);
  return filtered.some((e) => isFrictionEntryOpenForHarnessGate(e.body));
}

export function buildFrictionClusterKey(entry: ParsedWorkflowFrictionEntry): string {
  const rc =
    entry.reasonCodeNormalized?.trim() ??
    parseReasonCode(entry.reasonCodeRaw ?? 'unknown').trim();
  const symptomLine = extractWorkflowFrictionBullet(entry.body, 'Symptom') ?? '';
  const snip = normalizeFrictionSymptomSnippet(symptomLine);
  return `${rc}::${snip}`;
}

function normalizeFrictionSymptomSnippet(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}

export interface FrictionRecurrenceCluster {
  clusterKey: string;
  openCount: number;
  /** Entries that have a harnessRepairAddressed line (includes pending parent SHA). */
  addressedHistoricalCount: number;
  /** Entries with addressed line and parent SHA not `pending`. */
  addressedClosedCount: number;
  headings: string[];
}

export function analyzeFrictionRecurrenceClusters(
  entries: ParsedWorkflowFrictionEntry[]
): FrictionRecurrenceCluster[] {
  const map = new Map<string, FrictionRecurrenceCluster>();
  for (const e of entries) {
    const key = buildFrictionClusterKey(e);
    const open = isFrictionEntryOpenForHarnessGate(e.body);
    const hasAddressedLine =
      extractWorkflowFrictionBullet(e.body, HARNESS_REPAIR_BULLET_ADDRESSED) != null;
    const closed = hasAddressedLine && !open;
    let c = map.get(key);
    if (!c) {
      c = {
        clusterKey: key,
        openCount: 0,
        addressedHistoricalCount: 0,
        addressedClosedCount: 0,
        headings: [],
      };
      map.set(key, c);
    }
    c.headings.push(e.heading);
    if (open) c.openCount++;
    if (hasAddressedLine) c.addressedHistoricalCount++;
    if (closed) c.addressedClosedCount++;
  }
  return [...map.values()];
}

export interface HarnessRepairAddressedBlockInput {
  isoTime: string;
  note: string;
  parentRepoCommit: string;
  cursorSubmoduleCommit: string;
}

export function formatHarnessRepairAddressedBlock(input: HarnessRepairAddressedBlockInput): string {
  return [
    '',
    `- **${HARNESS_REPAIR_BULLET_ADDRESSED}:** ${input.isoTime}`,
    `- **${HARNESS_REPAIR_BULLET_NOTE}:** ${input.note}`,
    `- **${HARNESS_REPAIR_BULLET_PARENT_SHA}:** ${input.parentRepoCommit}`,
    `- **${HARNESS_REPAIR_BULLET_SUB_SHA}:** ${input.cursorSubmoduleCommit}`,
  ].join('\n');
}

/**
 * Append the addressed block to one section raw (`###` through body). Idempotent if already present.
 */
export function appendAddressedBlockToSectionRaw(
  sectionRaw: string,
  blockMarkdown: string
): string {
  if (sectionRaw.includes(`**${HARNESS_REPAIR_BULLET_ADDRESSED}:**`)) {
    return sectionRaw;
  }
  return `${sectionRaw.trimEnd()}${blockMarkdown}\n`;
}

/**
 * Policy A step (4): replace `parentRepoCommit: pending` with the real parent SHA (multiline-safe).
 */
export function stampPendingParentRepoCommitsInMarkdown(full: string, parentSha: string): string {
  return full.replace(
    /^-\s*\*\*parentRepoCommit:\*\*\s*pending\s*$/gim,
    `- **parentRepoCommit:** ${parentSha.trim()}`
  );
}

/**
 * Apply addressed blocks to entries whose `heading` is in `targetHeadings`.
 */
export function applyHarnessRepairBlocksToEntries(
  preamble: string,
  entries: ParsedWorkflowFrictionEntry[],
  targetHeadings: Set<string>,
  blockMarkdown: string
): string {
  const next = entries.map((e) => {
    if (!targetHeadings.has(e.heading)) return e;
    const newRaw = appendAddressedBlockToSectionRaw(e.raw, blockMarkdown);
    if (newRaw === e.raw) return e;
    const nl = newRaw.indexOf('\n');
    const headingLine = nl === -1 ? newRaw.slice(4).trim() : newRaw.slice(4, nl).trim();
    const body = nl === -1 ? '' : newRaw.slice(nl + 1).trim();
    return {
      ...e,
      heading: headingLine,
      body,
      raw: newRaw,
    };
  });
  return joinWorkflowFrictionLogFile(preamble, next);
}

export function buildSuggestedNextHarnessActionsMarkdown(params: {
  clusters: FrictionRecurrenceCluster[];
  workProfileSummary?: string;
}): string {
  const lines: string[] = ['## Suggested next harness actions / next tier work', ''];
  const recurring = params.clusters.filter(
    (c) => c.addressedClosedCount >= 2 && c.openCount >= 1
  );
  if (recurring.length > 0) {
    lines.push('### Recurring friction (addressed before, open again)');
    for (const c of recurring) {
      lines.push(
        `- **${c.clusterKey}** — open: ${c.openCount}, previously closed: ${c.addressedClosedCount}. Consider a durable harness or doc fix (tier-add follow-up, playbook update, or reason-code routing).`
      );
    }
    lines.push('');
  }
  const noisy = params.clusters.filter((c) => c.openCount >= 2);
  if (noisy.length > 0) {
    lines.push('### Clusters with multiple open entries');
    for (const c of noisy) {
      lines.push(`- **${c.clusterKey}** — ${c.openCount} open entries. Triage together before pushing.`);
    }
    lines.push('');
  }
  if (recurring.length === 0 && noisy.length === 0) {
    lines.push(
      '- No high-signal recurrence clusters detected. Follow the governance contract and work profile below if friction reason codes map to a gated command (re-run tier-end, `/accepted-plan`, `/audit-fix`, etc.).'
    );
    lines.push('');
  }
  if (params.workProfileSummary?.trim()) {
    lines.push('### Work profile (harness repair context)');
    lines.push(params.workProfileSummary.trim());
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

/** Appended to session-end `nextAction` when open friction exists (plan-only gate before `/accepted-push`). */
export function formatHarnessRepairPendingPushReminder(params: {
  featureId: string;
  sessionId: string;
  featureDirectoryName: string;
}): string {
  return [
    '',
    '**Workflow friction (open entries):** Before **`/accepted-push`**, run **`/harness-repair`** in **plan** mode for this scope (review recurrence + next tier work). Run **`/harness-repair` execute** only when marking entries addressed. Then **`/accepted-push`**.',
    `- Params: \`featureId\` = \`${params.featureId}\`, \`tier\` = \`session\`, \`sessionId\` = \`${params.sessionId}\` (feature directory: \`${params.featureDirectoryName}\`).`,
  ].join('\n');
}

export interface ReadWorkflowFrictionOptions {
  last?: number;
  grep?: string;
  /** Normalized reason code (charter), e.g. `audit_failed` — matched after parseReasonCode on stored value for resilience */
  reason?: string;
}

export async function readWorkflowFrictionEntries(
  options: ReadWorkflowFrictionOptions = {}
): Promise<ParsedWorkflowFrictionEntry[]> {
  let content = '';
  try {
    content = await readFile(getWorkflowFrictionLogPath(), 'utf8');
  } catch {
    return [];
  }
  let entries = parseWorkflowFrictionLog(content);
  if (options.grep?.trim()) {
    const g = options.grep.trim().toLowerCase();
    entries = entries.filter(e => e.raw.toLowerCase().includes(g));
  }
  if (options.reason?.trim()) {
    const want = parseReasonCode(options.reason.trim());
    entries = entries.filter(e => {
      const stored = e.reasonCodeNormalized?.trim();
      if (!stored) return false;
      return parseReasonCode(stored) === want;
    });
  }
  if (options.last != null && options.last > 0) {
    entries = entries.slice(-options.last);
  }
  return entries;
}

interface CliOptions extends ReadWorkflowFrictionOptions {
  json: boolean;
}

function parseCli(argv: string[]): CliOptions {
  const opts: CliOptions = { json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--last') {
      const n = argv[++i];
      if (n != null) opts.last = Math.max(0, parseInt(n, 10) || 0);
    } else if (a === '--grep') {
      const v = argv[++i];
      if (v != null) opts.grep = v;
    } else if (a === '--reason') {
      const v = argv[++i];
      if (v != null) opts.reason = v;
    }
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseCli(process.argv);
  const entries = await readWorkflowFrictionEntries({
    last: opts.last,
    grep: opts.grep,
    reason: opts.reason,
  });
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
    return;
  }
  if (entries.length === 0) {
    process.stdout.write('(no matching workflow friction entries)\n');
    return;
  }
  process.stdout.write(entries.map(e => e.raw).join('\n\n---\n\n'));
  process.stdout.write('\n');
}

const isMainModule =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
