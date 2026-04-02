/**
 * Shared planned-vs-actual deliverables drift for deliverables_check and gap_analysis.
 * PATTERN: one canonical path for parsing + working-tree comparison; consumers choose rollup skip policy.
 */

import { parseDeliverablesFromPlanningDoc } from '../../utils/planning-doc-parse';
import { listWorkingTreeChangedRepoPaths } from '../../git/shared/git-manager';
import type { PlanningTier } from '../../utils/planning-doc-paths';
import type { GapAnalysisResult, TierEndWorkflowContext } from './tier-end-workflow-types';
import {
  buildGapOverbuildReviewPacket,
  extractPlanningExcerptForPacket,
  type GapOverbuildPacketInput,
} from './gap-llm-review';

export function pathMatchesRepoPath(a: string, p: string): boolean {
  return a === p || a.includes(p) || p.includes(a);
}

export type DeliverablesDriftOutcome =
  | { kind: 'rollup_marker' }
  | { kind: 'no_planned_paths' }
  | { kind: 'analyzed'; planned: string[]; scopeCreep: string[]; missed: string[] };

/**
 * Compare ## Deliverables paths in planning content to in-scope working tree changes.
 * When ignoreRollupMarker is false (default), skips analysis if doc already rolled up — deliverables_check idempotency.
 * When true, gap_analysis still runs drift after rollup (consolidated doc may still list deliverables).
 */
export async function analyzeDeliverablesDriftFromContent(
  content: string,
  opts?: { ignoreRollupMarker?: boolean }
): Promise<DeliverablesDriftOutcome> {
  if (!opts?.ignoreRollupMarker && content.includes('<!-- harness-planning-rollup')) {
    return { kind: 'rollup_marker' };
  }
  const planned = parseDeliverablesFromPlanningDoc(content);
  if (planned.length === 0) {
    return { kind: 'no_planned_paths' };
  }
  const actual = await listWorkingTreeChangedRepoPaths();
  const actualProduct = actual.filter(
    f =>
      f.startsWith('client/') ||
      f.startsWith('server/') ||
      f.startsWith('.project-manager/')
  );
  const scopeCreep = actualProduct.filter(a => !planned.some(p => pathMatchesRepoPath(a, p)));
  const missed = planned.filter(p => !actualProduct.some(a => pathMatchesRepoPath(a, p)));
  return { kind: 'analyzed', planned, scopeCreep, missed };
}

async function tryChangedFilesSample(): Promise<{
  paths: string[] | null;
  note?: string;
}> {
  try {
    const paths = await listWorkingTreeChangedRepoPaths();
    const product = paths.filter(
      f =>
        f.startsWith('client/') ||
        f.startsWith('server/') ||
        f.startsWith('.project-manager/')
    );
    return { paths: product };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[tier-end gap packet] listWorkingTreeChangedRepoPaths failed:', msg);
    return { paths: null, note: `Changed-file listing failed: ${msg}` };
  }
}

function driftSummaryForAnalyzed(drift: {
  planned: string[];
  scopeCreep: string[];
  missed: string[];
}): string {
  const parts: string[] = [
    `- **Planned paths (from doc):** ${drift.planned.length}`,
    `- **Unplanned product paths touched:** ${drift.scopeCreep.length}`,
    `- **Planned paths not seen in working tree (heuristic):** ${drift.missed.length}`,
  ];
  if (drift.scopeCreep.length > 0) {
    parts.push('', '**Unplanned:**', ...drift.scopeCreep.slice(0, 20).map(f => `- \`${f}\``));
    if (drift.scopeCreep.length > 20) {
      parts.push(`… +${drift.scopeCreep.length - 20} more`);
    }
  }
  if (drift.missed.length > 0) {
    parts.push('', '**Missed (heuristic):**', ...drift.missed.slice(0, 20).map(p => `- \`${p}\``));
    if (drift.missed.length > 20) {
      parts.push(`… +${drift.missed.length - 20} more`);
    }
  }
  if (drift.scopeCreep.length === 0 && drift.missed.length === 0) {
    parts.push('', '*No deliverables drift vs working tree under this heuristic.*');
  }
  return parts.join('\n');
}

/**
 * Default gap analysis from planning doc + drift heuristic (feature / phase / session / task).
 * Always returns a non-empty `report` (gap markdown when drift + packet, else packet only) when the hook runs.
 */
export async function runPlanningTierGapAnalysis(
  ctx: TierEndWorkflowContext,
  planningTier: PlanningTier
): Promise<GapAnalysisResult> {
  const planningId = planningTier === 'feature' ? '' : ctx.identifier;
  const featureName = ctx.context.feature.name;

  const basePacketInput = (
    partial: Omit<GapOverbuildPacketInput, 'planningTier' | 'identifier' | 'featureName'>
  ): GapOverbuildPacketInput => ({
    planningTier,
    identifier: ctx.identifier,
    featureName,
    ...partial,
  });

  try {
    const docExists = await ctx.context.documents.planningDocExists(planningTier, planningId);
    if (!docExists) {
      const changed = await tryChangedFilesSample();
      const packet = buildGapOverbuildReviewPacket(
        basePacketInput({
          planningDocRelativePath: null,
          driftSummaryBody:
            '*Planning doc not found for this tier — deliverables drift was not computed.*',
          planningExcerpt: null,
          planningExcerptNote: 'No planning doc on disk for this tier.',
          changedFilesSample: changed.paths,
          changedFilesNote: changed.note,
          dataQuality: 'partial',
          dataQualityNotes: ['Planning doc missing; drift and excerpt omitted.'],
        })
      );
      return { hasGaps: false, report: packet };
    }

    const planPath = ctx.context.documents.getPlanningDocRelativePath(planningTier, planningId);
    let content: string;
    try {
      content = await ctx.context.documents.readPlanningDoc(planningTier, planningId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[tier-end gap packet] readPlanningDoc failed:', msg);
      const changed = await tryChangedFilesSample();
      const packet = buildGapOverbuildReviewPacket(
        basePacketInput({
          planningDocRelativePath: planPath,
          driftSummaryBody: `*Could not read planning doc:* ${msg}`,
          planningExcerpt: null,
          planningExcerptNote: `Read failed: ${msg}`,
          changedFilesSample: changed.paths,
          changedFilesNote: changed.note,
          dataQuality: 'partial',
          dataQualityNotes: ['Planning doc read failed.'],
        })
      );
      return { hasGaps: false, report: packet };
    }

    let drift: DeliverablesDriftOutcome;
    try {
      drift = await analyzeDeliverablesDriftFromContent(content, { ignoreRollupMarker: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[tier-end gap packet] analyzeDeliverablesDriftFromContent failed:', msg);
      const ex = extractPlanningExcerptForPacket(content);
      const changed = await tryChangedFilesSample();
      const packet = buildGapOverbuildReviewPacket(
        basePacketInput({
          planningDocRelativePath: planPath,
          driftSummaryBody: `*Deliverables drift analysis failed:* ${msg}`,
          planningExcerpt: ex.excerpt,
          planningExcerptNote: ex.note,
          changedFilesSample: changed.paths,
          changedFilesNote: changed.note,
          dataQuality: 'partial',
          dataQualityNotes: ['Drift computation failed; see summary above.'],
        })
      );
      return { hasGaps: false, report: packet };
    }

    const changed = await tryChangedFilesSample();
    const excerpt = extractPlanningExcerptForPacket(content);

    if (drift.kind === 'rollup_marker') {
      const packet = buildGapOverbuildReviewPacket(
        basePacketInput({
          planningDocRelativePath: planPath,
          driftSummaryBody:
            '*Planning doc contains rollup marker and drift was skipped for this path (unexpected for gap_analysis with ignoreRollupMarker — treating as skip).*',
          planningExcerpt: excerpt.excerpt,
          planningExcerptNote: excerpt.note,
          changedFilesSample: changed.paths,
          changedFilesNote: changed.note,
          dataQuality: 'partial',
          dataQualityNotes: ['Rollup marker branch; drift not computed.'],
        })
      );
      return { hasGaps: false, report: packet };
    }

    if (drift.kind === 'no_planned_paths') {
      const packet = buildGapOverbuildReviewPacket(
        basePacketInput({
          planningDocRelativePath: planPath,
          driftSummaryBody:
            '*## Deliverables had no parseable repo paths — planned-vs-actual comparison was skipped.*',
          planningExcerpt: excerpt.excerpt,
          planningExcerptNote: excerpt.note,
          changedFilesSample: changed.paths,
          changedFilesNote: changed.note,
          dataQuality: 'partial',
          dataQualityNotes: ['No deliverables paths parsed from planning doc.'],
        })
      );
      return { hasGaps: false, report: packet };
    }

    const { scopeCreep, missed } = drift;
    const hasGaps = scopeCreep.length > 0 || missed.length > 0;
    const tierDown =
      planningTier === 'feature' ? 'phase' : planningTier === 'phase' ? 'session' : 'task';

    const driftBody = driftSummaryForAnalyzed(drift);
    const isPartial = excerpt.excerpt == null || changed.paths === null;
    const dataQualityNotes: string[] = [];
    if (excerpt.note) {
      dataQualityNotes.push(excerpt.note);
    }
    if (changed.note) {
      dataQualityNotes.push(changed.note);
    }
    if (dataQualityNotes.length === 0) {
      dataQualityNotes.push(
        isPartial ? 'Some packet inputs were unavailable.' : 'All packet inputs available.'
      );
    }

    const packet = buildGapOverbuildReviewPacket(
      basePacketInput({
        planningDocRelativePath: planPath,
        driftSummaryBody: driftBody,
        planningExcerpt: excerpt.excerpt,
        planningExcerptNote: excerpt.note,
        changedFilesSample: changed.paths,
        changedFilesNote: changed.note,
        dataQuality: isPartial ? 'partial' : 'full',
        dataQualityNotes,
      })
    );

    if (!hasGaps) {
      return { hasGaps: false, report: packet };
    }

    const lines: string[] = [
      '## Gap analysis (advisory)',
      '',
      `Planning doc: \`${planPath}\``,
      '',
      'Review before closing this tier. Register missing work with **tier-add**, then **tier-start** for new planning docs — do not create child planning docs from tier-end.',
      '',
    ];
    if (scopeCreep.length > 0) {
      lines.push('**Unplanned paths touched:**', ...scopeCreep.map(f => `- \`${f}\``), '');
    }
    if (missed.length > 0) {
      lines.push(
        '**Planned deliverables not seen in working tree (heuristic):**',
        ...missed.map(p => `- \`${p}\``),
        ''
      );
    }
    const gapBlock = lines.join('\n');
    const report = `${gapBlock}\n\n---\n\n${packet}`;
    return {
      hasGaps: true,
      report,
      recommendedAdds:
        missed.length > 0
          ? [
              {
                tier: tierDown as 'phase' | 'session' | 'task',
                identifier: '(use tier-add with concrete id)',
                description: `Follow-up ${tierDown} work may be needed for unmet deliverables above.`,
              },
            ]
          : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[tier-end gap packet] unexpected error in runPlanningTierGapAnalysis:', msg);
    const changed = await tryChangedFilesSample();
    const packet = buildGapOverbuildReviewPacket(
      basePacketInput({
        planningDocRelativePath: null,
        driftSummaryBody: `*Unexpected error during gap analysis:* ${msg}`,
        planningExcerpt: null,
        planningExcerptNote: msg,
        changedFilesSample: changed.paths,
        changedFilesNote: changed.note,
        dataQuality: 'partial',
        dataQualityNotes: ['Unexpected failure; packet is degraded.'],
      })
    );
    return { hasGaps: false, report: packet };
  }
}
