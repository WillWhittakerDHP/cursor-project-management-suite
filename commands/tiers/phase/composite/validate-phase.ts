/**
 * Composite Command: /validate-phase [phase]
 * Validate phase can be started - checks if already started/completed or if previous phase is incomplete
 * 
 * Tier: Phase (Tier 1 - High-Level)
 * Operates on: Phase validation before starting
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

export async function validatePhase(phase: string): Promise<ValidatePhaseResult> {
  const details: string[] = [];
  const context = await WorkflowCommandContext.getCurrent();
  
  try {
    // Check if phase guide exists
    const phaseGuidePath = context.paths.getPhaseGuidePath(phase);
    let phaseGuideContent: string;
    try {
      phaseGuideContent = await readProjectFile(phaseGuidePath);
    } catch {} {
      return {
        canStart: false,
        reason: 'Phase guide not found',
        details: [
          `Phase guide does not exist at: ${phaseGuidePath}`,
          `Create the phase guide first using /plan-phase ${phase}`,
        ],
      };
    }
    
    // Check phase status
    const statusSection = MarkdownUtils.extractSection(phaseGuideContent, 'Phase ' + phase);
    if (statusSection) {
      const statusMatch = statusSection.match(/\*\*Status:\*\*\s*(Not Started|In Progress|Complete)/i);
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
        
        if (status === 'in progress') {
          // Check if phase branch exists
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
    
    // Check if previous phase is complete (if not Phase 1)
    const phaseNum = parseInt(phase);
    if (phaseNum > 1) {
      const previousPhase = (phaseNum - 1).toString();
      try {
        const previousPhaseGuidePath = context.paths.getPhaseGuidePath(previousPhase);
        const previousPhaseGuideContent = await readProjectFile(previousPhaseGuidePath);
        const previousStatusSection = MarkdownUtils.extractSection(previousPhaseGuideContent, 'Phase ' + previousPhase);
        
        if (previousStatusSection) {
          const previousStatusMatch = previousStatusSection.match(/\*\*Status:\*\*\s*(Not Started|In Progress|Complete)/i);
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
      } catch (error) {
        // Previous phase guide might not exist - that's okay for Phase 2+
        details.push(`Note: Previous phase guide (Phase ${previousPhase}) not found - assuming it's complete`);
      }
    }
    
    // Check if phase branch already exists
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
    
    // All checks passed
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
  } catch (error) {
    return {
      canStart: false,
      reason: 'Validation error',
      details: [
        `Error during validation: ${error instanceof Error ? error.message : String(error)}`,
        `Please check phase number and feature context`,
      ],
    };
  }
}

/**
 * Format validation result as user-friendly message
 */
export function formatPhaseValidation(result: ValidatePhaseResult, phase: string): string {
  const output: string[] = [];
  
  output.push(`# Phase ${phase} Validation\n`);
  
  if (result.canStart) {
    output.push('✅ **Status:** Ready to start\n');
  } else {
    output.push(`❌ **Status:** Cannot start - ${result.reason}\n`);
  }
  
  output.push('## Details\n');
  result.details.forEach(detail => {
    output.push(`- ${detail}`);
  });
  
  return output.join('\n');
}

/**
 * Standalone command: /validate-phase [phase]
 * Validates if a phase can be started
 */
export async function validatePhaseCommand(phase: string): Promise<string> {
  const validation = await validatePhase(phase);
  return formatPhaseValidation(validation, phase);
}

