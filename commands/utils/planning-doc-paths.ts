/**
 * Planning document paths under a feature base path (.project-manager/features/<feature>).
 * Single source of truth for tier → relative path mapping.
 */

export type PlanningTier = 'feature' | 'phase' | 'session' | 'task';

/** Project-relative path to the planning markdown for the tier and id. */
export function resolvePlanningDocRelativePath(
  basePath: string,
  tier: PlanningTier,
  id: string
): string {
  if (tier === 'feature') {
    return `${basePath}/feature-planning.md`;
  }
  if (tier === 'phase') {
    return `${basePath}/phases/phase-${id}-planning.md`;
  }
  if (tier === 'task') {
    return `${basePath}/sessions/task-${id}-planning.md`;
  }
  return `${basePath}/sessions/session-${id}-planning.md`;
}
