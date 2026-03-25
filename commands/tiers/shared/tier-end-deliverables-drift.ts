/**
 * Shared planned-vs-actual deliverables drift for deliverables_check and gap_analysis.
 * PATTERN: one canonical path for parsing + working-tree comparison; consumers choose rollup skip policy.
 */

import { parseDeliverablesFromPlanningDoc } from '../../utils/planning-doc-parse';
import { listWorkingTreeChangedRepoPaths } from '../../git/shared/git-manager';
import type { PlanningTier } from '../../utils/planning-doc-paths';
import type { GapAnalysisResult, TierEndWorkflowContext } from './tier-end-workflow-types';

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

/**
 * Default gap analysis from planning doc + drift heuristic (session / phase / feature).
 */
export async function runPlanningTierGapAnalysis(
  ctx: TierEndWorkflowContext,
  planningTier: PlanningTier
): Promise<GapAnalysisResult> {
  const planningId = planningTier === 'feature' ? '' : ctx.identifier;
  if (!(await ctx.context.documents.planningDocExists(planningTier, planningId))) {
    return { hasGaps: false, report: '' };
  }
  const content = await ctx.context.documents.readPlanningDoc(planningTier, planningId);
  const drift = await analyzeDeliverablesDriftFromContent(content, { ignoreRollupMarker: true });
  if (drift.kind !== 'analyzed') {
    return { hasGaps: false, report: '' };
  }
  const { scopeCreep, missed } = drift;
  if (scopeCreep.length === 0 && missed.length === 0) {
    return { hasGaps: false, report: '' };
  }
  const planPath = ctx.context.documents.getPlanningDocRelativePath(planningTier, planningId);
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
  const tierDown =
    planningTier === 'feature' ? 'phase' : planningTier === 'phase' ? 'session' : 'task';
  const report = lines.join('\n');
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
}
