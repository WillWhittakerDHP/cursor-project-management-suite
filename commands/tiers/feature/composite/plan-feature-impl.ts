/**
 * Feature plan implementation. Used by tier-plan and by plan-feature (thin wrapper).
 */

import { featureCreate } from '../atomic/feature-create';
import { featureResearch } from '../atomic/feature-research';
import { resolvePlanningDescription } from '../../../planning/utils/resolve-planning-description';
import { runPlanningWithChecks } from '../../../planning/utils/run-planning-pipeline';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { resolveFeatureId } from '../../../utils/feature-context';

export async function planFeatureImpl(featureId: string, description?: string): Promise<string> {
  const featureName = await resolveFeatureId(featureId);
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];

  const resolvedDescription = await resolvePlanningDescription({
    tier: 'feature',
    identifier: featureId,
    feature: featureName,
    context,
    description,
  });

  output.push(`# Planning Feature: ${featureName}\n`);
  output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n`);
  output.push(`**Description:** ${resolvedDescription}\n\n`);
  output.push('---\n\n');

  output.push('## Step 0: Planning Checks\n');
  output.push('**Running planning checks before feature creation...**\n');
  try {
    const planningOutput = await runPlanningWithChecks({
      description: resolvedDescription,
      tier: 'feature',
      feature: featureName,
      docCheckType: 'migration',
    });
    output.push(planningOutput);
    output.push('\n---\n\n');
  } catch (_error) {
    output.push(`⚠️ **Warning: Planning checks failed**\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push(`**Note:** Continuing with feature creation despite planning check failure.\n`);
    output.push('\n---\n\n');
  }

  output.push('## Step 1: Creating Feature Structure\n\n');
  try {
    const createOutput = await featureCreate(featureName, resolvedDescription);
    output.push(createOutput);
    output.push('\n---\n\n');
  } catch (_error) {
    output.push(`**ERROR:** Failed to create feature structure\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('\n---\n\n');
  }

  output.push('## Step 2: Research Phase\n\n');
  output.push('**MANDATORY:** Every feature must include a research phase before implementation.\n\n');
  try {
    const researchOutput = await featureResearch(featureName);
    output.push(researchOutput);
  } catch (_error) {
    output.push(`**ERROR:** Failed to initialize research phase\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
  }

  output.push('\n---\n\n');
  output.push('## Step 3: Decomposition (Feature → Phases)\n\n');
  try {
    const featureGuidePath = context.paths.getFeatureGuidePath();
    let guideContent = '';
    try {
      guideContent = await readProjectFile(featureGuidePath);
    } catch {
      guideContent = '';
    }
    const hasPhases = /\bPhase\s+[1-9]\d*:/i.test(guideContent);
    if (!hasPhases) {
      const appendResult = await appendChildToParentDoc(
        'feature',
        featureName,
        '1',
        resolvedDescription.slice(0, 200) || 'Phase 1',
        context
      );
      if (appendResult.success && !appendResult.alreadyExists) {
        output.push('**Scaffolded:** Phase 1 added to feature guide (Phases Breakdown).\n');
        output.push('Refine phase goals/scope in the feature guide before running `/phase-start 1`.\n');
      } else if (appendResult.alreadyExists) {
        output.push('**Phases** already present in feature guide.\n');
      } else {
        output.push(`**Note:** ${appendResult.output.join(' ')}\n`);
      }
    } else {
      output.push('**Phases** already listed in feature guide. Review and refine as needed.\n');
    }
    output.push('\n**Next:** Run `/phase-start 1` to begin planning the first phase.\n');
  } catch (_error) {
    output.push(`**Warning:** Decomposition step failed: ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('You can add phases manually to the feature guide, then run `/phase-start 1`.\n');
  }

  output.push('\n---\n\n');
  output.push('## Next Steps\n\n');
  output.push('1. Answer all research questions (30+ questions)\n');
  output.push('2. Document findings in feature guide\n');
  output.push('3. Update feature log with research phase entry\n');
  output.push('4. Run `/feature-start [name]` to begin feature work\n');
  output.push('5. Run `/phase-start 1` to plan the first phase (after cascade)\n');

  return output.join('\n');
}
