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
import { resolveFeatureDirectoryFromPlan } from './workflow-scope';
import { getCurrentBranch } from '../git/shared/git-manager';
import { WorkflowCommandContext } from './command-context';
import { getExcerptEndMarker } from '../tiers/shared/context-policy';

export interface MinimalHandoffUpdate {
  lastCompletedTask: string; // Format: X.Y.Z (e.g., "1.3.4") - last task completed
  nextSession: string; // Format: X.Y (e.g., "1.4") - next session to start
  transitionNotes?: string; // Minimal notes about what changed/where we left off
  sessionId?: string; // Current session ID (extracted from lastCompletedTask if not provided)
  featureName?: string; // Optional: resolved from .current-feature or git branch if not set
}

export async function updateHandoffMinimal(update: MinimalHandoffUpdate): Promise<void> {
  const featureName = await resolveFeatureDirectoryFromPlan(update.featureName);
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
  await context.documents.updateHandoff('session', sessionId, (content) => {
    const lines = content.split('\n');
    const statusIndex = lines.findIndex(line => line.trim().startsWith('##') && line.includes('Current Status'));
    const nextActionIndex = lines.findIndex(line => line.trim().startsWith('##') && line.includes('Next Action'));
    const transitionIndex = lines.findIndex(line => line.trim().startsWith('##') && line.includes('Transition Context'));
    const updatedLines: string[] = [];
    let i = 0;
    if (statusIndex !== -1) {
      updatedLines.push(...lines.slice(0, statusIndex));
    } else {
      updatedLines.push(...lines);
    }
    updatedLines.push(statusSection, '', nextActionSection, '', transitionSection, '', getExcerptEndMarker('session'), '');
    if (transitionIndex !== -1) {
      for (i = transitionIndex + 1; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('##') && (trimmed.includes('Current Status') || trimmed.includes('Next Action') || trimmed.includes('Transition Context'))) continue;
        updatedLines.push(lines[i]);
      }
    } else if (statusIndex !== -1 && nextActionIndex !== -1) {
      for (i = nextActionIndex + 1; i < lines.length; i++) {
        if (lines[i].trim().startsWith('##')) break;
      }
      if (i < lines.length) updatedLines.push(...lines.slice(i));
    }
    return updatedLines.join('\n').trimEnd();
  });
}

