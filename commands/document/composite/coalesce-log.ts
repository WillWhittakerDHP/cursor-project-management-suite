/**
 * Workflow utility: normalize an existing tier log (dedupe excerpt markers / duplicate ## sections).
 *
 * Usage (from harness or agent): resolve feature, build WorkflowCommandContext, call
 * `workflowCoalesceLog(context, tier, identifier)`.
 *
 * Does not create files; no-op if the log is missing or already normalized.
 */

import { resolveFeatureDirectoryFromPlan, resolveFeatureDirectoryOrActive } from '../../utils';
import { WorkflowCommandContext } from '../../utils/command-context';
import { WorkflowId } from '../../utils/id-utils';

export type CoalesceLogTier = 'feature' | 'phase' | 'session';

export async function workflowCoalesceLog(
  tier: CoalesceLogTier,
  identifier: string | undefined,
  featureName?: string
): Promise<string> {
  const resolved = await resolveFeatureDirectoryOrActive(featureName);
  const context = new WorkflowCommandContext(resolved);
  let id: string | undefined = identifier;
  if (tier === 'feature') {
    id = undefined;
  } else if (tier === 'phase' && !id) {
    return 'Error: phase ID is required for phase logs';
  } else if (tier === 'session') {
    if (!id) {
      return 'Error: Session ID is required for session logs';
    }
    if (!WorkflowId.isValidSessionId(id)) {
      return `Error: Invalid session ID format. Expected X.Y.Z (e.g., 4.1.3). Attempted: ${id}`;
    }
  }

  const { changed, path } = await context.documents.coalesceLogNormalization(tier, id);
  const lines = [
    `# Coalesce log: ${tier}${id ? ` ${id}` : ''}`,
    `**Feature:** ${resolved}`,
    `**Path:** \`${path}\``,
    changed ? '**Result:** File was rewritten with normalized markdown.' : '**Result:** No changes (already normalized or missing).',
  ];
  return lines.join('\n');
}
