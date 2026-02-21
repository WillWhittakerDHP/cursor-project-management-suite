/**
 * Shared utilities for tier start commands (phase-start, session-start, feature-start, task-start).
 * Reduces duplication of branch hierarchy display, plan-mode preview, and "cannot start" messaging.
 */

import { getCurrentBranch, branchExists } from './utils';

export interface FormatBranchHierarchyOptions {
  featureName: string;
  phase?: string;
  sessionId?: string;
}

/**
 * Builds the "Branch Hierarchy Verification" section string.
 * Tree: main -> feature/<name> -> optional phase -> optional session, with "(target)" on the leaf.
 */
export async function formatBranchHierarchy(options: FormatBranchHierarchyOptions): Promise<string> {
  const { featureName, phase, sessionId } = options;
  try {
    const currentBranch = await getCurrentBranch();
    const featureBranch = currentBranch.startsWith('feature/') ? currentBranch : `feature/${featureName}`;
    const mainBranch = (await branchExists('main')) ? 'main' : 'master';
    const lines: string[] = ['## Branch Hierarchy Verification\n', '```', mainBranch, `  └── ${featureBranch}`];

    if (phase !== undefined) {
      const phaseBranchName = `${featureName}-phase-${phase}`;
      lines.push(`       └── ${phaseBranchName}`);
      if (sessionId !== undefined) {
        const sessionBranchName = `${featureName}-phase-${phase}-session-${sessionId}`;
        lines.push(`            └── ${sessionBranchName} (target)`);
        lines.push('```');
        lines.push(`\n**Current Branch:** \`${currentBranch}\``);
        lines.push(`\n**Target Session Branch:** \`${sessionBranchName}\``);
        lines.push(`\n**Phase Branch:** \`${phaseBranchName}\``);
        lines.push(`\n**Feature Branch:** \`${featureBranch}\``);
        lines.push(`\n**Base Branch:** \`${mainBranch}\`\n`);
      } else {
        lines[lines.length - 1] = `       └── ${phaseBranchName} (target)`;
        lines.push('```');
        lines.push(`\n**Current Branch:** \`${currentBranch}\``);
        lines.push(`\n**Target Phase Branch:** \`${phaseBranchName}\``);
        lines.push(`\n**Feature Branch:** \`${featureBranch}\``);
        lines.push(`\n**Base Branch:** \`${mainBranch}\`\n`);
      }
    } else {
      lines.push('```');
      lines.push(`\n**Current Branch:** \`${currentBranch}\``);
      lines.push(`\n**Feature Branch:** \`${featureBranch}\``);
      lines.push(`\n**Base Branch:** \`${mainBranch}\`\n`);
    }

    return lines.join('\n');
  } catch (_error) {
    const errMsg = _error instanceof Error ? _error.message : String(_error);
    const context: string[] = [`**⚠️ Could not determine branch information:** ${errMsg}\n`];
    if (phase !== undefined) context.push(`**Phase:** ${phase}\n`);
    if (sessionId !== undefined) context.push(`**Session ID:** ${sessionId}\n`);
    context.push(`**Feature:** ${featureName}\n`);
    return '## Branch Hierarchy Verification\n' + context.join('');
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

/**
 * Returns the "Cannot start &lt;tier&gt;" message for early return when validation fails.
 */
export function formatCannotStart(tier: 'phase' | 'session', _identifier: string): string {
  return `\n---\n**⚠️ Cannot start ${tier}. Please address the issues above before proceeding.**\n`;
}
