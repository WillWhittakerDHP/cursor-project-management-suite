/**
 * Composite Command: /validate-session [sessionId]
 * Validate session can be started - checks if already started/completed or if previous session is incomplete
 * 
 * Tier: Session (Tier 2 - Medium-Level)
 * Operates on: Session validation before starting
 */

import { WorkflowCommandContext } from '../../../utils/command-context';
import { readProjectFile } from '../../../utils/utils';
import { getCurrentBranch, runCommand } from '../../../utils/utils';
import { WorkflowId } from '../../../utils/id-utils';
import { getPhaseFromSessionId } from '../../../utils/phase-session-utils';

export interface ValidateSessionResult {
  canStart: boolean;
  reason: string;
  details: string[];
}

export async function validateSession(sessionId: string): Promise<ValidateSessionResult> {
  const details: string[] = [];
  
  // Parse session ID
  const parsed = WorkflowId.parseSessionId(sessionId);
  if (!parsed) {
    return {
      canStart: false,
      reason: 'Invalid session ID format',
      details: [
        `Session ID format must be X.Y (e.g., 1.3, 2.1)`,
        `Received: ${sessionId}`,
      ],
    };
  }
  
  const phase = parsed.phase.toString();
  const session = parsed.session;
  const sessionNum = parseInt(session, 10);
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
    
    // Check if session is already completed (checkbox checked)
    const sessionCheckboxPattern = new RegExp(`-\\s*\\[x\\]\\s*(###\\s*)?Session\\s+${sessionId.replace(/\./g, '\\.')}`, 'i');
    if (sessionCheckboxPattern.test(phaseGuideContent)) {
      return {
        canStart: false,
        reason: 'Session already completed',
        details: [
          `Session ${sessionId} checkbox is checked in phase guide`,
          `This session has already been completed`,
          `To start a new session, use /session-start ${phase}.${sessionNum + 1}`,
        ],
      };
    }
    
    // Check if session branch already exists
    const phaseMatch = sessionId.match(/^(\d+)/);
    const phaseNum = phaseMatch ? phaseMatch[1] : phase;
    const sessionBranchName = `${context.feature.name}-phase-${phaseNum}-session-${sessionId}`;
    const branchCheckResult = await runCommand(`git branch --list ${sessionBranchName}`);
    const currentBranch = await getCurrentBranch();
    
    if (branchCheckResult.success && branchCheckResult.output.trim()) {
      if (currentBranch === sessionBranchName) {
        return {
          canStart: false,
          reason: 'Session already started',
          details: [
            `Session ${sessionId} branch exists and is current: ${sessionBranchName}`,
            `Continue working on this session or complete it with /session-end ${sessionId}`,
          ],
        };
      } else {
        return {
          canStart: false,
          reason: 'Session branch already exists',
          details: [
            `Session branch exists: ${sessionBranchName}`,
            `Switch to it with: git checkout ${sessionBranchName}`,
            `Or delete it first if you want to start fresh: git branch -D ${sessionBranchName}`,
          ],
        };
      }
    }
    
    // Check if previous session in phase is complete (if not first session)
    if (sessionNum > 1) {
      const previousSessionId = `${phase}.${sessionNum - 1}`;
      const previousSessionCheckboxPattern = new RegExp(`-\\s*\\[x\\]\\s*(###\\s*)?Session\\s+${previousSessionId.replace(/\./g, '\\.')}`, 'i');
      
      if (!previousSessionCheckboxPattern.test(phaseGuideContent)) {
        return {
          canStart: false,
          reason: 'Previous session not completed',
          details: [
            `Session ${previousSessionId} is not marked as complete in phase guide`,
            `Session ${sessionId} cannot be started until Session ${previousSessionId} is complete`,
            `Complete Session ${previousSessionId} first with /session-end ${previousSessionId}`,
          ],
        };
      }
    }
    
    // Check if phase is complete (sessions shouldn't start after phase is complete)
    const statusSection = phaseGuideContent.match(/## Phase \d+[\s\S]*?\*\*Status:\*\*\s*(Not Started|In Progress|Complete)/i);
    if (statusSection) {
      const phaseStatus = statusSection[1].toLowerCase();
      if (phaseStatus === 'complete') {
        return {
          canStart: false,
          reason: 'Phase already completed',
          details: [
            `Phase ${phase} has status: Complete`,
            `Cannot start new sessions in a completed phase`,
            `To start a new phase, use /phase-start ${parseInt(phase) + 1}`,
          ],
        };
      }
    }
    
    // All checks passed
    return {
      canStart: true,
      reason: 'Session can be started',
      details: [
        `Session ${sessionId} is not completed`,
        `Session ${sessionId} branch does not exist`,
        sessionNum > 1 ? `Previous session (${phase}.${sessionNum - 1}) is complete` : 'This is the first session in the phase',
        `Phase ${phase} is not complete`,
        `Ready to start with /session-start ${sessionId}`,
      ],
    };
  } catch (error) {
    return {
      canStart: false,
      reason: 'Validation error',
      details: [
        `Error during validation: ${error instanceof Error ? error.message : String(error)}`,
        `Please check session ID format and phase guide exists`,
      ],
    };
  }
}

/**
 * Format validation result as user-friendly message
 */
export function formatSessionValidation(result: ValidateSessionResult, sessionId: string): string {
  const output: string[] = [];
  
  output.push(`# Session ${sessionId} Validation\n`);
  
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
 * Standalone command: /validate-session [sessionId]
 * Validates if a session can be started
 */
export async function validateSessionCommand(sessionId: string): Promise<string> {
  const validation = await validateSession(sessionId);
  return formatSessionValidation(validation, sessionId);
}

