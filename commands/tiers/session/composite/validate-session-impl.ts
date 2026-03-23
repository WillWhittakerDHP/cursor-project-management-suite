/**
 * Session validation implementation. Used by tier-validate and by validate-session (thin wrapper).
 */

import { WorkflowCommandContext } from '../../../utils/command-context';
import { getCurrentBranch, branchExists, isBranchBasedOn } from '../../../git/shared/git-manager';
import { WorkflowId } from '../../../utils/id-utils';
import { SESSION_CONFIG } from '../../configs/session';
import { PHASE_CONFIG } from '../../configs/phase';

export interface ValidateSessionResult {
  canStart: boolean;
  reason: string;
  details: string[];
}

export async function validateSessionImpl(
  sessionId: string,
  context: WorkflowCommandContext
): Promise<ValidateSessionResult> {
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
  // WHY: Caller passes WorkflowCommandContext from session-start (or runTierValidate resolves via featureId/featureName).

  try {
    const phaseGuidePath = context.paths.getPhaseGuidePath(phase);
    let phaseGuideContent = '';
    try {
      phaseGuideContent = await context.documents.readGuide('phase', phase);
    } catch {
      return {
        canStart: false,
        reason: 'Phase guide not found',
        details: [
          `Phase guide does not exist or is unreadable at: ${phaseGuidePath}`,
          `Create the phase guide first using /phase-plan ${phase}`,
        ],
      };
    }

    const escapedSessionId = sessionId.replace(/\./g, '\\.');
    const sessionIsListedInPhaseGuide = new RegExp(`\\bSession\\s+${escapedSessionId}(?::|\\b)`, 'i').test(phaseGuideContent);
    if (!sessionIsListedInPhaseGuide) {
      const [hasSessionGuide, hasSessionLog, hasSessionHandoff] = await Promise.all([
        context.documents.guideExists('session', sessionId),
        context.documents
          .readLog('session', sessionId)
          .then(() => true)
          .catch(() => false),
        context.documents
          .readHandoff('session', sessionId)
          .then(() => true)
          .catch(() => false),
      ]);
      if (!hasSessionGuide && !hasSessionLog && !hasSessionHandoff) {
        return {
          canStart: false,
          reason: 'Session is not documented',
          details: [
            `Session ${sessionId} is not listed in phase ${phase} guide`,
            `No session guide/log/handoff exists for ${sessionId}`,
            `Add Session ${sessionId} to phase ${phase} guide before starting it`,
          ],
        };
      }
    }

    const sessionStatus = await SESSION_CONFIG.controlDoc.readStatus(context, sessionId);
    if (sessionStatus === 'complete') {
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

    const sessionBranchName = SESSION_CONFIG.getBranchName(context, sessionId);
    if (sessionBranchName) {
      const sessionBranchFound = await branchExists(sessionBranchName);
      const currentBranch = await getCurrentBranch();

      if (sessionBranchFound) {
        if (currentBranch === sessionBranchName) {
          return {
            canStart: true,
            reason: 'Session branch is current',
            details: [
              `Session ${sessionId} branch exists and is current: ${sessionBranchName}`,
              `Proceeding with session-start (branch step will no-op).`,
            ],
          };
        }

        const parentBranch = SESSION_CONFIG.getParentBranchName(context, sessionId);
        if (parentBranch && (await branchExists(parentBranch))) {
          const properlyBased = await isBranchBasedOn(sessionBranchName, parentBranch);
          if (properlyBased) {
            return {
              canStart: true,
              reason: 'Session branch exists with valid parentage',
              details: [
                `Session ${sessionId} branch exists: ${sessionBranchName}`,
                `Branch is properly based on ${parentBranch} — will switch to it.`,
              ],
            };
          }
          return {
            canStart: false,
            reason: 'Session branch exists but has diverged',
            details: [
              `Session branch exists: ${sessionBranchName}`,
              `But it is NOT based on parent branch ${parentBranch} (diverged or orphaned).`,
              `Rebase onto parent: git rebase ${parentBranch} ${sessionBranchName}`,
              `Or delete and recreate: git branch -D ${sessionBranchName}`,
            ],
          };
        }

        return {
          canStart: true,
          reason: 'Session branch exists (parent not verifiable)',
          details: [
            `Session ${sessionId} branch exists: ${sessionBranchName}`,
            `Parent branch could not be verified — will switch to existing branch.`,
          ],
        };
      }
    }

    if (sessionNum > 1) {
      const previousSessionId = `${phase}.${sessionNum - 1}`;
      const previousSessionStatus = await SESSION_CONFIG.controlDoc.readStatus(context, previousSessionId);
      if (previousSessionStatus !== 'complete') {
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

    const phaseStatus = await PHASE_CONFIG.controlDoc.readStatus(context, phase);
    if (phaseStatus !== null) {
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

    const branchDetail = sessionBranchName
      ? `Session ${sessionId} branch will be created`
      : `Work stays on feature branch feature/${context.feature.name}`;
    return {
      canStart: true,
      reason: 'Session can be started',
      details: [
        `Session ${sessionId} is not completed`,
        branchDetail,
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
