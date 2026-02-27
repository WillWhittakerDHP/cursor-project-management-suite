/**
 * Phase validation implementation. Used by tier-validate and by validate-phase (thin wrapper).
 */

import { WorkflowCommandContext } from '../../../utils/command-context';
import { readProjectFile } from '../../../utils/utils';
import { getCurrentBranch, runCommand } from '../../../utils/utils';
import { PHASE_CONFIG } from '../../configs/phase';

export interface ValidatePhaseResult {
  canStart: boolean;
  reason: string;
  details: string[];
}

export async function validatePhaseImpl(phase: string): Promise<ValidatePhaseResult> {
  const details: string[] = [];
  const context = await WorkflowCommandContext.getCurrent();

  try {
    let featureGuideContent = '';
    try {
      featureGuideContent = await context.readFeatureGuide();
    } catch {
      featureGuideContent = '';
    }
    const escapedPhase = phase.replace(/\./g, '\\.');
    const phaseIsListedInFeatureGuide = featureGuideContent !== ''
      && new RegExp(`\\bPhase\\s+${escapedPhase}(?::|\\b)`, 'i').test(featureGuideContent);

    const phaseGuidePath = context.paths.getPhaseGuidePath(phase);
    const phaseLogPath = context.paths.getPhaseLogPath(phase);
    const phaseHandoffPath = context.paths.getPhaseHandoffPath(phase);
    const [hasPhaseGuideFile, hasPhaseLogFile, hasPhaseHandoffFile] = await Promise.all([
      readProjectFile(phaseGuidePath).then(() => true).catch(() => false),
      readProjectFile(phaseLogPath).then(() => true).catch(() => false),
      readProjectFile(phaseHandoffPath).then(() => true).catch(() => false),
    ]);

    if (!phaseIsListedInFeatureGuide && !hasPhaseGuideFile && !hasPhaseLogFile && !hasPhaseHandoffFile) {
      return {
        canStart: false,
        reason: 'Phase is not documented',
        details: [
          `Phase ${phase} is not listed in feature guide`,
          `No phase guide/log/handoff exists for ${phase}`,
          `Add Phase ${phase} to feature docs before starting it`,
        ],
      };
    }

    try {
      await readProjectFile(phaseGuidePath);
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

    const status = await PHASE_CONFIG.controlDoc.readStatus(context, phase);
    if (status !== null) {
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
          const phaseBranchName = PHASE_CONFIG.getBranchName(context, phase);
          const currentBranch = await getCurrentBranch();
          if (!phaseBranchName) {
            details.push('Could not resolve phase branch name from config.');
          } else if (currentBranch === phaseBranchName || currentBranch.includes(`-phase-${phase}`)) {
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

    const phaseNum = parseInt(phase);
    if (phaseNum > 1) {
      const previousPhase = (phaseNum - 1).toString();
      try {
        const previousStatus = await PHASE_CONFIG.controlDoc.readStatus(context, previousPhase);
        if (previousStatus !== null && previousStatus !== 'complete') {
          return {
            canStart: false,
            reason: 'Previous phase not completed',
            details: [
              `Phase ${previousPhase} has status: ${previousStatus}`,
              `Phase ${phase} cannot be started until Phase ${previousPhase} is complete`,
              `Complete Phase ${previousPhase} first with /phase-end ${previousPhase}`,
            ],
          };
        }
      } catch (err) {
        console.warn('Validate phase: previous phase status check failed', previousPhase, err);
        details.push(`Note: Previous phase (Phase ${previousPhase}) status could not be read - assuming complete`);
      }
    }

    const phaseBranchName = PHASE_CONFIG.getBranchName(context, phase);
    if (!phaseBranchName) {
      return {
        canStart: false,
        reason: 'Could not resolve phase branch name from config',
        details: ['Phase tier config getBranchName returned null.'],
      };
    }
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
