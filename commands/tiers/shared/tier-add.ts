/**
 * /{tier}-add: register a new child tier in its parent guide.
 * Validates the identifier, resolves context, classifies WorkProfile,
 * appends the child to the parent doc, and runs planning checks.
 * Does NOT create branches, start workflows, or write pending state.
 */

import type { TierName } from './types';
import { WorkflowId } from '../../utils/id-utils';
import { WorkflowCommandContext, type TierParamsBag } from '../../utils/command-context';
import { classifyWorkProfile } from '../../harness/work-profile-classifier';
import type { WorkProfile } from '../../harness/work-profile';
import { appendChildToParentDoc, type AppendChildResult } from '../../utils/append-child-to-parent';
import { resolvePlanningDescription } from '../../planning/utils/resolve-planning-description';
import { runPlanningWithChecks } from '../../planning/utils/run-planning-pipeline';
import { tierUp } from '../../utils/tier-navigation';

export interface TierAddResult {
  success: boolean;
  output: string;
  added: {
    tier: TierName;
    identifier: string;
    parentTier: TierName;
    parentIdentifier: string;
    parentDocPath: string;
    alreadyExists: boolean;
  };
  workProfile: WorkProfile;
}

interface TierIdParts {
  tier: TierName;
  identifier: string;
  parentTier: TierName;
  parentIdentifier: string;
  featureId: string;
  sessionId?: string;
  phaseNum?: number;
}

function parseAndValidate(tier: TierName, identifier: string): TierIdParts | string {
  switch (tier) {
    case 'phase': {
      const parts = identifier.split('.');
      if (parts.length !== 2) return `Invalid phase ID format. Expected X.Y (e.g. 6.11), got: ${identifier}`;
      return {
        tier: 'phase',
        identifier,
        parentTier: 'feature',
        parentIdentifier: parts[0],
        featureId: parts[0],
      };
    }
    case 'session': {
      const parsed = WorkflowId.parseSessionId(identifier);
      if (!parsed) return `Invalid session ID format. Expected X.Y.Z (e.g. 6.10.2), got: ${identifier}`;
      return {
        tier: 'session',
        identifier,
        parentTier: 'phase',
        parentIdentifier: parsed.phaseId,
        featureId: parsed.feature,
        phaseNum: Number(parsed.feature),
      };
    }
    case 'task': {
      const parsed = WorkflowId.parseTaskId(identifier);
      if (!parsed) return `Invalid task ID format. Expected X.Y.Z.A (e.g. 6.10.1.5), got: ${identifier}`;
      return {
        tier: 'task',
        identifier,
        parentTier: 'session',
        parentIdentifier: parsed.sessionId,
        featureId: parsed.feature,
        sessionId: parsed.sessionId,
        phaseNum: Number(parsed.feature),
      };
    }
    default:
      return `Unsupported tier for add: ${tier}. Use phase, session, or task.`;
  }
}

function buildParamsBag(parts: TierIdParts): TierParamsBag {
  switch (parts.tier) {
    case 'phase': return { phaseId: parts.identifier };
    case 'session':
      return { sessionId: parts.identifier, featureId: parts.featureId };
    case 'task': return { taskId: parts.identifier, featureId: parts.featureId };
  }
  return {};
}

export async function tierAdd(
  tier: TierName,
  identifier: string,
  description?: string
): Promise<TierAddResult> {
  const parts = parseAndValidate(tier, identifier);
  if (typeof parts === 'string') {
    return {
      success: false,
      output: parts,
      added: { tier, identifier, parentTier: tierUp(tier) ?? 'feature', parentIdentifier: '', parentDocPath: '', alreadyExists: false },
      workProfile: classifyWorkProfile({ tier, action: 'start' }),
    };
  }

  const context = await WorkflowCommandContext.contextFromParams(tier, buildParamsBag(parts));
  const workProfile = classifyWorkProfile({ tier, action: 'start' });

  const resolvedDescription = await resolvePlanningDescription({
    tier,
    identifier,
    feature: context.feature.name,
    context,
    description,
  });

  const appendResult: AppendChildResult = await appendChildToParentDoc(
    parts.parentTier,
    parts.parentIdentifier,
    identifier,
    resolvedDescription,
    context
  );

  const output: string[] = [];
  output.push(`# ${tier.charAt(0).toUpperCase() + tier.slice(1)} Add: ${identifier}`);
  output.push(`**Description:** ${resolvedDescription}`);
  output.push(`**Work Profile:** ${workProfile.executionIntent} / ${workProfile.actionType} / ${workProfile.scopeShape}`);
  output.push('');

  if (!appendResult.success) {
    output.push(`**Failed to register:** ${appendResult.output.join('; ')}`);
    return {
      success: false,
      output: output.join('\n'),
      added: { tier, identifier, parentTier: parts.parentTier, parentIdentifier: parts.parentIdentifier, parentDocPath: appendResult.parentDocPath, alreadyExists: false },
      workProfile,
    };
  }

  if (appendResult.alreadyExists) {
    output.push(`**Already registered:** ${tier} ${identifier} exists in ${parts.parentTier} ${parts.parentIdentifier} guide.`);
  } else {
    output.push(`**Registered:** ${tier} ${identifier} added to ${parts.parentTier} ${parts.parentIdentifier} guide (\`${appendResult.parentDocPath}\`).`);
  }
  output.push('');

  output.push('## Planning Checks');
  try {
    const planningOutput = await runPlanningWithChecks({
      description: resolvedDescription,
      tier,
      feature: context.feature.name,
      phase: parts.phaseNum,
      sessionId: parts.sessionId,
      taskId: parts.tier === 'task' ? identifier : undefined,
      docCheckType: 'component',
    });
    output.push(planningOutput);
  } catch (err) {
    output.push(`Planning checks skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
  output.push('');

  output.push('---');
  output.push(`**Next:** Run \`/${tier}-start ${identifier}\` when ready to create branch and planning doc.`);

  return {
    success: true,
    output: output.join('\n'),
    added: {
      tier,
      identifier,
      parentTier: parts.parentTier,
      parentIdentifier: parts.parentIdentifier,
      parentDocPath: appendResult.parentDocPath,
      alreadyExists: appendResult.alreadyExists,
    },
    workProfile,
  };
}

export async function phaseAdd(phaseId: string, description?: string): Promise<TierAddResult> {
  return tierAdd('phase', phaseId, description);
}

export async function sessionAdd(sessionId: string, description?: string): Promise<TierAddResult> {
  return tierAdd('session', sessionId, description);
}

export async function taskAdd(taskId: string, description?: string): Promise<TierAddResult> {
  return tierAdd('task', taskId, description);
}
