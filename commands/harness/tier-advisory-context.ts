/**
 * Shared planning-doc advisory context: governance summary for Contract, architecture excerpt,
 * Work Profile section. Used by tier-start planning-doc assembly and tier-add command output.
 */

import { buildGovernanceContext } from '../audit/governance-context';
import { readArchitectureExcerptForPlanning } from './architecture-excerpt';
import type { WorkProfile } from './work-profile';
import type { TierName } from '../tiers/shared/types';
import { PROJECT_ROOT } from '../utils/utils';

/** Extract a one-liner from governance context for the short planning doc Contract section. */
export function buildGovernanceOneLiner(governanceContext: string): string {
  const lines = (governanceContext || '').split('\n');
  const findings = lines
    .map(line => line.trim())
    .filter(line =>
      line.length > 0 &&
      (line.includes('P0') || line.includes('P1') || line.includes('violations') || line.includes('hotspot'))
    )
    .slice(0, 6);
  if (findings.length === 0) return 'Clean — no violations detected';
  return `${findings.length} governance highlights — read reports before filling slots`;
}

const GOVERNANCE_DOC_SUMMARY_MAX = 500;

/**
 * Bounded governance text for embedding in the planning doc Contract (not command stdout).
 * Pulls finding-like lines from the full governance markdown built for tier-start output.
 */
export function buildGovernanceSummaryForPlanningDoc(governanceContext: string): string {
  const raw = (governanceContext || '').trim();
  if (!raw) {
    return 'No governance snapshot loaded — read `client/.audit-reports/` and playbooks before coding.';
  }
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const pick: string[] = [];
  for (const line of lines) {
    const acc = pick.join('\n');
    if (acc.length >= GOVERNANCE_DOC_SUMMARY_MAX) break;
    const isHeader = /^#{1,3}\s/.test(line);
    const isFinding =
      /P0|P1|violation|hotspot|repoPath|\.vue|\.scss|\.ts\b|\.tsx\b|Error|Warning|⚠|✗/i.test(line);
    if (isFinding && !isHeader) {
      const stripped = line.replace(/^[-*]\s+/, '').trim();
      if (stripped.length > 0 && stripped.length < 220) pick.push(stripped);
    } else if (isHeader && line.length < 90 && pick.length < 4) {
      const stripped = line.replace(/^#{1,3}\s+/, '').trim();
      if (stripped.length > 0) pick.push(stripped);
    }
  }
  let joined = pick.slice(0, 8).join('\n');
  if (joined.length > GOVERNANCE_DOC_SUMMARY_MAX) {
    joined = `${joined.slice(0, GOVERNANCE_DOC_SUMMARY_MAX - 24)}\n… _(truncated)_`;
  }
  if (joined.length === 0) {
    return buildGovernanceOneLiner(governanceContext);
  }
  return joined;
}

/** Markdown block for ## Contract — single or nested bullets under Governance. */
export function formatGovernanceContractBlock(summary: string): string {
  const lines = summary.split('\n').filter(Boolean);
  if (lines.length === 1) {
    return `- **Governance:** ${lines[0]}`;
  }
  const nested = lines.map(l => `  - ${l}`).join('\n');
  return `- **Governance (harness snapshot):**\n${nested}`;
}

export function formatWorkProfileSection(workProfile: WorkProfile | null | undefined): string {
  if (workProfile == null) return '';
  return `
## Work Profile
- **Execution intent:** ${workProfile.executionIntent}
- **Action type:** ${workProfile.actionType}
- **Scope shape:** ${workProfile.scopeShape}
- **Governance domains:** ${workProfile.governanceDomains.join(', ')}
- **Gate profile:** ${workProfile.gateProfile ?? '(derived)'}
- **Suggested depth:** ${workProfile.suggestedDepth ?? '(derived)'} — advisory; agent decides in Analysis / Decomposition
- **Recommended context pack:** ${workProfile.contextPack ?? '(derived from intent)'}
- **Planning artifact action:** ${workProfile.planningArtifactAction ?? 'none'}
- **Decomposition mode:** ${workProfile.decompositionMode ?? 'moderate'}
- **Downstream advice:** Planning doc is advisory; guide owns current-tier decomposition.
`;
}

export interface TierAdvisoryContext {
  governanceContext: string;
  governanceContractBlock: string;
  architectureExcerpt: string | null;
  workProfileSection: string;
  taskGovernanceDeferred: boolean;
  taskGovernanceDeferredMessage: string | null;
}

export interface BuildTierAdvisoryContextInput {
  tier: TierName;
  workProfile: WorkProfile;
  taskFiles?: string[];
  projectRoot?: string;
}

function extractTaskGovernanceDeferredBody(governanceContext: string): string {
  const m = governanceContext.match(/^## Governance Context \(Task\)\s*\n+([\s\S]*)$/);
  return m ? m[1].trim() : governanceContext.trim();
}

export async function buildTierAdvisoryContext(
  input: BuildTierAdvisoryContextInput
): Promise<TierAdvisoryContext> {
  const projectRoot = input.projectRoot ?? PROJECT_ROOT;
  const taskFiles = input.taskFiles;
  const governanceContext = await buildGovernanceContext({
    tier: input.tier,
    taskFiles,
  });
  const taskGovernanceDeferred =
    input.tier === 'task' && (taskFiles === undefined || taskFiles.length === 0);
  const taskGovernanceDeferredMessage = taskGovernanceDeferred
    ? extractTaskGovernanceDeferredBody(governanceContext)
    : null;
  const governanceContractBlock = formatGovernanceContractBlock(
    buildGovernanceSummaryForPlanningDoc(governanceContext)
  );
  const architectureExcerpt = await readArchitectureExcerptForPlanning(
    projectRoot,
    input.workProfile.governanceDomains
  );
  const workProfileSection = formatWorkProfileSection(input.workProfile);
  return {
    governanceContext,
    governanceContractBlock,
    architectureExcerpt,
    workProfileSection,
    taskGovernanceDeferred,
    taskGovernanceDeferredMessage,
  };
}

/** Minimum Reference bullets for /{tier}-add output (workflow friction reader parity). */
export function buildTierAddReferenceMarkdown(): string {
  return [
    '## Reference',
    '',
    '- Workflow friction log (non-git harness issues): `.project-manager/WORKFLOW_FRICTION_LOG.md`',
    '- Scan recent friction entries: `npx tsx .cursor/commands/utils/read-workflow-friction.ts --last 20`',
    '- If a Complete parent was auto-reopened and friction was recorded (or session-end push gate applies), run **`/harness-repair`** in **plan** mode before proceeding; see `.cursor/commands/harness-repair.md`',
  ].join('\n');
}
