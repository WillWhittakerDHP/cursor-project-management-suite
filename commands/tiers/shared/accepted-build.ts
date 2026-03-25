/**
 * /accepted-build: Gate 2 — resume after guide fill (decomposition) or auto-complete Part A for standard/fast when applicable.
 * Reads `.tier-start-pending.json` with `guideFillPending`; runs tier-start execute with `guideFillComplete` + `resumeAfterStep: ensure_branch`.
 */

import { runTierStart, type TierStartResultWithControlPlane } from './tier-start';
import { getConfigForTier } from '../configs';
import {
  readTierStartPending,
  deleteTierStartPending,
  type TierStartPendingParams,
  type TierStartPendingState,
} from './pending-state';
import { isGuideFilled } from './tier-start-steps';
import type { ControlPlaneDecision } from './control-plane-types';
import { formatChoiceForChat } from './control-plane-choice-display';
import { WorkflowCommandContext, type TierParamsBag } from '../../utils/command-context';
import type { GateProfile } from '../../harness/work-profile';
import {
  buildWorkflowFrictionEntryFromOrchestrator,
  initiateWorkflowFrictionWrite,
} from '../../harness/workflow-friction-manager';

const NO_PENDING_MESSAGE =
  'No Gate 2 pending state. Run **/accepted-plan** first after the planning doc is filled; when the workflow asks for guide fill, run **/accepted-build** after the guide is updated.';

const GUIDE_INCOMPLETE_MESSAGE = (path: string) =>
  `Proceeding is BLOCKED. The guide must be filled before you can continue.

The agent MUST open \`${path}\`, replace placeholder text in each tierDown block with concrete Goal, Files, Approach, and Checkpoint, save, then **the user** runs **/accepted-build** again.`;

function pendingParamsToTierParamsBag(tier: TierStartPendingState['tier'], params: TierStartPendingParams): TierParamsBag {
  switch (tier) {
    case 'feature':
      return { featureId: (params as { featureId: string }).featureId };
    case 'phase': {
      const p = params as { phaseId: string; featureId?: string; featureName?: string };
      if (p.featureId != null && p.featureId.trim() !== '') {
        return { phaseId: p.phaseId, featureId: p.featureId.trim() };
      }
      return { phaseId: p.phaseId, featureName: (p.featureName ?? '').trim() };
    }
    case 'session': {
      const p = params as {
        sessionId: string;
        description?: string;
        featureId?: string;
        featureName?: string;
      };
      const base =
        p.featureId != null && p.featureId.trim() !== ''
          ? { sessionId: p.sessionId, featureId: p.featureId.trim() }
          : { sessionId: p.sessionId, featureName: (p.featureName ?? '').trim() };
      return p.description !== undefined ? { ...base, description: p.description } : base;
    }
  }
}

function identifierFromPending(state: TierStartPendingState): string {
  const { tier, params } = state;
  switch (tier) {
    case 'feature':
      return (params as { featureId: string }).featureId;
    case 'phase':
      return (params as { phaseId: string }).phaseId;
    case 'session':
      return (params as { sessionId: string }).sessionId;
  }
}

function resolveGateProfile(state: TierStartPendingState): GateProfile {
  return state.workProfile?.gateProfile ?? state.gateProfile ?? 'decomposition';
}

function guidePathForState(state: TierStartPendingState, context: WorkflowCommandContext): string {
  if (state.guidePath != null && state.guidePath.trim() !== '') {
    return state.guidePath.trim();
  }
  const id = identifierFromPending(state);
  switch (state.tier) {
    case 'feature':
      return context.paths.getFeatureGuidePath();
    case 'phase':
      return context.paths.getPhaseGuidePath(id);
    case 'session':
      return context.paths.getSessionGuidePath(id);
  }
}

function blocked(message: string, reasonCode: string): TierStartResultWithControlPlane {
  const decision: ControlPlaneDecision = {
    stop: true,
    requiredMode: 'plan',
    message,
  };
  return {
    success: false,
    output: message,
    outcome: {
      status: 'blocked',
      reasonCode,
      nextAction: message,
    },
    controlPlaneDecision: decision,
  };
}

/**
 * Resume tier start after Gate 2 (guide). User runs in Cursor; do not shell-invoke as primary workflow.
 */
export async function acceptedBuild(): Promise<TierStartResultWithControlPlane> {
  const state = await readTierStartPending();
  if (!state || state.guideFillPending !== true) {
    return blocked(NO_PENDING_MESSAGE, 'no_pending_build');
  }

  const tierParams = pendingParamsToTierParamsBag(state.tier, state.params);
  let context: WorkflowCommandContext;
  try {
    context = await WorkflowCommandContext.contextFromParams(state.tier, tierParams);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const id = identifierFromPending(state);
    let pendingExcerpt = '';
    try {
      const raw = JSON.stringify({ tier: state.tier, params: state.params, guideFillPending: state.guideFillPending });
      pendingExcerpt = raw.length > 2000 ? `${raw.slice(0, 2000)}\n\n…(truncated)` : raw;
    } catch {
      pendingExcerpt = '(pending state not serializable)';
    }
    initiateWorkflowFrictionWrite({
      ...buildWorkflowFrictionEntryFromOrchestrator({
        action: 'start',
        tier: state.tier,
        identifier: id,
        reasonCodeRaw: 'invalid_context',
        symptom: message,
        context: `/accepted-build: WorkflowCommandContext.contextFromParams failed.\n\n${pendingExcerpt}`,
      }),
      forcePolicy: true,
    });
    return blocked(
      `**Context resolution failed:**\n\n\`\`\`\n${message}\n\`\`\`\n\nFix pending state or re-run tier-start.`,
      'invalid_context'
    );
  }

  const gateProfile = resolveGateProfile(state);
  const autoGuidePass = gateProfile === 'standard' || gateProfile === 'fast';

  if (!autoGuidePass && state.leafTier !== true) {
    const filled = await isGuideFilled(state.tier, identifierFromPending(state), context);
    if (!filled) {
      return blocked(GUIDE_INCOMPLETE_MESSAGE(guidePathForState(state, context)), 'guide_incomplete');
    }
  }

  const config = getConfigForTier(state.tier);
  const result = await runTierStart(config, state.params, {
    mode: 'execute',
    resumeAfterStep: 'ensure_branch',
    guideFillComplete: true,
    ...(state.workProfile != null && { workProfile: state.workProfile }),
  });

  const rc = String(result.outcome?.reasonCode ?? '');
  if (rc === 'start_ok') {
    await deleteTierStartPending();
  }

  let finalOutput = result.output;
  if (result.controlPlaneDecision.stop && result.controlPlaneDecision.questionKey) {
    const choiceBlock = formatChoiceForChat(result.controlPlaneDecision);
    if (choiceBlock) finalOutput = finalOutput + '\n\n---\n\n' + choiceBlock;
  }

  return {
    ...result,
    output: finalOutput,
  };
}
