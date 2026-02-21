/**
 * Phase validation implementation. Used by tier-validate and by validate-phase (thin wrapper).
 */

import { WorkflowCommandContext } from '../../../utils/command-context';
import { readProjectFile } from '../../../utils/utils';
import { getCurrentBranch, runCommand } from '../../../utils/utils';
import { MarkdownUtils } from '../../../utils/markdown-utils';

export interface ValidatePhaseResult {
  canStart: boolean;
  reason: string;
  details: string[];
}

export async function validatePhaseImpl(phase: string): Promise<ValidatePhaseResult> {
  const details: string[] = [];
  const context = await WorkflowCommandContext.getCurrent();

  try {
    const phaseGuidePath = context.paths.getPhaseGuidePath(phase);
    let phaseGuideContent: string;
    try {
      phaseGuideContent = await readProjectFile(phaseGuidePath);
    } catch (err) {
      console.warn('Validate phase: phase guide not found', phaseGuidePath, err);
      return {
        canStart: false,
        reason: 'Phase guide not found',
        details: [
          `Phase guide does not exist at: ${phaseGuidePath}`,
          `Create the phase guide first using /phase-plan ${phase}`,
        ],
      };
    }

    const statusSection = MarkdownUtils.extractSection(phaseGuideContent, 'Phase ' + phase);
    if (statusSection) {
      const statusMatch = statusSection.match(/\*\*Status:\*\*\s*(Not Started|Planning|In Progress|Partial|Blocked|Complete)/i);
      if (statusMatch) {
        const status = statusMatch[1].toLowerCase();

        if (status === 'complete') {
          return {
            canStart: false,
            reason: 'Phase already completed',
            details: [
              `Phase ${phase} has status: Complete`,
              `All sessions in this phase have been completed`,
              `To start a new phase, use /phase-start ${parseInt(phase) + 1}`,
            ],
          };
        }

        if (status === 'blocked') {
          return {
            canStart: false,
            reason: 'Phase is blocked',
            details: [
              `Phase ${phase} has status: Blocked`,
              `Resolve the blocker before starting this phase`,
            ],
          };
        }

        if (status === 'in progress') {
          const phaseBranchName = `${context.feature.name}-phase-${phase}`;
          const currentBranch = await getCurrentBranch();

          if (currentBranch === phaseBranchName || currentBranch.includes(`-phase-${phase}`)) {
            return {
              canStart: false,
              reason: 'Phase already started',
              details: [
                `Phase ${phase} has status: In Progress`,
                `Current branch: ${currentBranch}`,
                `Phase branch exists: ${phaseBranchName}`,
                `Continue working on this phase or complete it with /phase-end ${phase}`,
              ],
            };
          }
        }
      }
    }

    const phaseNum = parseInt(phase);
    if (phaseNum > 1) {
      const previousPhase = (phaseNum - 1).toString();
      try {
        const previousPhaseGuidePath = context.paths.getPhaseGuidePath(previousPhase);
        const previousPhaseGuideContent = await readProjectFile(previousPhaseGuidePath);
        const previousStatusSection = MarkdownUtils.extractSection(previousPhaseGuideContent, 'Phase ' + previousPhase);

        if (previousStatusSection) {
          const previousStatusMatch = previousStatusSection.match(/\*\*Status:\*\*\s*(Not Started|Planning|In Progress|Partial|Blocked|Complete)/i);
          if (previousStatusMatch) {
            const previousStatus = previousStatusMatch[1].toLowerCase();

            if (previousStatus !== 'complete') {
              return {
                canStart: false,
                reason: 'Previous phase not completed',
                details: [
                  `Phase ${previousPhase} has status: ${previousStatusMatch[1]}`,
                  `Phase ${phase} cannot be started until Phase ${previousPhase} is complete`,
                  `Complete Phase ${previousPhase} first with /phase-end ${previousPhase}`,
                ],
              };
            }
          }
        }
      } catch (err) {
        console.warn('Validate phase: previous phase guide not found', previousPhase, err);
        details.push(`Note: Previous phase guide (Phase ${previousPhase}) not found - assuming it's complete`);
      }
    }

    const phaseBranchName = `${context.feature.name}-phase-${phase}`;
    const branchCheckResult = await runCommand(`git branch --list ${phaseBranchName}`);
    if (branchCheckResult.success && branchCheckResult.output.trim()) {
      return {
        canStart: false,
        reason: 'Phase branch already exists',
        details: [
          `Phase branch exists: ${phaseBranchName}`,
          `Switch to it with: git checkout ${phaseBranchName}`,
          `Or delete it first if you want to start fresh: git branch -D ${phaseBranchName}`,
        ],
      };
    }

    return {
      canStart: true,
      reason: 'Phase can be started',
      details: [
        `Phase ${phase} guide exists`,
        `Phase ${phase} status: Not Started`,
        phaseNum > 1 ? `Previous phase (${phaseNum - 1}) is complete` : 'This is the first phase',
        `Ready to start with /phase-start ${phase}`,
      ],
    };
  } catch (_error) {
    return {
      canStart: false,
      reason: 'Validation error',
      details: [
        `Error during validation: ${_error instanceof Error ? _error.message : String(_error)}`,
        `Please check phase number and feature context`,
      ],
    };
  }
}
