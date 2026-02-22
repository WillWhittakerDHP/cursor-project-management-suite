/**
 * Tier config for session (X.Y.Z).
 * Used by tier-change, tier-validate, tier-complete, tier-checkpoint, tier-plan, tier-start, tier-end.
 * Control doc = phase guide; session status = checkbox for `- [x] ... Session X.Y.Z:` in that guide.
 */

import type { TierConfig } from '../shared/types';
import { WorkflowId } from '../../utils/id-utils';
import { appendLog } from '../../utils/append-log';
import { readProjectFile, writeProjectFile } from '../../utils/utils';
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
  controlDoc: {
    path: (ctx, id) => {
      const parsed = WorkflowId.parseSessionId(id);
      return parsed ? ctx.paths.getPhaseGuidePath(parsed.phaseId) : ctx.paths.getPhaseGuidePath('');
    },
    readStatus: async (ctx: WorkflowCommandContext, id: string): Promise<string | null> => {
      try {
        const parsed = WorkflowId.parseSessionId(id);
        if (!parsed) return null;
        const guidePath = ctx.paths.getPhaseGuidePath(parsed.phaseId);
        const content = await readProjectFile(guidePath);
        const re = new RegExp(`- \\[x\\].*?Session ${id.replace(/\./g, '\\.')}:`, 'i');
        return re.test(content) ? 'complete' : 'not complete';
      } catch {
        return null;
      }
    },
    writeStatus: async (
      ctx: WorkflowCommandContext,
      id: string,
      newStatus: string
    ): Promise<void> => {
      const parsed = WorkflowId.parseSessionId(id);
      if (!parsed) return;
      const guidePath = ctx.paths.getPhaseGuidePath(parsed.phaseId);
      let content = await readProjectFile(guidePath);
      const escaped = id.replace(/\./g, '\\.');
      const isComplete = newStatus.toLowerCase() === 'complete';
      const linePattern = new RegExp(
        `^(\\s*- \\[)([ x])(\\].*?Session )${escaped}:([^\n]*)`,
        'gm'
      );
      content = content.replace(linePattern, (_, open, _box, mid, rest) => {
        const box = isComplete ? 'x' : ' ';
        return `${open}${box}${mid}${id}:${rest}`;
      });
      await writeProjectFile(guidePath, content);
    },
  },
  updateLog: async (context: WorkflowCommandContext, identifier: string, logEntry: string) => {
    await appendLog(logEntry, identifier, context.paths.getFeatureName());
  },
  replanCommand: undefined, // Set by tier-change when planSession is passed
  getParentBranchName: (ctx, id) =>
    `${ctx.feature.name}-phase-${WorkflowId.extractPhaseId(id) ?? '1'}`,
  getBranchName: (ctx, id) =>
    `${ctx.feature.name}-phase-${WorkflowId.extractPhaseId(id) ?? '1'}-session-${id}`,
};
