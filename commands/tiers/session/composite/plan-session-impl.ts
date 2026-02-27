/**
 * Session plan implementation. Used by tier-plan and by plan-session (thin wrapper).
 */

import { resolvePlanningDescription } from '../../../planning/utils/resolve-planning-description';
import { runPlanningWithChecks } from '../../../planning/utils/run-planning-pipeline';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { WorkflowId } from '../../../utils/id-utils';
import { resolveFeatureName } from '../../../utils';
import { appendChildToParentDoc } from '../../../utils/append-child-to-parent';
import { readProjectFile } from '../../../utils/utils';

export async function planSessionImpl(
  sessionId: string,
  description?: string,
  featureName?: string,
  planContent?: string
): Promise<string> {
  const feature = await resolveFeatureName(featureName);
  const context = new WorkflowCommandContext(feature);
  const output: string[] = [];

  if (!WorkflowId.isValidSessionId(sessionId)) {
    return `Error: Invalid session ID format. Expected X.Y.Z (e.g., 4.1.3)\nAttempted: ${sessionId}`;
  }

  const resolvedDescription = await resolvePlanningDescription({
    tier: 'session',
    identifier: sessionId,
    feature,
    context,
    description,
  });
  output.push(`# Session Planning: ${sessionId}\n`);
  output.push(`**Description:** ${resolvedDescription}\n`);
  output.push('---\n');

  const parsed = WorkflowId.parseSessionId(sessionId);
  if (parsed) {
    const appendResult = await appendChildToParentDoc(
      'phase',
      parsed.phaseId,
      sessionId,
      resolvedDescription,
      context
    );
    if (appendResult.success && !appendResult.alreadyExists) {
      output.push(`**Registered:** Session ${sessionId} added to phase ${parsed.phaseId} guide\n`);
    }
  }

  output.push('## Planning with Checks\n');
  output.push(planContent
    ? '**Critique mode:** Reviewing your plan for documentation and pattern reuse.\n'
    : '**Using planning abstraction for documentation and pattern reuse checks:**\n');
  const phaseNum = parsed ? Number(parsed.feature) : undefined;
  const planningOutput = await runPlanningWithChecks({
    description: resolvedDescription,
    tier: 'session',
    feature,
    phase: phaseNum,
    sessionId,
    docCheckType: 'component',
  });
  output.push(planningOutput);
  if (planContent) {
    output.push('\n**Planning Review:** Suggestions above do not overwrite your authored plan.\n');
  }
  output.push('\n---\n');

  const sessionGuidePath = context.paths.getSessionGuidePath(sessionId);

  let existingGuide: string | null = null;
  try {
    existingGuide = await readProjectFile(sessionGuidePath);
  } catch { /* guide does not exist yet */ }

  let sessionGuideContent: string;
  if (existingGuide && !planContent) {
    sessionGuideContent = existingGuide;
    output.push('## Session Guide\n');
    output.push('**Exists:** `' + sessionGuidePath + '` (not overwritten)\n');
    output.push('\n---\n');
  } else {
    if (planContent) {
      sessionGuideContent = planContent;
    } else {
      try {
        sessionGuideContent = await context.templates.loadTemplate('session', 'guide');
        sessionGuideContent = context.templates.render(sessionGuideContent, {
          SESSION_ID: sessionId,
          DESCRIPTION: resolvedDescription,
          DATE: new Date().toISOString().split('T')[0],
        });
      } catch (_error) {
        const templatePath = context.paths.getTemplatePath('session', 'guide');
        throw new Error(
          `ERROR: Session guide template not found\n` +
            `Attempted: ${templatePath}\n` +
            `Expected: Session guide template file\n` +
            `Suggestion: Create template at ${templatePath}\n` +
            `Tier: Session (Tier 2 - Medium-Level)\n` +
            `Error: ${_error instanceof Error ? _error.message : String(_error)}\n` +
            `Action Required: Create the session guide template file before proceeding.`
        );
      }
      if (!sessionGuideContent) {
        throw new Error(`Session guide template is empty after loading from ${context.paths.getTemplatePath('session', 'guide')}`);
      }
    }

    output.push('## Session Guide\n');
    output.push('**Created:** `' + sessionGuidePath + '`\n');
    output.push(planContent ? '**Source:** Your authored plan content\n' : '**Template:** Based on `.cursor/commands/tiers/session/templates/session-guide.md`\n');
    output.push('```markdown\n');
    output.push(sessionGuideContent);
    output.push('```\n');

    try {
      await context.documents.writeGuide('session', sessionId, sessionGuideContent);
      output.push('\n**Session guide file created successfully.**\n');
      output.push('\n---\n');
    } catch (error) {
      output.push('\n**ERROR: Could not create session guide file automatically**\n');
      output.push(`**Attempted:** ${sessionGuidePath}\n`);
      output.push(`**Expected:** Session guide file for session ${sessionId}\n`);
      output.push(`**Suggestion:** Create it manually using \`.cursor/commands/tiers/session/templates/session-guide.md\` as a template\n`);
      output.push(`**Tier:** Session (Tier 2 - Medium-Level)\n`);
      output.push(`**Error Details:** ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  output.push('\n## Decomposition (Session → Tasks)\n');
  try {
    const guideContent = sessionGuideContent || (await context.readSessionGuide(sessionId).catch(() => ''));
    const taskMatches = guideContent.matchAll(/(?:####|###)\s+Task\s+(\d+\.\d+\.\d+\.\d+):/g);
    const taskIds: string[] = [];
    for (const m of taskMatches) {
      if (WorkflowId.parseTaskId(m[1])) taskIds.push(m[1]);
    }
    if (taskIds.length === 0) {
      const firstTaskId = `${sessionId}.1`;
      const appendResult = await appendChildToParentDoc(
        'session',
        sessionId,
        firstTaskId,
        resolvedDescription.slice(0, 150) || `Task 1`,
        context
      );
      if (appendResult.success && !appendResult.alreadyExists) {
        output.push(`**Scaffolded:** Task ${firstTaskId} added to session guide.\n`);
      }
    }
    const tasksList = taskIds.length > 0 ? taskIds : ([`${sessionId}.1`] as string[]);
    output.push(`**Tasks:** ${tasksList.join(', ')}\n`);
    output.push('Refine goal, files, approach, and checkpoint for each task in the session guide before session-start cascades to task-start.\n');
    output.push('\n**Next:** Run `/session-start ' + sessionId + '`; after confirmation, cascade to `/task-start ' + (tasksList[0] || `${sessionId}.1`) + '`.\n');
  } catch (_error) {
    output.push(`**Warning:** Decomposition step failed: ${_error instanceof Error ? _error.message : String(_error)}\n`);
  }
  output.push('\n---\n');
  output.push('## Test Strategy\n');
  output.push('**Document test requirements for this session:**\n');
  output.push('- [ ] Test strategy defined\n');
  output.push('- [ ] Test requirements documented in session guide\n');
  output.push('- [ ] Test todos created (if tests required)\n');
  output.push('- [ ] Test justification documented (if tests deferred)\n');
  output.push('\n**Note:** Tests should be created during implementation or documented justification if deferred.\n');
  output.push('If tests are deferred, document:\n');
  output.push('- Why tests are deferred\n');
  output.push('- When tests will be added (which phase/session)\n');
  output.push('- Test requirements for future implementation\n');

  return output.join('\n');
}
