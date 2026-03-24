/**
 * /{tier}-add: register a new child tier in its parent guide.
 * Validates the identifier, resolves context, classifies WorkProfile,
 * appends the child to the parent doc, runs planning checks, and prints
 * the same advisory-context surface as tier-start planning (governance, Work Profile, architecture).
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
import {
  buildTierAdvisoryContext,
  buildTierAddReferenceMarkdown,
} from '../../harness/tier-advisory-context';
import { PROJECT_ROOT } from '../../utils/utils';
import {
  buildWorkflowFrictionEntryFromOrchestrator,
  recordWorkflowFriction,
  shouldAppendWorkflowFriction,
} from '../../utils/workflow-friction-log';

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

function recordTierAddContextFailure(params: {
  tier: TierName;
  parts: TierIdParts;
  message: string;
}): void {
  const rc = 'unhandled_error';
  if (!shouldAppendWorkflowFriction({ success: false, reasonCodeRaw: rc })) return;
  recordWorkflowFriction(
    buildWorkflowFrictionEntryFromOrchestrator({
      action: 'add',
      tier: params.tier,
      identifier: params.parts.identifier,
      featureName: params.parts.featureId,
      reasonCodeRaw: rc,
      symptom: params.message,
      context:
        `tier-add: WorkflowCommandContext.contextFromParams failed.\n\n` +
        `tier=${params.tier}; identifier=${params.parts.identifier}; featureId=${params.parts.featureId}`,
    })
  );
}

function recordTierAddAppendFailure(params: {
  tier: TierName;
  parts: TierIdParts;
  appendOutput: string[];
}): void {
  recordWorkflowFriction({
    ...buildWorkflowFrictionEntryFromOrchestrator({
      action: 'add',
      tier: params.tier,
      identifier: params.parts.identifier,
      featureName: params.parts.featureId,
      reasonCodeRaw: 'guide_materialization_failed',
      symptom: 'tier-add: appendChildToParentDoc failed.',
      context:
        `tier=${params.tier}; identifier=${params.parts.identifier}; parent=${params.parts.parentTier} ${params.parts.parentIdentifier}\n\n` +
        params.appendOutput.join('\n'),
    }),
    forcePolicy: true,
  });
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

  let context: WorkflowCommandContext;
  try {
    context = await WorkflowCommandContext.contextFromParams(tier, buildParamsBag(parts));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordTierAddContextFailure({ tier, parts, message });
    return {
      success: false,
      output: `**${tier}-add failed:**\n\n\`\`\`\n${message}\n\`\`\``,
      added: {
        tier,
        identifier,
        parentTier: parts.parentTier,
        parentIdentifier: parts.parentIdentifier,
        parentDocPath: '',
        alreadyExists: false,
      },
      workProfile: classifyWorkProfile({ tier, action: 'start' }),
    };
  }

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
  output.push('');

  if (!appendResult.success) {
    recordTierAddAppendFailure({ tier, parts, appendOutput: appendResult.output });
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

  const advisory = await buildTierAdvisoryContext({
    tier,
    workProfile,
    taskFiles: undefined,
    projectRoot: PROJECT_ROOT,
  });

  if (advisory.taskGovernanceDeferred && advisory.taskGovernanceDeferredMessage) {
    output.push('## Task governance (deferred)');
    output.push('');
    output.push(advisory.taskGovernanceDeferredMessage);
    output.push('');
    output.push(
      '_File-scoped task governance and violations apply after `/task-start` when task files are known._'
    );
    output.push('');
  } else {
    output.push('## Contract (advisory preview)');
    output.push('');
    output.push(advisory.governanceContractBlock);
    output.push('');
  }

  output.push(advisory.workProfileSection.trimEnd());
  output.push('');

  if (advisory.architectureExcerpt != null && advisory.architectureExcerpt.trim() !== '') {
    output.push('## Architecture context (harness-injected)');
    output.push('');
    output.push(advisory.architectureExcerpt.trim());
    output.push('');
  }

  output.push('## Planning Checks');
  try {
    const planningOutput = await runPlanningWithChecks({
      description: resolvedDescription,
      tier,
      feature: context.feature.name,
      phase: parts.phaseNum,
      sessionId: parts.sessionId,
      taskId: parts.tier === 'task' ? identifier : undefined,
    });
    output.push(planningOutput);
  } catch (err) {
    output.push(`Planning checks skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
  output.push('');

  output.push(buildTierAddReferenceMarkdown());
  output.push('');
  output.push('---');
  output.push(
    `**Next:** Run \`/${tier}-start ${identifier}\` when ready to create branch and planning doc. ` +
      'After tier-start, complete the planning doc and coverage check before `/accepted-plan` where applicable.'
  );

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
