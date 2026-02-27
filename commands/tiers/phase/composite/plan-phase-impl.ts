/**
 * Phase plan implementation. Used by tier-plan and by phase-plan (thin wrapper).
 */

import { resolvePlanningDescription } from '../../../planning/utils/resolve-planning-description';
import { runPlanningWithChecks } from '../../../planning/utils/run-planning-pipeline';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { MarkdownUtils } from '../../../utils/markdown-utils';
import { resolveFeatureName, resolveFeatureId } from '../../../utils/feature-context';
import { appendChildToParentDoc } from '../../../utils/append-child-to-parent';
import { readProjectFile } from '../../../utils/utils';
import { WorkflowId } from '../../../utils/id-utils';

export async function planPhaseImpl(
  phaseId: string,
  description?: string,
  featureId?: string,
  planContent?: string
): Promise<string> {
  const feature = featureId != null && featureId.trim() !== ''
    ? await resolveFeatureId(featureId)
    : await resolveFeatureName();
  const context = new WorkflowCommandContext(feature);
  const output: string[] = [];
  const phase = phaseId;

  output.push(`# Phase Planning: ${phase}\n`);

  const resolvedDescription = await resolvePlanningDescription({
    tier: 'phase',
    identifier: phaseId,
    feature,
    context,
    description,
  });
  output.push(`**Description:** ${resolvedDescription}\n`);
  output.push('---\n');

  const appendResult = await appendChildToParentDoc(
    'feature',
    feature,
    phaseId,
    resolvedDescription,
    context
  );
  if (appendResult.success && !appendResult.alreadyExists) {
    output.push(`**Registered:** Phase ${phaseId} added to feature plan/guide\n`);
  }

  output.push('## Planning with Checks\n');
  output.push(planContent
    ? '**Critique mode:** Reviewing your plan for documentation and pattern reuse.\n'
    : '**Using planning abstraction for documentation and pattern reuse checks:**\n');
  const phaseNum = Number(phase.split('.')[0]) || parseInt(phase, 10) || 1;
  const planningOutput = await runPlanningWithChecks({
    description: resolvedDescription,
    tier: 'phase',
    feature,
    phase: phaseNum,
    docCheckType: 'migration',
  });
  output.push(planningOutput);
  if (planContent) {
    output.push('\n**Planning Review:** Suggestions above do not overwrite your authored plan.\n');
  }
  output.push('\n---\n');

  const phaseGuidePath = context.paths.getPhaseGuidePath(phase);
  if (planContent) {
    await context.documents.writeGuide('phase', phase, planContent);
    output.push('## Phase Guide\n');
    output.push('**Created from your plan content.**\n');
    output.push(`**File:** ${phaseGuidePath}\n`);
    output.push('\n---\n');
  }
  try {
    const phaseGuideContent = await context.readPhaseGuide(phase);
    const phaseSection = MarkdownUtils.extractSection(phaseGuideContent, `Phase ${phase}`);
    if (phaseSection) {
      output.push('## Phase Guide\n');
      output.push(phaseSection);
      output.push('\n---\n');
    } else {
      output.push('## Phase Guide\n');
      output.push(`**WARNING: Section 'Phase ${phase}' not found in phase guide**\n`);
      output.push(`**File:** ${phaseGuidePath}\n`);
      output.push(`**Suggestion:** Add 'Phase ${phase}' section to phase guide or verify section name\n`);
      output.push('\n---\n');
    }
  } catch (_error) {
    output.push('## Phase Guide\n');
    output.push(`**ERROR: Phase guide not found**\n`);
    output.push(`**Attempted:** ${phaseGuidePath}\n`);
    output.push(`**Expected:** Phase guide file for phase ${phase}\n`);
    output.push(`**Suggestion:** Create the file at ${phaseGuidePath}\n`);
    output.push(`**Template:** Use \`.cursor/commands/tiers/phase/templates/phase-guide.md\` as a starting point\n`);
    output.push(`**Tier:** Phase (Tier 1 - High-Level)\n`);
    output.push(`**Error Details:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('\n---\n');
  }

  output.push('## Decomposition (Phase → Sessions)\n');
  try {
    const phaseGuidePath = context.paths.getPhaseGuidePath(phase);
    let guideContent = '';
    try {
      guideContent = await readProjectFile(phaseGuidePath);
    } catch {
      guideContent = '';
    }
    const sessionMatches = guideContent.matchAll(/Session\s+(\d+\.\d+\.\d+):/g);
    const existingSessions: string[] = [];
    for (const m of sessionMatches) {
      if (WorkflowId.isValidSessionId(m[1])) existingSessions.push(m[1]);
    }
    if (existingSessions.length === 0) {
      const firstSessionId = phaseId.includes('.') ? `${phaseId}.1` : null;
      if (firstSessionId && WorkflowId.isValidSessionId(firstSessionId)) {
        const appendResult = await appendChildToParentDoc(
          'phase',
          phaseId,
          firstSessionId,
          resolvedDescription.slice(0, 200) || `Session ${firstSessionId}`,
          context
        );
        if (appendResult.success && !appendResult.alreadyExists) {
          output.push(`**Scaffolded:** Session ${firstSessionId} added to phase guide.\n`);
          output.push('Refine session descriptions in the phase guide, then run `/session-start ' + firstSessionId + '` to plan the first session.\n');
        } else if (appendResult.alreadyExists) {
          output.push('**Sessions** already present in phase guide.\n');
        } else {
          output.push(`**Note:** ${appendResult.output.join(' ')}\n`);
        }
      } else {
        output.push(`**Note:** Could not derive valid session ID for phase ${phaseId}. Add sessions manually to the phase guide.\n`);
      }
    } else {
      output.push(`**Sessions** already listed (${existingSessions.length}): ${existingSessions.join(', ')}. Review and refine as needed.\n`);
    }
    const firstSessionIdNext = phaseId.includes('.') ? `${phaseId}.1` : 'X.Y.Z';
    output.push('\n**Next:** Run `/session-start ' + firstSessionIdNext + '` to begin planning the first session.\n');
  } catch (_error) {
    output.push(`**Warning:** Decomposition step failed: ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('You can add sessions manually to the phase guide, then run `/session-start [X.Y.Z]`.\n');
  }
  output.push('\n---\n');

  output.push('## Test Strategy\n');
  output.push('**Document test requirements for this phase:**\n');
  output.push('- [ ] Test strategy defined\n');
  output.push('- [ ] Test requirements documented in phase guide\n');
  output.push('- [ ] Test todos created (if tests required)\n');
  output.push('- [ ] Test justification documented (if tests deferred)\n');
  output.push('\n**Note:** Tests should be created during implementation or documented justification if deferred.\n');
  output.push('If tests are deferred, document:\n');
  output.push('- Why tests are deferred\n');
  output.push('- When tests will be added (which phase/session)\n');
  output.push('- Test requirements for future implementation\n');
  output.push('\n---\n');
  output.push('## Phase Planning Checklist\n');
  output.push('- [ ] Documentation reviewed');
  output.push('- [ ] Patterns checked for reuse');
  output.push('- [ ] Phase guide reviewed');
  output.push('- [ ] Sessions identified');
  output.push('- [ ] Learning goals set');
  output.push('- [ ] Dependencies identified');
  output.push('- [ ] Success criteria defined');
  output.push('- [ ] Phase todo created');
  output.push('- [ ] Test strategy documented');

  return output.join('\n');
}
