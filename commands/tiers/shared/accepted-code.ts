/**
 * /accepted-code: allow the pending task start to proceed past the gate (Begin Coding) without re-running from the top.
 * Reads .task-start-pending.json written by task-start on plan_mode; continues the workflow from ensure_branch
 * (resumeAfterStep). BLOCKS until the task planning doc is filled (same enforcement as /accepted-plan for non-task tiers).
 */

import { runTierStart, type TierStartResultWithControlPlane } from './tier-start';
import { TASK_CONFIG } from '../configs';
import { readTaskStartPending, deleteTaskStartPending } from './pending-state';
import type { ControlPlaneDecision } from './control-plane-types';
import { isPlanningDocFilled } from './tier-start-steps';
import { WorkflowCommandContext } from '../../utils/command-context';
import {
  buildWorkflowFrictionEntryFromOrchestrator,
  initiateWorkflowFrictionWrite,
} from '../../harness/workflow-friction-manager';

const NO_PENDING_MESSAGE =
  'No pending task start. Run a task-start first (e.g. after session-start cascade), discuss the task design in chat, then run **/accepted-code** when ready to begin coding.';

const PLANNING_DOC_INCOMPLETE_MESSAGE = (path: string) =>
  `Proceeding is BLOCKED. The task planning doc must be filled before you can continue.

The agent MUST do the following (this is REQUIRED, not optional):

1. Open the planning doc: \`${path}\`
2. Examine the Loaded Context in that doc (goal, files, approach, checkpoint, governance, inventory).
3. Replace the placeholder sections with a concrete draft (Goal, Files, Approach, Checkpoint / Design Before Execute).
4. Save the file.

After the doc is updated, run /accepted-code again. The command will not proceed until the doc is filled.`;

/**
 * Run task start with execute for the pending task. Returns result with controlPlaneDecision for the agent to present.
 * When a task planning doc exists, validates it is filled; if not, returns planning_doc_incomplete and does not run task start.
 */
export async function acceptedCode(): Promise<TierStartResultWithControlPlane> {
  const state = await readTaskStartPending();
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
        reasonCode: 'no_pending_code',
        nextAction: NO_PENDING_MESSAGE,
      },
      controlPlaneDecision: decision,
    };
  }

  const hasFeature =
    (state.featureId != null && state.featureId.trim() !== '') ||
    (state.featureName != null && state.featureName.trim() !== '');
  if (!hasFeature) {
    const msg =
      'Pending task state is missing **featureId** or **featureName**. Re-run **task-start** with an explicit feature (e.g. numeric # or `appointment-workflow`).';
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

  let context: WorkflowCommandContext;
  try {
    context = await WorkflowCommandContext.contextFromParams('task', {
      taskId: state.taskId,
      ...(state.featureId != null && state.featureId.trim() !== '' && { featureId: state.featureId.trim() }),
      ...(state.featureName != null && state.featureName.trim() !== '' && { featureName: state.featureName.trim() }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const featureLabel =
      state.featureId != null && state.featureId.trim() !== ''
        ? state.featureId.trim()
        : state.featureName != null && state.featureName.trim() !== ''
          ? state.featureName.trim()
          : '—';
    initiateWorkflowFrictionWrite({
      ...buildWorkflowFrictionEntryFromOrchestrator({
        action: 'start',
        tier: 'task',
        identifier: state.taskId,
        featureName: featureLabel,
        reasonCodeRaw: 'invalid_context',
        symptom: message,
        context: `/accepted-code: WorkflowCommandContext.contextFromParams failed.\n\ntaskId=${state.taskId}; feature=${featureLabel}`,
      }),
      forcePolicy: true,
    });
    const failMsg = `**Context resolution failed:**\n\n\`\`\`\n${message}\n\`\`\`\n\nFix pending state or re-run **task-start**.`;
    const decision: ControlPlaneDecision = {
      stop: true,
      requiredMode: 'plan',
      message: failMsg,
    };
    return {
      success: false,
      output: failMsg,
      outcome: {
        status: 'failed',
        reasonCode: 'invalid_context',
        nextAction: failMsg,
      },
      controlPlaneDecision: decision,
    };
  }
  const expressProfile = state.workProfile?.gateProfile === 'express';
  const planningDocPath = context.documents.getPlanningDocRelativePath('task', state.taskId);

  if (!expressProfile) {
    if (!(await context.documents.planningDocExists('task', state.taskId))) {
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
    let content: string;
    try {
      content = await context.documents.readPlanningDoc('task', state.taskId);
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

  const result = await runTierStart(
    TASK_CONFIG,
    {
      taskId: state.taskId,
      ...(state.featureId != null && state.featureId.trim() !== '' && { featureId: state.featureId.trim() }),
      ...(state.featureName != null && state.featureName.trim() !== '' && { featureName: state.featureName.trim() }),
    },
    {
      mode: 'execute',
      resumeAfterStep: 'ensure_branch',
      ...(state.workProfile != null && { workProfile: state.workProfile }),
    }
  );

  if (result.outcome?.reasonCode === 'start_ok') {
    await deleteTaskStartPending();
  }

  return result;
}
