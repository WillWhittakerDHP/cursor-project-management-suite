/**
 * Harness-facing entry for workflow (non-git) friction logging.
 * Mirrors git-manager → git-friction-log: call sites import from here; implementation lives in utils/workflow-friction-log.ts.
 */

import {
  appendWorkflowFriction,
  buildWorkflowFrictionEntryFromOrchestrator,
  getHarnessWorkflowFrictionMode,
  recordWorkflowFriction as recordWorkflowFrictionImpl,
  recordWorkflowFrictionWarning,
  shouldAppendWorkflowFriction,
} from '../utils/workflow-friction-log';
import type {
  HarnessWorkflowFrictionMode,
  RecordWorkflowFrictionInput,
  WorkflowFrictionEntry,
} from '../utils/workflow-friction-log';

export {
  appendWorkflowFriction,
  buildWorkflowFrictionEntryFromOrchestrator,
  getHarnessWorkflowFrictionMode,
  shouldAppendWorkflowFriction,
};
export type { HarnessWorkflowFrictionMode, RecordWorkflowFrictionInput, WorkflowFrictionEntry };

/**
 * Canonical programmatic entry: append a workflow friction block when harness execution is unclear,
 * blocked unexpectedly, or the agent struggles to proceed. Respects HARNESS_WORKFLOW_FRICTION and forcePolicy.
 */
export function initiateWorkflowFrictionWrite(entry: RecordWorkflowFrictionInput): void {
  recordWorkflowFrictionImpl(entry);
}

/** Fire-and-forget append with policy; same as utils implementation (re-exported for single import path). */
export const recordWorkflowFriction = recordWorkflowFrictionImpl;

/**
 * When tier start/end orchestrators return failure, append to WORKFLOW_FRICTION_LOG.md if policy allows
 * (failure-shaped outcomes; expected flow stops are suppressed by shouldAppendWorkflowFriction).
 */
export function recordOrchestratorFailureFriction(params: {
  action: 'start' | 'end' | 'add' | 'reopen';
  tier: string;
  identifier: string;
  featureName?: string;
  reasonCodeRaw: string;
  stepPath?: string[];
  nextAction?: string;
  deliverablesExcerpt?: string;
  symptom?: string;
  context?: string;
}): void {
  const reasonCodeRaw = String(params.reasonCodeRaw ?? '');
  if (!shouldAppendWorkflowFriction({ success: false, reasonCodeRaw })) return;
  recordWorkflowFrictionImpl(
    buildWorkflowFrictionEntryFromOrchestrator({
      action: params.action,
      tier: params.tier,
      identifier: params.identifier,
      featureName: params.featureName,
      reasonCodeRaw,
      stepPath: params.stepPath,
      nextAction: params.nextAction,
      deliverablesExcerpt: params.deliverablesExcerpt,
      symptom: params.symptom,
      context: params.context,
    })
  );
}

/**
 * Verbose-only harness step advisory (deliverables heuristic, non-blocking step failures, etc.).
 * Same as recordWorkflowFrictionWarning; name aligns with recordGitFriction ergonomics.
 */
export function recordHarnessVerboseWarning(
  stepId: string,
  message: string,
  extra?: Partial<Pick<WorkflowFrictionEntry, 'tier' | 'action' | 'identifier' | 'featureName'>>
): void {
  recordWorkflowFrictionWarning(stepId, message, extra);
}
