/**
 * Feature plan implementation. Used by tier-plan and by plan-feature (thin wrapper).
 */

import { featureCreate } from '../atomic/feature-create';
import { featureResearch } from '../atomic/feature-research';
import { resolvePlanningDescription } from '../../../planning/utils/resolve-planning-description';
import { runPlanningWithChecks } from '../../../planning/utils/run-planning-pipeline';
import { createPlanningTodo } from '../../../planning/utils/create-planning-todo';
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

    const todoResult = await createPlanningTodo({
      tier: 'feature',
      identifier: featureId,
      description: resolvedDescription,
      feature: featureName,
    });
    if (!todoResult.success) {
      output.push(...todoResult.outputLines);
      throw todoResult.error;
    }
    output.push(...todoResult.outputLines);
    output.push('\n---\n\n');
  } catch (_error) {
    if (_error instanceof Error && (_error.message.includes('todo') || _error.message.includes('BLOCKING') || _error.message.includes('Todo'))) {
      throw _error;
    }
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
  output.push('## Next Steps\n\n');
  output.push('1. Answer all research questions (30+ questions)\n');
  output.push('2. Document findings in feature guide\n');
  output.push('3. Update feature log with research phase entry\n');
  output.push('4. Run `/feature-start [name]` to begin feature work\n');

  return output.join('\n');
}
