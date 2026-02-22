/**
 * Append child tier entry to parent document so new children are registered
 * when planning after a reopen. Idempotent: if child already exists, no-op.
 */

import type { TierName } from '../tiers/shared/types';
import type { WorkflowCommandContext } from './command-context';
import { readProjectFile, writeProjectFile } from './utils';
import { MarkdownUtils } from './markdown-utils';

export interface AppendChildResult {
  success: boolean;
  parentDocPath: string;
  alreadyExists: boolean;
  output: string[];
}

/**
 * Register a child tier in its parent doc if not already present.
 * Phase→Session: append session entry to phase guide.
 * Feature→Phase: append phase section to feature guide.
 * Session→Task: append task entry to session guide.
 */
export async function appendChildToParentDoc(
  parentTier: TierName,
  parentId: string,
  childId: string,
  childDescription: string,
  context: WorkflowCommandContext,
  childSummary?: string
): Promise<AppendChildResult> {
  const output: string[] = [];

  if (parentTier === 'phase') {
    const guidePath = context.paths.getPhaseGuidePath(parentId);
    try {
      let content = await readProjectFile(guidePath);
      const sessionHeading = `Session ${childId}:`;
      if (content.includes(sessionHeading)) {
        return { success: true, parentDocPath: guidePath, alreadyExists: true, output: [] };
      }
      const tasksPlaceholder = childSummary ?? '[To be planned]';
      const learningPlaceholder = childSummary ?? '[To be identified during planning]';
      const newEntry = `- [ ] ### Session ${childId}: ${childDescription}
**Description:** ${childDescription}
**Tasks:** ${tasksPlaceholder}
**Learning Goals:**
- ${learningPlaceholder}`;
      const lastSessionRegex = /(-?\s*\[[ x]\])?\s*###\s+Session\s+[\d.]+\s*:/g;
      let lastIndex = -1;
      let match: RegExpExecArray | null;
      while ((match = lastSessionRegex.exec(content)) !== null) {
        lastIndex = match.index;
      }
      if (lastIndex === -1) {
        const sessionsSectionMatch = content.match(/\n(##\s+Sessions?\s+Breakdown?|##\s+.*[Ss]ession)/);
        if (sessionsSectionMatch?.index != null) {
          const insertAt = content.indexOf('\n', sessionsSectionMatch.index) + 1;
          content = content.slice(0, insertAt) + newEntry + '\n\n' + content.slice(insertAt);
        } else {
          content = content + '\n\n' + newEntry;
        }
      } else {
        const afterMatch = content.indexOf('\n', lastIndex);
        const lineEnd = afterMatch === -1 ? content.length : afterMatch;
        let sectionEnd = content.length;
        const rest = content.slice(lineEnd);
        const nextSession = rest.match(/\n(-?\s*\[[ x]\])?\s*###\s+Session\s+/);
        const nextH2 = rest.match(/\n##\s+/);
        if (nextSession?.index != null) {
          sectionEnd = lineEnd + nextSession.index;
        } else if (nextH2?.index != null) {
          sectionEnd = lineEnd + nextH2.index;
        }
        content = content.slice(0, sectionEnd) + (content[sectionEnd - 1] === '\n' ? '' : '\n\n') + newEntry + content.slice(sectionEnd);
      }
      await writeProjectFile(guidePath, content);
      output.push(`Appended Session ${childId} to ${guidePath}`);
      return { success: true, parentDocPath: guidePath, alreadyExists: false, output };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, parentDocPath: guidePath, alreadyExists: false, output: [`Error: ${message}`] };
    }
  }

  if (parentTier === 'feature') {
    const guidePath = context.paths.getFeatureGuidePath();
    try {
      let guideContent = await readProjectFile(guidePath);
      if (guideContent.includes(`Phase ${childId}:`)) {
        return { success: true, parentDocPath: guidePath, alreadyExists: true, output: [] };
      }
      const phaseEntry = `- [ ] ### Phase ${childId}: ${childDescription}\n**Description:** ${childDescription}\n**Sessions:** [To be planned]\n**Success Criteria:**\n- [To be defined]`;
      guideContent = MarkdownUtils.appendToSection(guideContent, 'Phases Breakdown', phaseEntry)
        || guideContent + '\n\n' + phaseEntry;
      await writeProjectFile(guidePath, guideContent);
      output.push(`Appended Phase ${childId} to feature guide`);
      return { success: true, parentDocPath: guidePath, alreadyExists: false, output };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, parentDocPath: guidePath, alreadyExists: false, output: [`Error: ${message}`] };
    }
  }

  if (parentTier === 'session') {
    const guidePath = context.paths.getSessionGuidePath(parentId);
    try {
      let content = await readProjectFile(guidePath);
      const taskHeading = `Task ${childId}:`;
      if (content.includes(taskHeading)) {
        return { success: true, parentDocPath: guidePath, alreadyExists: true, output: [] };
      }
      const newEntry = `#### Task ${childId}: ${childDescription}`;
      content = content + '\n\n' + newEntry;
      await writeProjectFile(guidePath, content);
      output.push(`Appended Task ${childId} to ${guidePath}`);
      return { success: true, parentDocPath: guidePath, alreadyExists: false, output };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, parentDocPath: guidePath, alreadyExists: false, output: [`Error: ${message}`] };
    }
  }

  return {
    success: false,
    parentDocPath: '',
    alreadyExists: false,
    output: [`Unsupported parent tier for append: ${parentTier}`],
  };
}
