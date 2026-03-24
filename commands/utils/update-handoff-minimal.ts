/**
 * Atomic Command: /update-handoff-minimal
 * Update session handoff document with minimal transition context only
 *
 * Tier: Session (Tier 2 - Medium-Level)
 * Operates on: Session handoff document (transition context between sessions)
 *
 * Focus: Where we left off, what's next (not instructions or detailed notes)
 */

import { getCurrentDate } from './utils';
import { resolveFeatureDirectoryFromPlan, resolveFeatureDirectoryOrActive } from './workflow-scope';
import { getCurrentBranch } from '../git/shared/git-manager';
import { WorkflowCommandContext } from './command-context';
import { getExcerptEndMarker } from '../tiers/shared/context-policy';

export interface MinimalHandoffUpdate {
  lastCompletedTask: string;
  nextSession: string;
  transitionNotes?: string;
  sessionId?: string;
  featureName?: string;
}

function isLevel2Heading(line: string): boolean {
  return /^##\s+/.test(line.trim());
}

function managedSessionHandoffHeading(line: string): boolean {
  const t = line.trim().replace(/^##\s+/, '');
  return (
    t.startsWith('Current Status') ||
    t.startsWith('Next Action') ||
    t.startsWith('Transition Context')
  );
}

/** Remove all ## Current Status / Next Action / Transition Context blocks and duplicate excerpt markers. */
function stripManagedSessionHandoffSections(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isLevel2Heading(line) && managedSessionHandoffHeading(line)) {
      i++;
      while (i < lines.length && !isLevel2Heading(lines[i])) {
        i++;
      }
      continue;
    }
    if (line.trim() === '<!-- end excerpt session -->') {
      i++;
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function findInsertIndexForSessionHandoffExcerpt(stripped: string): number {
  const anchors: RegExp[] = [
    /\n## Document Structure Guidelines/m,
    /\n## Maintenance/m,
    /\n## Related Documents/m,
    /\n## Notes/m,
  ];
  let best = -1;
  for (const re of anchors) {
    const m = stripped.search(re);
    if (m >= 0 && (best < 0 || m < best)) {
      best = m;
    }
  }
  if (best >= 0) {
    return best;
  }
  const dash = stripped.search(/\n---\s*\n/);
  if (dash >= 0) {
    const rest = stripped.slice(dash);
    const nextHeading = rest.search(/\n##\s+/);
    if (nextHeading >= 0) {
      return dash + nextHeading;
    }
  }
  return stripped.length;
}

export async function updateHandoffMinimal(update: MinimalHandoffUpdate): Promise<void> {
  const featureName = await resolveFeatureDirectoryOrActive(update.featureName);
  const context = new WorkflowCommandContext(featureName);
  const sessionId = update.sessionId || update.lastCompletedTask.split('.').slice(0, 2).join('.');
  await context.documents.ensureHandoff('session', sessionId, `Session ${sessionId}`);
  const branch = await getCurrentBranch();
  const date = getCurrentDate();
  const statusSection = `## Current Status

**Last Completed:** Task ${update.lastCompletedTask}
**Next Session:** Session ${update.nextSession}
**Git Branch:** \`${branch}\`
**Last Updated:** ${date}`;
  const nextActionSection = `## Next Action

Start Session ${update.nextSession} (see session guide and phase guide for scope).`;
  const transitionSection = update.transitionNotes
    ? `## Transition Context

**Where we left off:**
${update.transitionNotes}

**What you need to start:**
- Review Task ${update.lastCompletedTask} completion
- Begin Session ${update.nextSession}`
    : `## Transition Context

**Where we left off:**
Completed Task ${update.lastCompletedTask}

**What you need to start:**
- Begin Session ${update.nextSession}`;
  const excerptBlock = `${statusSection}\n\n${nextActionSection}\n\n${transitionSection}\n\n${getExcerptEndMarker('session')}`;

  await context.documents.updateHandoff('session', sessionId, content => {
    const stripped = stripManagedSessionHandoffSections(content);
    const insertAt = findInsertIndexForSessionHandoffExcerpt(stripped);
    const before = stripped.slice(0, insertAt).trimEnd();
    const after = stripped.slice(insertAt).trimStart();
    const mid = excerptBlock;
    if (!after) {
      return `${before}\n\n${mid}\n`.trimEnd();
    }
    return `${before}\n\n${mid}\n\n${after}`.trimEnd();
  });
}
