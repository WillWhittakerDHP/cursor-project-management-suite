/**
 * /accepted-proceed: run the next pass for the pending session/phase/feature start (chat-first flow).
 * Reads .tier-start-pending.json written by tier-start on context_gathering/plan_mode; reinvokes with pass 2 or execute.
 * When pass === 1, BLOCKS until the planning doc is filled (no placeholders); agent MUST fill doc before proceeding.
 */

import { runTierStart, type TierStartResultWithControlPlane } from './tier-start';
import { getConfigForTier } from '../configs';
import type { TierConfig } from './types';
import {
  readTierStartPending,
  writeTierStartPending,
  deleteTierStartPending,
} from './pending-state';
import type { ControlPlaneDecision } from './control-plane-types';
import { getPlanningDocPathForTier, isPlanningDocFilled, isGuideFilled } from './tier-start-steps';
import { readProjectFile } from '../../utils/utils';
import { WorkflowCommandContext } from '../../utils/command-context';

const NO_PENDING_MESSAGE =
  'No pending tier start. Run a session/phase/feature start first, then discuss the plan in chat. When ready, run **/accepted-proceed** again.';

function getIdentifierFromState(state: { tier: 'feature' | 'phase' | 'session'; params: Record<string, unknown> }): string {
  const p = state.params;
  if (state.tier === 'session' && typeof p.sessionId === 'string') return p.sessionId;
  if (state.tier === 'phase' && typeof p.phaseId === 'string') return p.phaseId;
  if (state.tier === 'feature' && typeof p.featureId === 'string') return p.featureId;
  return '';
}

const GUIDE_INCOMPLETE_MESSAGE = (path: string) =>
  `Proceeding is BLOCKED. The guide must be filled before you can continue.

The agent MUST fill the guide at \`${path}\`: open the file, replace placeholder text in each tierDown block (Session or Task) with concrete Goal, Files, Approach, and Checkpoint using provided context. Then **the user** runs /accepted-proceed again. The agent does not run the command.`;

const PLANNING_DOC_INCOMPLETE_MESSAGE = (path: string) =>
  `Proceeding is BLOCKED. The planning doc must be filled before you can continue.

The agent MUST do the following (this is REQUIRED, not optional):

1. Open the planning doc: \`${path}\`
2. Examine the Loaded Context in that doc (goals, handoff, tier inventory, governance).
3. Replace the placeholder sections with a concrete draft:
   - ## Goal — what this tier will achieve (2–4 sentences)
   - ## Files — list of files to touch
   - ## Approach — ordered steps
   - ## Checkpoint — what to verify when done
4. Save the file.

After the agent has updated the doc, **the user** runs /accepted-proceed again. The command will not proceed until the doc is filled.`;

/**
 * Run the next pass for the pending tier start. Returns result with controlPlaneDecision for the agent to present.
 * When pass === 1, validates that the planning doc is filled; if not, returns planning_doc_incomplete and does not call runTierStart.
 */
export async function acceptedProceed(): Promise<TierStartResultWithControlPlane> {
  const state = await readTierStartPending();
  if (!state) {
    const decision: ControlPlaneDecision = {
      stop: true,
      requiredMode: 'plan',
      message: NO_PENDING_MESSAGE,
    };
    return {
      success: false,
      output: NO_PENDING_MESSAGE,
      outcome: {
        status: 'blocked',
        reasonCode: 'no_pending_proceed',
        nextAction: NO_PENDING_MESSAGE,
      },
      controlPlaneDecision: decision,
    };
  }

  // Gate 2 (Option A): when guide_fill_pending, check guide is filled then run Part B with guideFillComplete.
  if (state.guideFillPending && state.guidePath) {
    const filled = await isGuideFilled(state.guidePath, state.tier);
    if (!filled) {
      const msg = GUIDE_INCOMPLETE_MESSAGE(state.guidePath);
      const decision: ControlPlaneDecision = {
        stop: true,
        requiredMode: 'plan',
        message: msg,
      };
      return {
        success: false,
        output: msg,
        outcome: {
          status: 'blocked',
          reasonCode: 'guide_incomplete',
          nextAction: msg,
        },
        controlPlaneDecision: decision,
      };
    }
    const config = getConfigForTier(state.tier) as TierConfig;
    const result = await runTierStart(config, state.params, {
      mode: 'execute',
      guideFillComplete: true,
    });
    if (result.outcome?.reasonCode === 'start_ok') {
      await deleteTierStartPending();
    }
    return result;
  }

  // Gate 1: when pass 1, validate planning doc before execute.
  if (state.pass === 1) {
    const identifier = getIdentifierFromState(state);
    if (!identifier) {
      const decision: ControlPlaneDecision = {
        stop: true,
        requiredMode: 'plan',
        message: 'Cannot resolve identifier from pending state; run the tier start again.',
      };
      return {
        success: false,
        output: decision.message,
        outcome: {
          status: 'blocked',
          reasonCode: 'planning_doc_incomplete',
          nextAction: decision.message,
        },
        controlPlaneDecision: decision,
      };
    }
    const context = await WorkflowCommandContext.getCurrent();
    const basePath = context.paths.getBasePath();
    const planningDocPath = getPlanningDocPathForTier(state.tier, identifier, basePath);
    let content: string;
    try {
      content = await readProjectFile(planningDocPath);
    } catch {
      const msg = PLANNING_DOC_INCOMPLETE_MESSAGE(planningDocPath);
      const decision: ControlPlaneDecision = {
        stop: true,
        requiredMode: 'plan',
        message: msg,
      };
      return {
        success: false,
        output: msg,
        outcome: {
          status: 'blocked',
          reasonCode: 'planning_doc_incomplete',
          nextAction: msg,
        },
        controlPlaneDecision: decision,
      };
    }
    if (!isPlanningDocFilled(content)) {
      const msg = PLANNING_DOC_INCOMPLETE_MESSAGE(planningDocPath);
      const decision: ControlPlaneDecision = {
        stop: true,
        requiredMode: 'plan',
        message: msg,
      };
      return {
        success: false,
        output: msg,
        outcome: {
          status: 'blocked',
          reasonCode: 'planning_doc_incomplete',
          nextAction: msg,
        },
        controlPlaneDecision: decision,
      };
    }
  }

  const config = getConfigForTier(state.tier) as TierConfig;
  const options = { mode: 'execute' as const };

  const result = await runTierStart(config, state.params, options);

  const reasonCode = result.outcome?.reasonCode;
  if (reasonCode === 'start_ok') {
    await deleteTierStartPending();
  }

  return result;
}
