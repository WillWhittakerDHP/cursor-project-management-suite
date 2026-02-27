/**
 * Shared utilities for tier start commands (phase-start, session-start, feature-start, task-start).
 * Reduces duplication of branch hierarchy display, plan-mode preview, and "cannot start" messaging.
 */

import { formatBranchHierarchyFromConfig } from '../git/shared/tier-branch-manager';
import { WorkflowCommandContext } from './command-context';

export interface FormatBranchHierarchyOptions {
  featureName: string;
  phase?: string;
  sessionId?: string;
}

/**
 * Builds the "Branch Hierarchy Verification" section string using tier configs.
 * Delegates to formatBranchHierarchyFromConfig for config-driven branch names.
 */
export async function formatBranchHierarchy(options: FormatBranchHierarchyOptions): Promise<string> {
  const { featureName, phase, sessionId } = options;
  try {
    const context = new WorkflowCommandContext(featureName);
    if (sessionId) {
      const { SESSION_CONFIG } = await import('../tiers/configs/index');
      return formatBranchHierarchyFromConfig(SESSION_CONFIG, sessionId, context);
    }
    if (phase) {
      const { PHASE_CONFIG } = await import('../tiers/configs/index');
      return formatBranchHierarchyFromConfig(PHASE_CONFIG, phase, context);
    }
    const { FEATURE_CONFIG } = await import('../tiers/configs/index');
    return formatBranchHierarchyFromConfig(FEATURE_CONFIG, featureName, context);
  } catch (_error) {
    const errMsg = _error instanceof Error ? _error.message : String(_error);
    return '## Branch Hierarchy Verification\n' + `**Could not determine branch information:** ${errMsg}\n`;
  }
}

export interface FormatPlanModePreviewOptions {
  commandName?: string;
  intro?: string;
}

/**
 * Returns the plan-mode section: "Mode: Plan", optional intro, and "What would run" with steps as bullets.
 */
export function formatPlanModePreview(
  planSteps: string[],
  options?: FormatPlanModePreviewOptions
): string {
  const { intro } = options ?? {};
  const bullets = planSteps.map((s) => `- ${s}`).join('\n');
  const introBlock = intro !== undefined && intro !== '' ? `\n${intro}\n` : '';
  return `\n---\n## Mode: Plan (no side effects)${introBlock}\n### What would run (execute mode)\n${bullets}`;
}

/** Tier name for "cannot start" message (all tiers). */
export type CannotStartTier = 'feature' | 'phase' | 'session' | 'task';

/**
 * Returns the "Cannot start &lt;tier&gt;" message for early return when validation fails.
 */
export function formatCannotStart(tier: CannotStartTier, _identifier: string): string {
  return `\n---\n**⚠️ Cannot start ${tier}. Please address the issues above before proceeding.**\n`;
}
