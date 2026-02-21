/**
 * Tier config for phase (X.Y).
 * Used by tier-change, tier-validate, tier-complete, tier-checkpoint, tier-plan, tier-start, tier-end.
 */

import type { TierConfig } from '../shared/types';
import { WorkflowId } from '../../utils/id-utils';
import { readProjectFile, writeProjectFile } from '../../utils/utils';
import type { WorkflowCommandContext } from '../../utils/command-context';

const CHANGE_REQUESTS_MARKER = '## Change Requests';
const COMPLETED_SESSIONS_MARKER = '## Completed Sessions';

export const PHASE_CONFIG: TierConfig = {
  name: 'phase',
  idFormat: 'X.Y',
  parseId: (id: string) => WorkflowId.parsePhaseId(id),
  paths: {
    guide: (ctx, id) => ctx.paths.getPhaseGuidePath(id),
    log: (ctx, id) => ctx.paths.getPhaseLogPath(id),
    handoff: (ctx, id) => ctx.paths.getPhaseHandoffPath(id),
  },
  updateLog: async (context: WorkflowCommandContext, identifier: string, logEntry: string) => {
    const phaseLogPath = context.paths.getPhaseLogPath(identifier);
    let logContent = await readProjectFile(phaseLogPath);
    if (logContent.includes(CHANGE_REQUESTS_MARKER)) {
      const sections = logContent.split(CHANGE_REQUESTS_MARKER);
      logContent =
        sections[0] +
        CHANGE_REQUESTS_MARKER +
        '\n\n' +
        logEntry +
        '\n' +
        sections.slice(1).join(CHANGE_REQUESTS_MARKER);
    } else if (logContent.includes(COMPLETED_SESSIONS_MARKER)) {
      const sections = logContent.split(COMPLETED_SESSIONS_MARKER);
      logContent =
        sections[0] +
        CHANGE_REQUESTS_MARKER +
        '\n\n' +
        logEntry +
        '\n\n' +
        COMPLETED_SESSIONS_MARKER +
        sections.slice(1).join(COMPLETED_SESSIONS_MARKER);
    } else {
      logContent += `\n\n${CHANGE_REQUESTS_MARKER}\n\n${logEntry}`;
    }
    await writeProjectFile(phaseLogPath, logContent);
  },
  replanCommand: undefined, // Set by tier-change when planPhase is passed
};
