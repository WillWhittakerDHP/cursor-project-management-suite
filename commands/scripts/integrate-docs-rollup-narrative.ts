/**
 * One-off: integrate child workflow docs into parent real sections, archive sources, remove from active paths.
 * Skips `.project-manager/features/appointment-workflow`.
 *
 * Handoffs:
 * - If parent has ## Current Status / ## Next Action / ## Transition Context (harness-style), merge child excerpts there.
 * - Else append ## Session records (integrated) or ## Phase records (integrated) with full child bodies under ###.
 * Logs: append under ## Completed Tasks if present, else ## Session logs (integrated).
 *
 * Archives moved files to: `.project-manager/features/<feature>/rollup-archive/integrated-<timestamp>/...`
 *
 * Usage (repo root):
 *   npx tsx .cursor/commands/scripts/integrate-docs-rollup-narrative.ts
 *   npx tsx ... --dry-run
 *   npx tsx ... --only-task-handoffs   # merge task→session only (idempotent re-run safe for other steps)
 *   npx tsx ... --session-guides       # after other steps: merge session guides/summaries/artifacts into phase or feature guides
 *   npx tsx ... --only-session-guides  # only that merge (skips handoffs/logs/planning steps)
 */

import { access, constants, mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { basename, dirname, join, relative } from 'path';
import { MarkdownUtils } from '../utils/markdown-utils';
import { PROJECT_ROOT } from '../utils/utils';
import { compareDottedTierIds } from '../utils/across-ladder';

const FEATURES = join(PROJECT_ROOT, '.project-manager/features');
const SKIP_FEATURE = 'appointment-workflow';

const dryRun = process.argv.includes('--dry-run');
const onlyTaskHandoffs = process.argv.includes('--only-task-handoffs');
const sessionGuidesRollup = process.argv.includes('--session-guides');
const onlySessionGuides = process.argv.includes('--only-session-guides');

async function pathExists(abs: string): Promise<boolean> {
  try {
    await access(abs, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function sessionIdFromFilename(name: string, kind: 'handoff' | 'log'): string | null {
  const re =
    kind === 'handoff'
      ? /^session-(\d+\.\d+\.\d+)-handoff\.md$/
      : /^session-(\d+\.\d+\.\d+)-log\.md$/;
  const m = name.match(re);
  return m ? m[1] : null;
}

function phaseIdFromSessionId(sid: string): string {
  const p = sid.split('.');
  return p.length >= 2 ? `${p[0]}.${p[1]}` : sid;
}

function extractAtDepth(content: string, title: string): string {
  const block = MarkdownUtils.extractSection(content, title, { depth: 2 });
  if (!block.trim()) return '';
  const lines = block.split('\n');
  if (lines[0]?.trim().startsWith('#')) lines.shift();
  return lines.join('\n').trim();
}

function hasHarnessHandoffShape(content: string): boolean {
  return (
    content.includes('## Current Status') &&
    content.includes('## Next Action') &&
    content.includes('## Transition Context')
  );
}

/** Remove manual "Rolled-up task handoffs" block before Related Documents. */
function stripManualTaskRollupAppendix(content: string): string {
  const start = content.indexOf('\n## Rolled-up task handoffs');
  if (start === -1) return content;
  const rel = content.indexOf('\n## Related Documents', start);
  if (rel === -1) {
    return content.slice(0, start).trimEnd() + '\n';
  }
  return (content.slice(0, start) + content.slice(rel)).replace(/\n{3,}/g, '\n\n');
}

function insertBeforeSection(content: string, sectionTitle: string, addition: string): string {
  const marker = `## ${sectionTitle}`;
  const idx = content.indexOf(marker);
  if (idx === -1) return content;
  const after = idx + marker.length;
  const rest = content.slice(after);
  const next = rest.search(/\n## /);
  const bodyEnd = next === -1 ? content.length : after + next;
  const before = content.slice(0, bodyEnd).trimEnd();
  const tail = content.slice(bodyEnd);
  return `${before}\n\n${addition.trim()}\n${tail.startsWith('\n') ? '' : '\n'}${tail}`;
}

/** Prefer inserting before harness across-ladder block so we do not split Transition Context / excerpt markers. */
function insertBeforeAcrossLadderComment(content: string, addition: string): string {
  const anchor = '<!-- harness-across-ladder:start -->';
  const idx = content.indexOf(anchor);
  if (idx === -1) return insertBeforeSection(content, 'Transition Context', addition);
  return `${content.slice(0, idx).trimEnd()}\n\n${addition.trim()}\n\n${content.slice(idx)}`;
}

function appendUnderH2(parent: string, headingLine: string, block: string): string {
  const start = parent.indexOf(headingLine);
  if (start === -1) return parent;
  const afterHead = start + headingLine.length;
  const rest = parent.slice(afterHead);
  const nextH2 = rest.search(/\n## /);
  const end = nextH2 === -1 ? parent.length : afterHead + nextH2;
  return `${parent.slice(0, end).trimEnd()}\n\n${block.trim()}\n${parent.slice(end)}`;
}

/** Append under ## `sectionTitle` (creates section if missing). */
function appendIntegratedSection(
  parent: string,
  sectionTitle: string,
  childLabel: string,
  childBody: string
): string {
  const block = `### ${childLabel}\n\n${childBody.trim()}\n`;
  const sectionHeading = `## ${sectionTitle}`;
  if (!parent.includes(sectionHeading)) {
    return `${parent.trimEnd()}\n\n---\n\n${sectionHeading}\n\n${block}\n`;
  }
  return appendUnderH2(parent, sectionHeading, block);
}

async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

async function archiveFile(
  featureAbs: string,
  ts: string,
  relFromFeature: string,
  fromAbs: string
): Promise<void> {
  const destDir = join(featureAbs, 'rollup-archive', `integrated-${ts}`, dirname(relFromFeature));
  await ensureDir(destDir);
  const dest = join(featureAbs, 'rollup-archive', `integrated-${ts}`, relFromFeature);
  if (dryRun) {
    console.log(`[dry-run] archive: ${relative(PROJECT_ROOT, fromAbs)} -> ${relative(PROJECT_ROOT, dest)}`);
    return;
  }
  await rename(fromAbs, dest);
}

async function deletePath(abs: string): Promise<void> {
  if (dryRun) {
    console.log(`[dry-run] delete: ${relative(PROJECT_ROOT, abs)}`);
    return;
  }
  await rm(abs, { force: true });
}

/** Merge archived task handoffs into session handoff real sections; remove task files from manual-rollup-archive. */
async function listTaskHandoffsForSession(
  featureAbs: string,
  sid: string
): Promise<Array<{ abs: string; name: string; source: 'manual' | 'sessions' }>> {
  const out: Array<{ abs: string; name: string; source: 'manual' | 'sessions' }> = [];
  const esc = sid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^task-${esc}\\.\\d+-handoff\\.md$`);
  const sessionsDir = join(featureAbs, 'sessions');
  try {
    for (const f of await readdir(sessionsDir)) {
      if (re.test(f)) out.push({ abs: join(sessionsDir, f), name: f, source: 'sessions' });
    }
  } catch {
    /* noop */
  }
  const manualDir = join(featureAbs, 'manual-rollup-archive', 'sessions', sid);
  try {
    for (const f of await readdir(manualDir)) {
      if (f.endsWith('-handoff.md')) out.push({ abs: join(manualDir, f), name: f, source: 'manual' });
    }
  } catch {
    /* noop */
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

async function integrateArchivedTasksIntoSessionHandoffs(
  featureName: string,
  featureAbs: string,
  ts: string
): Promise<void> {
  const sessionsDir = join(featureAbs, 'sessions');
  let sessionIds = new Set<string>();
  try {
    for (const f of await readdir(sessionsDir)) {
      const m = f.match(/^session-(\d+\.\d+\.\d+)-handoff\.md$/);
      if (m) sessionIds.add(m[1]!);
    }
  } catch {
    return;
  }
  try {
    const manualRoot = join(featureAbs, 'manual-rollup-archive', 'sessions');
    for (const d of await readdir(manualRoot, { withFileTypes: true })) {
      if (d.isDirectory()) sessionIds.add(d.name);
    }
  } catch {
    /* noop */
  }

  for (const sid of [...sessionIds].sort(compareDottedTierIds)) {
    const taskFiles = await listTaskHandoffsForSession(featureAbs, sid);
    if (taskFiles.length === 0) continue;
    const sessionHandoff = join(featureAbs, 'sessions', `session-${sid}-handoff.md`);
    let parent: string;
    try {
      parent = await readFile(sessionHandoff, 'utf8');
    } catch {
      continue;
    }
    let next = stripManualTaskRollupAppendix(parent);
    if (!hasHarnessHandoffShape(next)) {
      let combined = '';
      for (const { abs, name } of taskFiles) {
        const body = await readFile(abs, 'utf8');
        const tid = name.match(/^task-([\d.]+)-handoff\.md$/)?.[1] ?? name;
        combined += `### Task ${tid}\n\n${body.trim()}\n\n`;
      }
      next = appendIntegratedSection(next, 'Session records (integrated)', `Tasks (${sid})`, combined);
    } else {
      const chunks: string[] = [];
      for (const { abs, name } of taskFiles) {
        const body = await readFile(abs, 'utf8');
        const tid = name.match(/^task-([\d.]+)-handoff\.md$/)?.[1] ?? name;
        const cs = extractAtDepth(body, 'Current Status');
        const tr = extractAtDepth(body, 'Transition Context');
        const na = extractAtDepth(body, 'Next Action');
        const hasHarnessTask = Boolean(cs || tr || na);
        if (hasHarnessTask) {
          chunks.push(
            [
              `#### Task ${tid}`,
              '',
              na ? `**Next action (from task):** ${na}` : '',
              '',
              cs ? `**Current status (from task):** ${cs}` : '',
              '',
              tr ? `**Transition (from task):** ${tr}` : '',
              '',
            ]
              .filter(Boolean)
              .join('\n')
          );
        } else {
          chunks.push(`#### Task ${tid}\n\n${body.trim()}\n`);
        }
        if (cs)
          next = insertBeforeSection(next, 'Current Status', `#### Task ${tid}\n\n${cs}\n`);
      }
      if (chunks.length) next = insertBeforeAcrossLadderComment(next, chunks.join('\n'));
    }
    if (next !== parent) {
      console.log(`[write] ${featureName} session-${sid}-handoff.md (integrate ${taskFiles.length} task handoffs)`);
      if (!dryRun) await writeFile(sessionHandoff, next, 'utf8');
    }
    for (const { abs, source } of taskFiles) {
      if (source === 'manual') {
        await deletePath(abs);
      } else {
        await archiveFile(featureAbs, ts, relative(featureAbs, abs), abs);
      }
    }
    const manualDir = join(featureAbs, 'manual-rollup-archive', 'sessions', sid);
    try {
      const left = await readdir(manualDir);
      if (left.length === 0 && !dryRun) {
        await rm(manualDir, { recursive: true, force: true }).catch(() => {});
      }
    } catch {
      /* noop */
    }
  }
}

async function integrateSessionsIntoPhaseHandoffs(featureName: string, featureAbs: string, ts: string): Promise<void> {
  const sessionsDir = join(featureAbs, 'sessions');
  let files: string[] = [];
  try {
    files = await readdir(sessionsDir);
  } catch {
    return;
  }
  const sessionHandoffs = files
    .map(f => ({ f, sid: sessionIdFromFilename(f, 'handoff') }))
    .filter((x): x is { f: string; sid: string } => x.sid != null);

  const byPhase = new Map<string, { sid: string; f: string }[]>();
  for (const { f, sid } of sessionHandoffs) {
    const pid = phaseIdFromSessionId(sid);
    if (!byPhase.has(pid)) byPhase.set(pid, []);
    byPhase.get(pid)!.push({ sid, f });
  }

  for (const [pid, list] of byPhase) {
    const phasePath = join(featureAbs, 'phases', `phase-${pid}-handoff.md`);
    let phaseContent: string;
    try {
      phaseContent = await readFile(phasePath, 'utf8');
    } catch {
      continue;
    }
    const sorted = [...list].sort((a, b) => compareDottedTierIds(a.sid, b.sid));
    let next = phaseContent;
    for (const { sid, f } of sorted) {
      const childPath = join(sessionsDir, f);
      const child = await readFile(childPath, 'utf8');
      const label = `Session ${sid}`;
      if (hasHarnessHandoffShape(next) && hasHarnessHandoffShape(child)) {
        const cs = extractAtDepth(child, 'Current Status');
        const tr = extractAtDepth(child, 'Transition Context');
        const chunk = [`#### ${label}`, '', cs || '', '', tr || '', ''].join('\n').trim();
        next = insertBeforeSection(next, 'Transition Context', chunk);
      } else {
        next = appendIntegratedSection(next, 'Session records (integrated)', label, child);
      }
    }
    if (next !== phaseContent) {
      console.log(`[write] ${featureName} phase-${pid}-handoff.md (+${sorted.length} sessions)`);
      if (!dryRun) await writeFile(phasePath, next, 'utf8');
      for (const { f } of sorted) {
        const from = join(sessionsDir, f);
        await archiveFile(featureAbs, ts, join('sessions', f), from);
      }
    }
  }
}

/**
 * When no `phase-X.Y-handoff.md` exists, merge remaining session handoffs into the feature handoff
 * under ## Integrated phase X.Y (session handoffs).
 */
async function integrateOrphanSessionHandoffsIntoFeature(
  featureName: string,
  featureAbs: string,
  ts: string
): Promise<void> {
  const featureHandoffPath = await resolveFeatureHandoffPath(featureAbs);
  if (!featureHandoffPath) return;
  const sessionsDir = join(featureAbs, 'sessions');
  let files: string[] = [];
  try {
    files = await readdir(sessionsDir);
  } catch {
    return;
  }
  const sessionHandoffs = files
    .map(f => ({ f, sid: sessionIdFromFilename(f, 'handoff') }))
    .filter((x): x is { f: string; sid: string } => x.sid != null);
  if (sessionHandoffs.length === 0) return;

  const byPhase = new Map<string, { sid: string; f: string }[]>();
  for (const { f, sid } of sessionHandoffs) {
    const pid = phaseIdFromSessionId(sid);
    if (!byPhase.has(pid)) byPhase.set(pid, []);
    byPhase.get(pid)!.push({ sid, f });
  }

  let parent = await readFile(featureHandoffPath, 'utf8');
  let next = parent;
  let anyWrite = false;

  for (const [pid, list] of [...byPhase.entries()].sort((a, b) => compareDottedTierIds(a[0], b[0]))) {
    const phasePath = join(featureAbs, 'phases', `phase-${pid}-handoff.md`);
    if (await pathExists(phasePath)) continue;

    const sorted = [...list].sort((a, b) => compareDottedTierIds(a.sid, b.sid));
    const sectionTitle = `Integrated phase ${pid} (session handoffs)`;
    const harnessChunks: string[] = [];
    for (const { sid, f } of sorted) {
      const child = await readFile(join(sessionsDir, f), 'utf8');
      const label = `Session ${sid}`;
      if (hasHarnessHandoffShape(next) && hasHarnessHandoffShape(child)) {
        const cs = extractAtDepth(child, 'Current Status');
        const tr = extractAtDepth(child, 'Transition Context');
        const chunk = [`#### ${label}`, '', cs || '', '', tr || '', ''].filter(Boolean).join('\n').trim();
        harnessChunks.push(chunk);
      } else {
        next = appendIntegratedSection(next, sectionTitle, label, child);
      }
    }
    if (harnessChunks.length) {
      next = insertBeforeAcrossLadderComment(next, harnessChunks.join('\n\n'));
    }
    for (const { f } of sorted) {
      await archiveFile(featureAbs, ts, join('sessions', f), join(sessionsDir, f));
    }
    anyWrite = true;
  }

  if (anyWrite && next !== parent) {
    console.log(`[write] ${featureName} ${basename(featureHandoffPath)} (orphan session handoffs → feature)`);
    if (!dryRun) await writeFile(featureHandoffPath, next, 'utf8');
  }
}

async function resolveFeatureHandoffPath(featureAbs: string): Promise<string | null> {
  let files: string[] = [];
  try {
    files = await readdir(featureAbs);
  } catch {
    return null;
  }
  const hits = files.filter(f => /^feature-.+-handoff\.md$/.test(f));
  return hits.length ? join(featureAbs, hits.sort()[0]!) : null;
}

async function resolveFeatureLogPath(featureAbs: string): Promise<string | null> {
  let files: string[] = [];
  try {
    files = await readdir(featureAbs);
  } catch {
    return null;
  }
  const hits = files.filter(f => /^feature-.+-log\.md$/.test(f));
  return hits.length ? join(featureAbs, hits.sort()[0]!) : null;
}

async function resolveFeaturePlanningPath(featureAbs: string): Promise<string | null> {
  let files: string[] = [];
  try {
    files = await readdir(featureAbs);
  } catch {
    return null;
  }
  const hits = files.filter(
    f => /^feature-.+-planning\.md$/.test(f) || f === 'feature-planning.md'
  );
  return hits.length ? join(featureAbs, hits.sort()[0]!) : null;
}

async function resolveFeatureGuidePath(featureAbs: string): Promise<string | null> {
  let files: string[] = [];
  try {
    files = await readdir(featureAbs);
  } catch {
    return null;
  }
  const hits = files.filter(
    f => /^feature-.+-guide\.md$/.test(f) || f === 'feature-guide.md'
  );
  return hits.length ? join(featureAbs, hits.sort()[0]!) : null;
}

function isExcludedFromSessionGuideRollup(filename: string): boolean {
  if (!filename.startsWith('session-') || !filename.endsWith('.md')) return true;
  if (/-handoff\.md$/.test(filename)) return true;
  if (/-log\.md$/.test(filename)) return true;
  if (/-planning\.md$/.test(filename)) return true;
  return false;
}

/**
 * Prefer phase-X.Y, then phase-{fullSid}, then phase-X (covers vue-style phase-6-guide for session 6.14.x).
 */
async function resolvePhaseGuidePath(featureAbs: string, sid: string): Promise<string | null> {
  const phasesDir = join(featureAbs, 'phases');
  const parts = sid.split('.');
  const pidTwo = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : sid;
  const pidOne = parts[0] ?? sid;
  const candidates = [
    join(phasesDir, `phase-${pidTwo}-guide.md`),
    join(phasesDir, `phase-${sid}-guide.md`),
    join(phasesDir, `phase-${pidOne}-guide.md`),
  ];
  for (const c of candidates) {
    if (await pathExists(c)) return c;
  }
  return null;
}

function defaultFeatureGuideStub(featureName: string): string {
  return `# ${featureName} — feature guide (integrated)\n\n_Session docs from \`sessions/\` merged during doc rollup._\n\n## Session docs (integrated)\n\n`;
}

/** Merge session-* guides, summaries, and other non-handoff/log/planning session markdown into phase or feature guides. */
async function integrateSessionGuideArtifacts(
  featureName: string,
  featureAbs: string,
  ts: string
): Promise<void> {
  const sessionsDir = join(featureAbs, 'sessions');
  let files: string[] = [];
  try {
    files = await readdir(sessionsDir);
  } catch {
    return;
  }
  const candidates = files.filter(f => !isExcludedFromSessionGuideRollup(f));
  if (candidates.length === 0) return;

  type Item = { f: string; sid: string | null };
  const items: Item[] = [];
  for (const f of candidates) {
    const m = f.match(/^session-([\d.]+)-/);
    items.push({ f, sid: m?.[1] ?? null });
  }

  const byParent = new Map<string, Item[]>();
  const defaultFeatureGuide = join(featureAbs, `feature-${featureName}-guide.md`);

  for (const item of items) {
    let parentPath: string;
    if (item.sid) {
      parentPath =
        (await resolvePhaseGuidePath(featureAbs, item.sid)) ??
        (await resolveFeatureGuidePath(featureAbs)) ??
        defaultFeatureGuide;
    } else {
      parentPath = (await resolveFeatureGuidePath(featureAbs)) ?? defaultFeatureGuide;
    }
    if (!byParent.has(parentPath)) byParent.set(parentPath, []);
    byParent.get(parentPath)!.push(item);
  }

  const integratedSectionTitle = 'Session docs (integrated)';

  for (const [parentPath, list] of [...byParent.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => {
      if (a.sid && b.sid) {
        const c = compareDottedTierIds(a.sid, b.sid);
        return c !== 0 ? c : a.f.localeCompare(b.f);
      }
      if (a.sid && !b.sid) return -1;
      if (!a.sid && b.sid) return 1;
      return a.f.localeCompare(b.f);
    });

    const existedBefore = await pathExists(parentPath);
    let parentContent: string;
    if (existedBefore) {
      parentContent = await readFile(parentPath, 'utf8');
    } else {
      parentContent = defaultFeatureGuideStub(featureName);
    }

    let next = parentContent;
    for (const { f } of list) {
      const body = await readFile(join(sessionsDir, f), 'utf8');
      const label = f.replace(/\.md$/, '');
      next = appendIntegratedSection(next, integratedSectionTitle, label, body);
    }

    if (next !== parentContent || !existedBefore) {
      const n = list.length;
      console.log(
        `[write] ${featureName} ${basename(parentPath)} (+${n} session doc${n === 1 ? '' : 's'}${existedBefore ? '' : ', new file'})`
      );
      if (!dryRun) {
        await ensureDir(dirname(parentPath));
        await writeFile(parentPath, next, 'utf8');
      }
      for (const { f } of list) {
        await archiveFile(featureAbs, ts, join('sessions', f), join(sessionsDir, f));
      }
    }
  }
}

async function integrateSessionPlanningsIntoFeaturePlanning(
  featureName: string,
  featureAbs: string,
  ts: string
): Promise<void> {
  const planPath = await resolveFeaturePlanningPath(featureAbs);
  if (!planPath) return;
  const sessionsDir = join(featureAbs, 'sessions');
  let files: string[] = [];
  try {
    files = await readdir(sessionsDir);
  } catch {
    return;
  }
  const sessionPlans = files
    .filter(f => /^session-\d+\.\d+\.\d+-planning\.md$/.test(f))
    .sort((a, b) => {
      const sa = a.match(/^session-([\d.]+)-planning\.md$/)?.[1] ?? '';
      const sb = b.match(/^session-([\d.]+)-planning\.md$/)?.[1] ?? '';
      return compareDottedTierIds(sa, sb);
    });
  if (sessionPlans.length === 0) return;

  let parent = await readFile(planPath, 'utf8');
  let next = parent;
  for (const f of sessionPlans) {
    const sid = f.match(/^session-([\d.]+)-planning\.md$/)?.[1];
    if (!sid) continue;
    const body = await readFile(join(sessionsDir, f), 'utf8');
    next = appendIntegratedSection(next, 'Integrated session planning', `Session ${sid}`, body);
  }
  if (next !== parent) {
    console.log(`[write] ${featureName} ${basename(planPath)} (+${sessionPlans.length} session plannings)`);
    if (!dryRun) await writeFile(planPath, next, 'utf8');
    for (const f of sessionPlans) {
      await archiveFile(featureAbs, ts, join('sessions', f), join(sessionsDir, f));
    }
  }
}

async function integratePhasesIntoFeatureHandoff(featureName: string, featureAbs: string, ts: string): Promise<void> {
  const featureHandoffPath = await resolveFeatureHandoffPath(featureAbs);
  if (!featureHandoffPath) return;
  let parent: string;
  try {
    parent = await readFile(featureHandoffPath, 'utf8');
  } catch {
    return;
  }
  const phasesDir = join(featureAbs, 'phases');
  let files: string[] = [];
  try {
    files = await readdir(phasesDir);
  } catch {
    return;
  }
  const phaseFiles = files
    .filter(f => /^phase-.+-handoff\.md$/.test(f))
    .sort((a, b) => {
      const pa = a.match(/^phase-(.+)-handoff\.md$/)?.[1] ?? '';
      const pb = b.match(/^phase-(.+)-handoff\.md$/)?.[1] ?? '';
      return compareDottedTierIds(pa, pb);
    });
  if (phaseFiles.length === 0) return;

  let next = parent;
  for (const f of phaseFiles) {
    const pid = f.match(/^phase-(.+)-handoff\.md$/)?.[1];
    if (!pid) continue;
    const childPath = join(phasesDir, f);
    const child = await readFile(childPath, 'utf8');
    const label = `Phase ${pid}`;
    if (hasHarnessHandoffShape(next) && hasHarnessHandoffShape(child)) {
      const cs = extractAtDepth(child, 'Current Status');
      const tr = extractAtDepth(child, 'Transition Context');
      const chunk = [`#### ${label}`, '', cs || '', '', tr || '', ''].join('\n').trim();
      next = insertBeforeSection(next, 'Transition Context', chunk);
    } else {
      next = appendIntegratedSection(next, 'Phase records (integrated)', label, child);
    }
  }
  if (next !== parent) {
    console.log(`[write] ${featureName} ${basename(featureHandoffPath)} (+${phaseFiles.length} phases)`);
    if (!dryRun) await writeFile(featureHandoffPath, next, 'utf8');
    for (const f of phaseFiles) {
      await archiveFile(featureAbs, ts, join('phases', f), join(phasesDir, f));
    }
  }
}

async function integrateSessionLogsIntoPhaseLogs(featureName: string, featureAbs: string, ts: string): Promise<void> {
  const sessionsDir = join(featureAbs, 'sessions');
  let sfiles: string[] = [];
  try {
    sfiles = await readdir(sessionsDir);
  } catch {
    return;
  }
  const sessionLogs = sfiles
    .map(f => ({ f, sid: sessionIdFromFilename(f, 'log') }))
    .filter((x): x is { f: string; sid: string } => x.sid != null);

  const byPhase = new Map<string, { sid: string; f: string }[]>();
  for (const { f, sid } of sessionLogs) {
    const pid = phaseIdFromSessionId(sid);
    if (!byPhase.has(pid)) byPhase.set(pid, []);
    byPhase.get(pid)!.push({ sid, f });
  }

  for (const [pid, list] of byPhase) {
    const phaseLogPath = join(featureAbs, 'phases', `phase-${pid}-log.md`);
    let phaseLog: string;
    let createdPhaseLog = false;
    try {
      phaseLog = await readFile(phaseLogPath, 'utf8');
    } catch {
      phaseLog = `# Phase ${pid} log (integrated)\n\n_Created during doc rollup — session logs merged below._\n\n## Session logs (integrated)\n\n`;
      createdPhaseLog = true;
    }
    const sorted = [...list].sort((a, b) => compareDottedTierIds(a.sid, b.sid));
    let next = phaseLog;
    const sessionLogH2 = '## Session logs (integrated)';
    for (const { sid, f } of sorted) {
      const child = await readFile(join(sessionsDir, f), 'utf8');
      const addition = `### Session ${sid} (integrated)\n\n${child.trim()}\n`;
      if (next.includes('## Completed Tasks')) {
        next = insertBeforeSection(next, 'Completed Tasks', addition) ?? next + '\n\n' + addition;
      } else if (next.includes(sessionLogH2)) {
        next = appendUnderH2(next, sessionLogH2, addition);
      } else {
        next = `${next.trimEnd()}\n\n${sessionLogH2}\n\n${addition}\n`;
      }
    }
    if (next !== phaseLog || createdPhaseLog) {
      console.log(
        `[write] ${featureName} phase-${pid}-log.md (+${sorted.length} session logs${createdPhaseLog ? ', new file' : ''})`
      );
      if (!dryRun) {
        await ensureDir(dirname(phaseLogPath));
        await writeFile(phaseLogPath, next, 'utf8');
      }
      for (const { f } of sorted) {
        await archiveFile(featureAbs, ts, join('sessions', f), join(sessionsDir, f));
      }
    }
  }
}

async function integratePhaseLogsIntoFeatureLog(featureName: string, featureAbs: string, ts: string): Promise<void> {
  const phasesDir = join(featureAbs, 'phases');
  let phaseDirFiles: string[] = [];
  try {
    phaseDirFiles = await readdir(phasesDir);
  } catch {
    return;
  }
  const phaseLogs = phaseDirFiles
    .filter(f => /^phase-.+-log\.md$/.test(f))
    .sort((a, b) => {
      const pa = a.match(/^phase-(.+)-log\.md$/)?.[1] ?? '';
      const pb = b.match(/^phase-(.+)-log\.md$/)?.[1] ?? '';
      return compareDottedTierIds(pa, pb);
    });
  if (phaseLogs.length === 0) return;

  let featureLogPath = await resolveFeatureLogPath(featureAbs);
  let parent: string;
  let createdFeatureLog = false;
  if (!featureLogPath) {
    featureLogPath = join(featureAbs, `feature-${featureName}-log.md`);
    parent = `# ${featureName} — feature log (integrated)\n\n_Phase logs rolled up._\n\n## Phase logs (integrated)\n\n`;
    createdFeatureLog = true;
  } else {
    try {
      parent = await readFile(featureLogPath, 'utf8');
    } catch {
      return;
    }
  }
  const phaseLogH2 = '## Phase logs (integrated)';
  let next = parent;
  for (const f of phaseLogs) {
    const pid = f.match(/^phase-(.+)-log\.md$/)?.[1];
    if (!pid) continue;
    const child = await readFile(join(phasesDir, f), 'utf8');
    const addition = `### Phase ${pid} (integrated)\n\n${child.trim()}\n`;
    if (next.includes('## Completed Tasks')) {
      next = insertBeforeSection(next, 'Completed Tasks', addition) ?? next + '\n\n' + addition;
    } else if (next.includes(phaseLogH2)) {
      next = appendUnderH2(next, phaseLogH2, addition);
    } else {
      next = `${next.trimEnd()}\n\n${phaseLogH2}\n\n${addition}\n`;
    }
  }
  if (next !== parent || createdFeatureLog) {
    console.log(
      `[write] ${featureName} ${basename(featureLogPath)} (+${phaseLogs.length} phase logs${createdFeatureLog ? ', new file' : ''})`
    );
    if (!dryRun) await writeFile(featureLogPath, next, 'utf8');
    for (const f of phaseLogs) {
      await archiveFile(featureAbs, ts, join('phases', f), join(phasesDir, f));
    }
  }
}

async function main(): Promise<void> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const entries = await readdir(FEATURES, { withFileTypes: true });
  const features = entries.filter(e => e.isDirectory() && e.name !== SKIP_FEATURE).map(e => e.name).sort();

  if (dryRun) console.log('DRY RUN — no writes or moves\n');

  for (const name of features) {
    const featureAbs = join(FEATURES, name);
    if (onlySessionGuides) {
      await integrateSessionGuideArtifacts(name, featureAbs, ts);
      continue;
    }
    await integrateArchivedTasksIntoSessionHandoffs(name, featureAbs, ts);
    if (onlyTaskHandoffs) continue;
    await integrateSessionsIntoPhaseHandoffs(name, featureAbs, ts);
    await integrateOrphanSessionHandoffsIntoFeature(name, featureAbs, ts);
    await integratePhasesIntoFeatureHandoff(name, featureAbs, ts);
    await integrateSessionLogsIntoPhaseLogs(name, featureAbs, ts);
    await integratePhaseLogsIntoFeatureLog(name, featureAbs, ts);
    await integrateSessionPlanningsIntoFeaturePlanning(name, featureAbs, ts);
    if (sessionGuidesRollup) {
      await integrateSessionGuideArtifacts(name, featureAbs, ts);
    }
  }

  console.log(dryRun ? '\nDry run done.' : '\nIntegrate rollup done.');
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
