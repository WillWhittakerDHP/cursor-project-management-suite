/**
 * Session-tier execution policy boundary.
 * Validation uses tierUp only: phase guide must have session entry; phase handoff is recommended.
 */

import type { TierStartValidationResult } from '../../shared/tier-start-workflow-types';
import { validateSession, formatSessionValidation } from '../composite/session';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { WorkflowId } from '../../../utils/id-utils';

export interface SessionExecutionPolicyValidateParams {
  sessionId: string;
}

/** Session execution policy: validation and plan content. Hydration targets tierUp (phase) docs. */
export const sessionExecutionPolicy = {
  async validate(params: SessionExecutionPolicyValidateParams): Promise<TierStartValidationResult> {
    const validation = await validateSession(params.sessionId);
    const validationMessage = formatSessionValidation(validation, params.sessionId);
    if (!validation.canStart) {
      return {
        canStart: false,
        validationMessage: '## Session Validation\n' + validationMessage,
      };
    }

    // Resolve feature from sessionId (e.g. 6.9.2 -> phase 6.9 -> appointment-workflow) so phase guide
    // is read from the correct feature dir regardless of current branch.
    const context = await WorkflowCommandContext.contextFromParams('session', { sessionId: params.sessionId });
    const parsed = WorkflowId.parseSessionId(params.sessionId);
    const hydrationWarnings: string[] = [];

    if (parsed) {
      try {
        const phaseGuide = await context.readPhaseGuide(parsed.phaseId);
        const escaped = params.sessionId.replace(/\./g, '\\.');
        const hasSessionEntry = new RegExp(
          `(?:-\\s*\\[[ x]\\]\\s*)?###\\s*Session\\s+${escaped}:`,
          'i'
        ).test(phaseGuide);
        if (!hasSessionEntry) {
          hydrationWarnings.push('Phase guide has no session entry for this session (tierUp context required).');
        }
      } catch {
        hydrationWarnings.push('Phase guide not found (tierUp context required).');
      }
    } else {
      hydrationWarnings.push('Could not parse session ID for phase lookup.');
    }

    if (hydrationWarnings.length > 0) {
      return {
        canStart: false,
        validationMessage:
          '## Session Validation\n' +
          validationMessage +
          '\n\n## TierUp Context Required\n' +
          hydrationWarnings.map(i => `- ${i}`).join('\n') +
          '\n\nEnsure phase guide has a session entry for this session and phase handoff exists, then re-run /session-start.',
      };
    }

    return {
      canStart: true,
      validationMessage: '## Session Validation\n' + validationMessage,
    };
  },
};
