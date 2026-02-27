/**
 * Task plan implementation. Used by tier-plan and by plan-task (thin wrapper).
 */

import { resolvePlanningDescription } from '../../../planning/utils/resolve-planning-description';
import { runPlanningWithChecks } from '../../../planning/utils/run-planning-pipeline';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { WorkflowId } from '../../../utils/id-utils';
import { resolveFeatureName, resolveFeatureId } from '../../../utils/feature-context';

export async function planTaskImpl(
  taskId: string,
  description?: string,
  featureId?: string
): Promise<string> {
  const feature = featureId != null && featureId.trim() !== ''
    ? await resolveFeatureId(featureId)
    : await resolveFeatureName();
  const context = new WorkflowCommandContext(feature);
  const output: string[] = [];

  const parsed = WorkflowId.parseTaskId(taskId);
  if (!parsed) {
    return 'Error: Invalid task ID format. Expected X.Y.Z.A (e.g., 4.1.3.1)';
  }
  const sessionId = parsed.sessionId;
  const phaseNum = Number(parsed.feature);

  const resolvedDescription = await resolvePlanningDescription({
    tier: 'task',
    identifier: taskId,
    feature,
    context,
    description,
  });
  output.push(`# Task Planning: ${taskId}\n`);
  output.push(`**Description:** ${resolvedDescription}\n`);
  output.push('---\n');

  output.push('## Planning Checks\n');
  output.push('**Running planning checks...**\n');
  try {
    const planningOutput = await runPlanningWithChecks({
      description: resolvedDescription,
      tier: 'task',
      feature,
      phase: phaseNum,
      sessionId,
      taskId,
      docCheckType: 'component',
    });
    output.push(planningOutput);
    output.push('\n---\n');
  } catch (_error) {
    output.push(`⚠️ **Warning: Planning checks failed**\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push(`**Note:** Continuing with task planning despite planning check failure.\n`);
    output.push('\n---\n');
  }

  const sessionGuidePath = context.paths.getSessionGuidePath(sessionId);
  try {
    let sessionGuideContent = await context.readSessionGuide(sessionId);
    const escapedTaskId = taskId.replace(/\./g, '\\.');
    const taskSectionPattern = new RegExp(`(?:- \\[[ x]\\])?\\s*(?:####|###) Task ${escapedTaskId}:.*?(?=(?:- \\[|#### Task|### Task|## |$))`, 's');
    const taskSectionMatch = sessionGuideContent.match(taskSectionPattern);
    const taskSection = taskSectionMatch ? taskSectionMatch[0] : '';

    const extractField = (name: string): string => {
      const re = new RegExp(`\\*\\*${name}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*|\\n\\n|$)`, 'i');
      const m = taskSection.match(re);
      return m ? m[1].trim() : '';
    };
    const goal = extractField('Goal');
    const files = extractField('Files');
    const approach = extractField('Approach');
    const checkpoint = extractField('Checkpoint');
    const needsFill = /\[Fill in\]|\[Files to work with\]|\[What needs to be verified\]/i.test(taskSection)
      || !goal || !approach || !checkpoint;

    if (taskSectionMatch) {
      output.push('## Task Section Found\n');
      if (needsFill) {
        output.push('**Implementation plan fields need to be filled in.**\n');
        output.push('Fill in **Goal**, **Files**, **Approach**, and **Checkpoint** in the session guide for this task. Then run `/task-start ' + taskId + '` to begin implementation.\n');
      } else {
        output.push('## Implementation Plan\n');
        output.push('This is the plan task-start will use as marching orders for coding:\n\n');
        output.push('**Goal:** ' + goal + '\n\n');
        output.push('**Files:**\n' + (files || '(none specified)') + '\n\n');
        output.push('**Approach:** ' + approach + '\n\n');
        output.push('**Checkpoint:** ' + checkpoint + '\n\n');
        output.push('Run `/task-start ' + taskId + '` to begin implementation.\n');
      }
      if (!needsFill) {
        output.push('\n---\n');
      }
    } else {
      output.push('## Task Section Not Found\n');
      output.push('**Adding new task section to session guide...**\n');
      const newTaskSection = `\n### Task ${taskId}: ${resolvedDescription}
**Goal:** [Fill in task goal]
**Files:** 
- [Files to work with]
**Approach:** [Fill in approach]
**Checkpoint:** [What needs to be verified]
`;
      sessionGuideContent += newTaskSection;
      await context.documents.writeGuide('session', sessionId, sessionGuideContent);
      output.push('**New task section added to session guide.** Fill in goal, files, approach, and checkpoint, then run `/task-start ' + taskId + '`.\n');
    }

    output.push('\n---\n');
  } catch (error) {
    output.push('## Session Guide Not Found\n');
    output.push(`**ERROR: Session guide not found**\n`);
    output.push(`**Attempted:** ${sessionGuidePath}\n`);
    output.push(`**Expected:** Session guide file for session ${sessionId}\n`);
    output.push(`**Suggestion:** Create it first using \`/plan-session ${sessionId}\`\n`);
    output.push(`**Template:** Use \`.cursor/commands/tiers/session/templates/session-guide.md\` as a starting point\n`);
    output.push(`**Tier:** Task (Tier 3 - Low-Level)\n`);
    output.push(`**Error Details:** ${error instanceof Error ? error.message : String(error)}\n`);
  }

  output.push('\n---\n');
  output.push('## Task Planning Checklist\n');
  output.push('- [ ] Files identified\n');
  output.push('- [ ] Approach defined\n');
  output.push('- [ ] Checkpoint criteria set\n');
  output.push('- [ ] Task todo created\n');

  return output.join('\n');
}
