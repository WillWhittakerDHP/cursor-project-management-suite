/**
 * Tier config for session (X.Y.Z).
 * Used by tier-change, tier-validate, tier-complete, tier-checkpoint, tier-plan, tier-start, tier-end.
 */

import type { TierConfig } from '../shared/types';
import { WorkflowId } from '../../utils/id-utils';
import { appendLog } from '../../utils/append-log';
import type { WorkflowCommandContext } from '../../utils/command-context';

export const SESSION_CONFIG: TierConfig = {
  name: 'session',
  idFormat: 'X.Y.Z',
  parseId: (id: string) => WorkflowId.parseSessionId(id),
  paths: {
    guide: (ctx, id) => ctx.paths.getSessionGuidePath(id),
    log: (ctx, id) => ctx.paths.getSessionLogPath(id),
    handoff: (ctx, id) => ctx.paths.getSessionHandoffPath(id),
  },
  updateLog: async (context: WorkflowCommandContext, identifier: string, logEntry: string) => {
    await appendLog(logEntry, identifier, context.paths.getFeatureName());
  },
  replanCommand: undefined, // Set by tier-change when planSession is passed
};
