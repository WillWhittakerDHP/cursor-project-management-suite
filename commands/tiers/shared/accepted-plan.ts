/**
 * /accepted-plan: Gate 1 — resume feature/phase/session start after planning doc is filled.
 * Reads `.tier-start-pending.json` from `context_gathering`; runs tier-start in execute from `ensure_branch`.
 * Express profile: fail-fast (no planning gate). Decomposition may stop at `guide_fill_pending` → user runs /accepted-build next.
 */

import { runTierStart, type TierStartResultWithControlPlane } from './tier-start';
import { getConfigForTier } from '../configs';
import {
  readTierStartPending,
  deleteTierStartPending,
  type TierStartPendingParams,
  type TierStartPendingState,
} from './pending-state';
import { isPlanningDocFilled } from './tier-start-steps';
import type { ControlPlaneDecision } from './control-plane-types';
import { formatChoiceForChat } from './control-plane-choice-display';
import { WorkflowCommandContext, type TierParamsBag } from '../../utils/command-context';
import type { GateProfile } from '../../harness/work-profile';

const NO_PENDING_MESSAGE =
  'No pending feature/phase/session start. Run **feature-start**, **phase-start**, or **session-start** first; after the agent fills the planning doc, run **/accepted-plan**.';

const WRONG_GATE_MESSAGE =
  'Gate 2 is pending (guide fill). Run **/accepted-build** after the agent fills the guide — not **/accepted-plan**.';

const EXPRESS_FAIL_MESSAGE = `**Express** gate profile skips the planning-doc gate. **/accepted-plan** does not apply.

If this file is stale from an earlier run, delete \`.cursor/commands/.tier-start-pending.json\` or re-run the tier-start for your tier. Otherwise continue in Agent mode per the last tier-start output.`;

const PLANNING_DOC_INCOMPLETE_MESSAGE = (path: string) =>
  `Proceeding is BLOCKED. The planning doc must be filled before you can continue.

The agent MUST do the following (this is REQUIRED, not optional):

1. Open the planning doc: \`${path}\`
2. Examine the Loaded Context in that doc (goal, files, approach, checkpoint, governance, inventory).
3. Replace the placeholder sections with a concrete draft (Goal, Files, Approach, Checkpoint / Design Before Execute).
4. Save the file.

After the doc is updated, run /accepted-plan again. The command will not proceed until the doc is filled.`;

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

function blocked(
  message: string,
  reasonCode: string,
  status: 'blocked' | 'failed' = 'blocked'
): TierStartResultWithControlPlane {
  const decision: ControlPlaneDecision = {
    stop: true,
    requiredMode: 'plan',
    message,
  };
  return {
    success: false,
    output: message,
    outcome: {
      status,
      reasonCode,
      nextAction: message,
    },
    controlPlaneDecision: decision,
  };
}

/**
 * Resume tier start after Gate 1 (planning doc). User runs in Cursor; do not shell-invoke as primary workflow.
 */
export async function acceptedPlan(): Promise<TierStartResultWithControlPlane> {
  const state = await readTierStartPending();
  if (!state) {
    return blocked(NO_PENDING_MESSAGE, 'no_pending_plan');
  }

  if (state.guideFillPending === true) {
    return blocked(WRONG_GATE_MESSAGE, 'wrong_accepted_command');
  }

  const gateProfile = resolveGateProfile(state);
  if (gateProfile === 'express') {
    return blocked(EXPRESS_FAIL_MESSAGE, 'wrong_accepted_command');
  }

  const tierParams = pendingParamsToTierParamsBag(state.tier, state.params);
  let context: WorkflowCommandContext;
  try {
    context = await WorkflowCommandContext.contextFromParams(state.tier, tierParams);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return blocked(
      `**Context resolution failed:**\n\n\`\`\`\n${message}\n\`\`\`\n\nRe-run the matching tier-start or fix params in pending state.`,
      'invalid_context',
      'failed'
    );
  }

  const identifier = identifierFromPending(state);
  const planningTier = state.tier;
  const planningDocPath = context.documents.getPlanningDocRelativePath(planningTier, identifier);

  if (!(await context.documents.planningDocExists(planningTier, identifier))) {
    return blocked(PLANNING_DOC_INCOMPLETE_MESSAGE(planningDocPath), 'planning_doc_incomplete');
  }

  let content: string;
  try {
    content = await context.documents.readPlanningDoc(planningTier, identifier);
  } catch {
    return blocked(PLANNING_DOC_INCOMPLETE_MESSAGE(planningDocPath), 'planning_doc_incomplete');
  }

  if (!isPlanningDocFilled(content)) {
    return blocked(PLANNING_DOC_INCOMPLETE_MESSAGE(planningDocPath), 'planning_doc_incomplete');
  }

  const config = getConfigForTier(state.tier);
  const result = await runTierStart(config, state.params, {
    mode: 'execute',
    resumeAfterStep: 'ensure_branch',
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
