/**
 * Recover planning docs / guides from git history after checkout when files were
 * auto-committed on the source branch and are missing on the target branch.
 */

import { join } from 'path';
import { existsSync } from 'fs';
import type { TierStartWorkflowContext } from '../../tiers/shared/tier-start-workflow-types';
import { PROJECT_ROOT } from '../../utils/utils';
import { resolvePlanningDocRelativePath } from '../../utils/planning-doc-paths';
import type { PlanningTier } from '../../utils/planning-doc-paths';
import { runGitCommand } from './git-logger';

/**
 * For each expected workflow path, if missing on disk, restore blob from `git log --all`.
 * When `preferredRelativePaths` is set and non-empty, only those paths (that are also
 * expected for this tier) are considered.
 */
export async function recoverPlanningArtifactsAfterCheckout(
  ctx: TierStartWorkflowContext,
  preferredRelativePaths?: string[]
): Promise<void> {
  const tier = ctx.config.name;
  if (tier === 'task') return;

  const base = ctx.context.paths.getBasePath();
  const planningPath = resolvePlanningDocRelativePath(base, tier as PlanningTier, ctx.identifier);
  const guidePath =
    tier === 'feature'
      ? ctx.context.paths.getFeatureGuidePath()
      : tier === 'phase'
        ? ctx.context.paths.getPhaseGuidePath(ctx.identifier)
        : ctx.context.paths.getSessionGuidePath(ctx.identifier);

  const expected = [planningPath, guidePath];
  const defaultSet = new Set(expected);
  const candidates =
    preferredRelativePaths != null && preferredRelativePaths.length > 0
      ? [...new Set(preferredRelativePaths.filter((p) => defaultSet.has(p)))]
      : expected;
  const toRecover = candidates.length > 0 ? candidates : expected;

  for (const relPath of toRecover) {
    const absPath = join(PROJECT_ROOT, relPath);
    if (existsSync(absPath)) continue;

    const logResult = await runGitCommand(
      `git log --all -1 --format=%H -- "${relPath}"`,
      'recoverArtifact-findCommit'
    );
    const commitHash = logResult.success ? logResult.output.trim() : '';
    if (!commitHash) continue;

    const showResult = await runGitCommand(
      `git show ${commitHash}:"${relPath}"`,
      'recoverArtifact-show'
    );
    if (!showResult.success || !showResult.output) continue;

    try {
      const { writeFile: fsWriteFile, mkdir } = await import('fs/promises');
      const { dirname } = await import('path');
      await mkdir(dirname(absPath), { recursive: true });
      await fsWriteFile(absPath, showResult.output, 'utf-8');
      ctx.output.push(
        `Recovered \`${relPath}\` from commit ${commitHash.slice(0, 8)} (auto-committed on source branch before checkout).`
      );
    } catch (err) {
      console.warn(`recoverPlanningArtifactsAfterCheckout: failed to write ${relPath}`, err);
    }
  }
}
