/**
 * Session validation implementation. Used by tier-validate and by validate-session (thin wrapper).
 */

import { WorkflowCommandContext } from '../../../utils/command-context';
import { readProjectFile } from '../../../utils/utils';
import { getCurrentBranch, runCommand } from '../../../utils/utils';
import { WorkflowId } from '../../../utils/id-utils';

export interface ValidateSessionResult {
  canStart: boolean;
  reason: string;
  details: string[];
}

export async function validateSessionImpl(sessionId: string): Promise<ValidateSessionResult> {
  const parsed = WorkflowId.parseSessionId(sessionId);
  if (!parsed) {
    return {
      canStart: false,
      reason: 'Invalid session ID format',
      details: [
        `Session ID format must be X.Y.Z (e.g., 4.1.3)`,
        `Received: ${sessionId}`,
      ],
    };
  }

  const phase = parsed.phaseId;
  const session = parsed.session;
  const sessionNum = parseInt(session, 10);
  const context = await WorkflowCommandContext.getCurrent();

  try {
    const phaseGuidePath = context.paths.getPhaseGuidePath(phase);
    let phaseGuideContent: string;
    try {
      phaseGuideContent = await readProjectFile(phaseGuidePath);
    } catch (err) {
      console.warn('Validate session: validation check failed', err);
      return {
        canStart: false,
        reason: 'Phase guide not found',
        details: [
          `Phase guide does not exist at: ${phaseGuidePath}`,
          `Create the phase guide first using /phase-plan ${phase}`,
        ],
      };
    }

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

    const sessionBranchName = `${context.feature.name}-phase-${phase}-session-${sessionId}`;
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
      }
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

    const statusSection = phaseGuideContent.match(/## Phase [\d.]+[\s\S]*?\*\*Status:\*\*\s*(Not Started|Planning|In Progress|Partial|Blocked|Complete)/i);
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
      if (phaseStatus === 'blocked') {
        return {
          canStart: false,
          reason: 'Phase is blocked',
          details: [
            `Phase ${phase} has status: Blocked`,
            `Resolve the blocker before starting sessions in this phase`,
          ],
        };
      }
    }

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
  } catch (_error) {
    return {
      canStart: false,
      reason: 'Validation error',
      details: [
        `Error during validation: ${_error instanceof Error ? _error.message : String(_error)}`,
        `Please check session ID format and phase guide exists`,
      ],
    };
  }
}
