/**
 * Session-tier execution policy boundary.
 * Validation uses tierUp only: phase guide must have session entry; phase handoff is recommended.
 */

import type { TierStartValidationResult } from '../../shared/tier-start-workflow-types';
import { validateSession, formatSessionValidation } from '../composite/session';
import type { WorkflowCommandContext } from '../../../utils/command-context';
import { WorkflowId } from '../../../utils/id-utils';

export interface SessionExecutionPolicyValidateParams {
  sessionId: string;
  /** Built in session-start-impl before validate(); same paths as tier-start (feature from params, not git). */
  context: WorkflowCommandContext;
}

/** Session execution policy: validation and plan content. Hydration targets tierUp (phase) docs. */
export const sessionExecutionPolicy = {
  async validate(params: SessionExecutionPolicyValidateParams): Promise<TierStartValidationResult> {
    const validation = await validateSession(params.sessionId, { context: params.context });
    const validationMessage = formatSessionValidation(validation, params.sessionId);
    if (!validation.canStart) {
      return {
        canStart: false,
        validationMessage: '## Session Validation\n' + validationMessage,
      };
    }

    const parsed = WorkflowId.parseSessionId(params.sessionId);
    const hydrationWarnings: string[] = [];

    if (parsed) {
      try {
        const phaseGuide = await params.context.readPhaseGuide(parsed.phaseId);
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
