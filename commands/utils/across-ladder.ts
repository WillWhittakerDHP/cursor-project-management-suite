/**
 * Across ladder: machine-readable manifest + optional handoff snippet for tier cascades.
 * Derived from phase guides on disk and session guides; refreshed on tier starts/ends.
 */

import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { WorkflowCommandContext } from './command-context';
import { PROJECT_ROOT } from './utils';
import {
  extractSessionIdsFromPhaseGuide,
  getNextPhaseInFeature,
  getPhaseFromSessionId,
  getPhaseIdsFromDisk,
  getPrevPhaseInFeature,
} from './phase-session-utils';

const MANIFEST_FILENAME = 'across-ladder.json';

const MARKER_START = '<!-- harness-across-ladder:start -->';
const MARKER_END = '<!-- harness-across-ladder:end -->';

export type AcrossLadderSourceTier =
  | 'feature'
  | 'phase'
  | 'session'
  | 'phase_end'
  | 'session_end';

export interface AcrossLadderManifest {
  schemaVersion: 1;
  feature: string;
  derivedAt: string;
  sourceTier: AcrossLadderSourceTier;
  phasesOnDisk: string[];
  phaseAcrossTotal: number;
  focusPhaseId: string | null;
  nextPhaseAcross: string | null;
  prevPhaseId: string | null;
  sessionsByPhase: Record<string, string[]>;
  focusSessionId: string | null;
  sessionAcrossTotal: number | null;
  sessionIndex0Based: number | null;
  nextSessionAcross: string | null;
  taskAcrossTotal: number | null;
  nextTaskAcross: string | null;
}

export function compareDottedTierIds(a: string, b: string): number {
  const ap = a.split('.').map((n) => parseInt(n, 10) || 0);
  const bp = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(ap.length, bp.length);
  for (let i = 0; i < len; i++) {
    const dv = (ap[i] ?? 0) - (bp[i] ?? 0);
    if (dv !== 0) return dv;
  }
  return 0;
}

function extractTaskIdsForSession(guide: string, sessionId: string): string[] {
  const esc = sessionId.replace(/\./g, '\\.');
  const re = new RegExp(`Task\\s+(${esc}\\.\\d+):`, 'g');
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(guide)) !== null) {
    ids.push(m[1]);
  }
  return [...new Set(ids)].sort(compareDottedTierIds);
}

function manifestPathForFeature(feature: string): string {
  return join(PROJECT_ROOT, '.project-manager', 'features', feature, MANIFEST_FILENAME);
}

function formatHandoffMarkdown(m: AcrossLadderManifest): string {
  const lines: string[] = [
    '## Across ladder (harness)',
    '',
    `_Auto-updated from disk guides. Agents: prefer \`${MANIFEST_FILENAME}\` for checks._`,
    '',
    `- **Feature:** \`${m.feature}\` · **Source:** ${m.sourceTier} · **Derived:** ${m.derivedAt}`,
    `- **Phases on disk (${m.phaseAcrossTotal}):** ${m.phasesOnDisk.length ? m.phasesOnDisk.join(', ') : '_(none)_'}`,
  ];
  if (m.focusPhaseId) {
    lines.push(`- **Focus phase:** \`${m.focusPhaseId}\` · **Next phase across:** ${m.nextPhaseAcross ? `\`${m.nextPhaseAcross}\` → \`/phase-start ${m.nextPhaseAcross}\`` : '_(none — after phase-end use /feature-end if last)_'}`);
  } else {
    lines.push(`- **Next phase across:** ${m.nextPhaseAcross ? `\`${m.nextPhaseAcross}\` → \`/phase-start ${m.nextPhaseAcross}\`` : '_(add phase-*-guide.md or complete feature)_'}`);
  }
  if (m.focusSessionId) {
    const sessTotal = m.sessionAcrossTotal ?? 0;
    const idx = m.sessionIndex0Based != null ? m.sessionIndex0Based + 1 : '?';
    lines.push(
      `- **Focus session:** \`${m.focusSessionId}\` · **Session ${idx}/${sessTotal} in phase** · **Next session across:** ${m.nextSessionAcross ? `\`${m.nextSessionAcross}\` → \`/session-start ${m.nextSessionAcross}\`` : '_(then /phase-end)_'}`
    );
    if (m.taskAcrossTotal != null) {
      lines.push(`- **Tasks in session (detected):** ${m.taskAcrossTotal} · **Next task across:** ${m.nextTaskAcross ? `\`${m.nextTaskAcross}\` → \`/task-start\` / cascade` : '_(session tasks complete)_'}`);
    }
  }
  lines.push(`- **Manifest:** \`.project-manager/features/${m.feature}/${MANIFEST_FILENAME}\``);
  return lines.join('\n');
}

function injectAcrossLadderBlock(content: string, block: string): string {
  const wrapped = `${MARKER_START}\n${block}\n${MARKER_END}`;
  if (content.includes(MARKER_START) && content.includes(MARKER_END)) {
    return content.replace(
      new RegExp(`${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}`, 'm'),
      wrapped
    );
  }
  const excerptMatch = content.match(/<!--\s*end excerpt[\s\w-]*\s*-->/i);
  if (excerptMatch && excerptMatch.index != null) {
    const i = excerptMatch.index;
    return `${content.slice(0, i).trimEnd()}\n\n${wrapped}\n\n${content.slice(i)}`;
  }
  return `${content.trimEnd()}\n\n${wrapped}\n`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface AcrossLadderRefreshParams {
  tier: AcrossLadderSourceTier;
  phaseId?: string;
  sessionId?: string;
}

async function loadSessionsByPhaseMap(
  feature: string,
  phaseIds: string[]
): Promise<Record<string, string[]>> {
  const ctx = new WorkflowCommandContext(feature);
  const out: Record<string, string[]> = {};
  for (const pid of phaseIds) {
    try {
      const guide = await ctx.readPhaseGuide(pid);
      const raw = extractSessionIdsFromPhaseGuide(guide);
      if (raw.length > 0) {
        out[pid] = [...new Set(raw)].sort(compareDottedTierIds);
      }
    } catch {
      /* phase guide may be missing */
    }
  }
  return out;
}

/**
 * Build manifest from disk + optional focus tier.
 */
export async function buildAcrossLadderManifest(
  feature: string,
  params: AcrossLadderRefreshParams
): Promise<AcrossLadderManifest> {
  const phasesOnDisk = await getPhaseIdsFromDisk(feature);
  const sessionsByPhase = await loadSessionsByPhaseMap(feature, phasesOnDisk);

  let focusPhaseId: string | null = null;
  let focusSessionId: string | null = null;

  if (params.sessionId) {
    focusSessionId = params.sessionId;
    focusPhaseId = getPhaseFromSessionId(params.sessionId);
  } else if (params.phaseId) {
    focusPhaseId = params.phaseId;
  }

  const nextPhaseAcross = focusPhaseId
    ? await getNextPhaseInFeature(feature, focusPhaseId)
    : phasesOnDisk[0] ?? null;

  const prevPhaseId = focusPhaseId ? await getPrevPhaseInFeature(feature, focusPhaseId) : null;

  let sessionAcrossTotal: number | null = null;
  let sessionIndex0Based: number | null = null;
  let nextSessionAcross: string | null = null;
  let taskAcrossTotal: number | null = null;
  let nextTaskAcross: string | null = null;

  if (focusSessionId && focusPhaseId) {
    const sessions = sessionsByPhase[focusPhaseId] ?? [];
    sessionAcrossTotal = sessions.length;
    const idx = sessions.indexOf(focusSessionId);
    sessionIndex0Based = idx >= 0 ? idx : null;
    if (idx >= 0 && idx < sessions.length - 1) {
      nextSessionAcross = sessions[idx + 1];
    }
    try {
      const ctx = new WorkflowCommandContext(feature);
      const sessionGuide = await ctx.readSessionGuide(focusSessionId);
      const taskIds = extractTaskIdsForSession(sessionGuide, focusSessionId);
      taskAcrossTotal = taskIds.length;
      const firstOpen = sessionGuide.match(
        new RegExp(`-\\s*\\[\\s\\][^\\n]*Task\\s+(${focusSessionId.replace(/\./g, '\\.')}\\.\\d+)`, 'i')
      );
      nextTaskAcross = firstOpen?.[1] ?? (taskIds.length ? taskIds[0] : null);
    } catch {
      /* session guide missing */
    }
  }

  return {
    schemaVersion: 1,
    feature,
    derivedAt: new Date().toISOString(),
    sourceTier: params.tier,
    phasesOnDisk,
    phaseAcrossTotal: phasesOnDisk.length,
    focusPhaseId,
    nextPhaseAcross,
    prevPhaseId,
    sessionsByPhase,
    focusSessionId,
    sessionAcrossTotal,
    sessionIndex0Based,
    nextSessionAcross,
    taskAcrossTotal,
    nextTaskAcross,
  };
}

/**
 * Write JSON manifest and merge Across ladder block into the handoff for this tier (best effort).
 */
export async function refreshAcrossLadderArtifacts(
  context: WorkflowCommandContext,
  params: AcrossLadderRefreshParams
): Promise<{ summary: string; manifestPath: string; manifest: AcrossLadderManifest }> {
  const feature = context.feature.name;
  const manifest = await buildAcrossLadderManifest(feature, params);
  const path = manifestPathForFeature(feature);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const md = formatHandoffMarkdown(manifest);

  async function tryHandoff(
    tier: 'feature' | 'phase' | 'session',
    id: string | undefined,
    label: string
  ): Promise<void> {
    try {
      await context.documents.updateHandoff(tier, id, (c) => injectAcrossLadderBlock(c, md));
    } catch (err) {
      console.warn(
        `[across-ladder] handoff inject skipped (${label}):`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  if (params.tier === 'feature') {
    await tryHandoff('feature', undefined, 'feature');
  }
  if (params.tier === 'phase' && params.phaseId) {
    await tryHandoff('phase', params.phaseId, `phase ${params.phaseId}`);
  }
  if (params.tier === 'session' && params.sessionId) {
    await tryHandoff('session', params.sessionId, `session ${params.sessionId}`);
  }
  if (params.tier === 'phase_end' && params.phaseId) {
    await tryHandoff('feature', undefined, 'feature after phase-end');
    await tryHandoff('phase', params.phaseId, `phase ${params.phaseId} after phase-end`);
  }
  if (params.tier === 'session_end' && params.sessionId) {
    const phaseId = getPhaseFromSessionId(params.sessionId);
    await tryHandoff('feature', undefined, 'feature after session-end');
    if (phaseId) await tryHandoff('phase', phaseId, `phase ${phaseId} after session-end`);
    await tryHandoff('session', params.sessionId, `session ${params.sessionId} after session-end`);
  }

  const summary = [
    '### Across ladder (harness)',
    `Wrote **${MANIFEST_FILENAME}** for feature \`${feature}\` (${params.tier}).`,
    `- Phases on disk: **${manifest.phaseAcrossTotal}**${manifest.nextPhaseAcross ? ` · next phase across: \`${manifest.nextPhaseAcross}\`` : ''}`,
    manifest.focusSessionId
      ? `- Session **${manifest.focusSessionId}**${manifest.nextSessionAcross ? ` · next session across: \`${manifest.nextSessionAcross}\`` : ''}`
      : null,
    `Agents: read \`.project-manager/features/${feature}/${MANIFEST_FILENAME}\` before suggesting cascade commands.`,
  ]
    .filter(Boolean)
    .join('\n');

  return { summary, manifestPath: path, manifest };
}
