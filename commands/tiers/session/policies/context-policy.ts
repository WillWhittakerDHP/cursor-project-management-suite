/**
 * Session-tier context policy boundary.
 * Context gathering and read handoff/guide; preserves step order and parity.
 */

import { WorkflowCommandContext } from '../../../utils/command-context';
import type { TierStartReadResult } from '../../shared/tier-start-workflow-types';
import { generateCurrentStateSummary } from '../../../utils/context-gatherer';
import { formatAutoGatheredContext } from '../../../utils/context-templates';
import { readHandoff } from '../../../utils/read-handoff';
import { createSessionLabel, formatSessionLabel } from '../atomic/create-session-label';
import { WorkflowId } from '../../../utils/id-utils';
import { readProjectFile, writeProjectFile } from '../../../utils/utils';

async function ensureSessionScaffold(
  context: WorkflowCommandContext,
  sessionId: string,
  resolvedDescription: string
): Promise<void> {
  try {
    await context.readSessionGuide(sessionId);
  } catch {
    try {
      const template = await context.templates.loadTemplate('session', 'guide');
      const rendered = context.templates.render(template, {
        SESSION_ID: sessionId,
        DESCRIPTION: resolvedDescription,
        DATE: new Date().toISOString().split('T')[0],
      });
      await context.documents.writeGuide('session', sessionId, rendered);
    } catch {
      // non-blocking: validation gate will still block low-quality context
    }
  }

  const sessionLogPath = context.paths.getSessionLogPath(sessionId);
  try {
    await readProjectFile(sessionLogPath);
  } catch {
    try {
      await writeProjectFile(
        sessionLogPath,
        `# Session ${sessionId} Log: ${resolvedDescription}\n\n` +
          '**Status:** In Progress\n' +
          `**Date:** ${new Date().toISOString().split('T')[0]}\n\n` +
          '---\n\n' +
          '## Session Goal\n\n[Document concrete session goal]\n'
      );
    } catch {
      // non-blocking
    }
  }
}

export interface SessionContextPolicyGatherParams {
  context: WorkflowCommandContext;
  sessionId: string;
  resolvedDescription: string;
}

export interface SessionContextPolicyReadParams {
  sessionId: string;
  resolvedDescription: string;
}

/**
 * Session context policy: planning uses tierUp only (phase guide + phase handoff).
 * Session handoff, session guide, and session log are excluded from planning input;
 * session plan is generated from phase context.
 */
export const sessionContextPolicy = {
  async readContext(params: SessionContextPolicyReadParams): Promise<TierStartReadResult> {
    const context = await WorkflowCommandContext.getCurrent();
    await ensureSessionScaffold(context, params.sessionId, params.resolvedDescription);
    const labelObj = createSessionLabel(params.sessionId, params.resolvedDescription);
    const label = formatSessionLabel(labelObj);

    const parsed = WorkflowId.parseSessionId(params.sessionId);
    let phaseGuideSessionEntry = '';
    let phaseHandoffContent = '';
    if (parsed) {
      try {
        const phaseGuide = await context.readPhaseGuide(parsed.phaseId);
        const escaped = params.sessionId.replace(/\./g, '\\.');
        const phaseSessionRegex = new RegExp(
          `(?:-\\s*\\[[ x]\\]\\s*)?###\\s*Session\\s+${escaped}:[\\s\\S]*?(?=(?:\\n(?:-\\s*\\[[ x]\\]\\s*)?###\\s*Session\\s+\\d+\\.\\d+\\.\\d+:)|\\n##\\s+|\\n#\\s+|$)`,
          'i'
        );
        const match = phaseGuide.match(phaseSessionRegex);
        if (match?.[0]) {
          phaseGuideSessionEntry = match[0].trim();
        }
      } catch {
        phaseGuideSessionEntry = '**Warning:** Phase guide context not found for this session.';
      }
      try {
        phaseHandoffContent = await readHandoff('phase', parsed.phaseId);
      } catch {
        phaseHandoffContent = '**Warning:** Phase handoff not found.';
      }
    }

    const handoff = [
      '## Transition Context (tierUp: phase)',
      '**Where we left off and what you need to start:**',
      '',
      phaseHandoffContent.trim() ? `## Phase Handoff (${parsed?.phaseId ?? '—'})\n\n${phaseHandoffContent.trim().slice(0, 1200)}${phaseHandoffContent.length > 1200 ? '\n\n*(excerpt truncated)*' : ''}` : '',
      '',
    ].filter(Boolean).join('\n\n');

    const guide = phaseGuideSessionEntry
      ? `## Session intent from phase guide\n\n${phaseGuideSessionEntry}`
      : '**No phase guide session entry found.** Session plan will be generated from phase handoff.';

    return {
      label,
      handoff: handoff || undefined,
      guide,
      sectionTitle: 'Session intent (from phase guide)',
      sourcePolicy: 'tierUpOnly',
    };
  },

  async gatherContext(params: SessionContextPolicyGatherParams): Promise<string> {
    try {
      const summary = await generateCurrentStateSummary(
        params.sessionId,
        params.context.feature.name
      );
      if (
        summary.filesStatus.length > 0 ||
        summary.implementationStatus.done.length > 0 ||
        summary.implementationStatus.missing.length > 0
      ) {
        return formatAutoGatheredContext(summary);
      }
    } catch {
      // non-blocking
    }
    return '';
  },
};
