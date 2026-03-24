/**
 * Parse and filter `.project-manager/WORKFLOW_FRICTION_LOG.md` (sections headed by `###`).
 * CLI: npx tsx .cursor/commands/utils/read-workflow-friction.ts [--last N] [--grep substring] [--reason normalizedCode] [--json]
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './utils';
import { parseReasonCode } from '../harness/reason-code';

const LOG_PATH = join(PROJECT_ROOT, '.project-manager', 'WORKFLOW_FRICTION_LOG.md');

export interface ParsedWorkflowFrictionEntry {
  /** First line without leading ### */
  heading: string;
  body: string;
  reasonCodeRaw?: string;
  reasonCodeNormalized?: string;
  isFailureReason?: boolean;
  raw: string;
}

function extractBullet(body: string, label: string): string | undefined {
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
    const reasonCodeRaw = extractBullet(body, 'reasonCodeRaw');
    const reasonCodeNormalized = extractBullet(body, 'reasonCodeNormalized');
    const isFailureStr = extractBullet(body, 'isFailureReason');
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
    content = await readFile(LOG_PATH, 'utf8');
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
