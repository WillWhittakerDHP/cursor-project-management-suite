/**
 * Pending state for /accepted-proceed, /accepted-code (start), and /accepted-push (end).
 * Start: written when tier start returns context_gathering; read and cleared by accepted-proceed/accepted-code.
 * End: written when tier end returns pending_push_confirmation; read and cleared by accepted-push/skip-push.
 */

import { readProjectFile, writeProjectFile } from '../../utils/utils';
import { WorkflowId } from '../../utils/id-utils';
import type { CascadeInfo } from '../../utils/tier-outcome';
import type { WorkProfile } from '../../harness/work-profile';

const TIER_PENDING_PATH = '.cursor/commands/.tier-start-pending.json';
const TASK_PENDING_PATH = '.cursor/commands/.task-start-pending.json';
const TIER_END_PENDING_PATH = '.cursor/commands/.tier-end-pending.json';

/** Params shape stored for reinvoke; phase/session must include featureId or featureName. */
export type TierStartPendingParams =
  | { featureId: string }
  | ({ phaseId: string } & ({ featureId: string } | { featureName: string }))
  | ({ sessionId: string; description?: string } & ({ featureId: string } | { featureName: string }));

/** State for session/phase/feature start: pass 1 = after context_gathering; /accepted-proceed runs execute. */
export interface TierStartPendingState {
  tier: 'feature' | 'phase' | 'session';
  params: TierStartPendingParams;
  pass: 1;
  /** Option A: when true, Gate 2 — agent must fill the guide; next /accepted-proceed checks isGuideFilled and runs Part B. */
  guideFillPending?: boolean;
  /** Path to the guide file (relative to project) when guideFillPending is true. */
  guidePath?: string;
  /** Optional work classifier; preserved across /accepted-proceed for consistent spec. */
  workProfile?: WorkProfile;
}

/** State for task start: user will run /accepted-code to run task start with execute. */
export interface TaskStartPendingState {
  taskId: string;
  /** Numeric # or directory slug; may be omitted on disk if restored from taskId via `WorkflowId.parseTaskId`. */
  featureId?: string;
  featureName?: string;
  /** Optional work classifier; preserved across /accepted-code for consistent spec. */
  workProfile?: WorkProfile;
}

function safeParse<T>(path: string, raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function readTierStartPending(): Promise<TierStartPendingState | null> {
  try {
    const raw = await readProjectFile(TIER_PENDING_PATH);
    const parsed = safeParse<{
      tier: string;
      params: unknown;
      pass?: number;
      guideFillPending?: boolean;
      guidePath?: string;
      workProfile?: WorkProfile;
    }>(TIER_PENDING_PATH, raw);
    if (!parsed?.tier || !parsed?.params || (parsed.pass !== 1 && parsed.pass !== 2)) return null;
    if (parsed.tier !== 'feature' && parsed.tier !== 'phase' && parsed.tier !== 'session') return null;
    return {
      tier: parsed.tier as TierStartPendingState['tier'],
      params: parsed.params as TierStartPendingParams,
      pass: 1,
      ...(parsed.guideFillPending === true && parsed.guidePath != null && {
        guideFillPending: true,
        guidePath: String(parsed.guidePath),
      }),
      ...(parsed.workProfile != null && { workProfile: parsed.workProfile }),
    };
  } catch {
    return null;
  }
}

export async function writeTierStartPending(state: TierStartPendingState): Promise<void> {
  await writeProjectFile(TIER_PENDING_PATH, JSON.stringify(state, null, 2));
}

export async function deleteTierStartPending(): Promise<void> {
  const { unlink } = await import('fs/promises');
  const { join } = await import('path');
  const { PROJECT_ROOT } = await import('../../utils/utils');
  try {
    await unlink(join(PROJECT_ROOT, TIER_PENDING_PATH));
  } catch {
    // ignore if already missing
  }
}

export async function readTaskStartPending(): Promise<TaskStartPendingState | null> {
  try {
    const raw = await readProjectFile(TASK_PENDING_PATH);
    const parsed = safeParse<{
      taskId?: string;
      featureId?: string;
      featureName?: string;
      workProfile?: WorkProfile;
    }>(
      TASK_PENDING_PATH,
      raw
    );
    if (!parsed?.taskId) return null;
    let featureId =
      typeof parsed.featureId === 'string' && parsed.featureId.trim() !== ''
        ? parsed.featureId.trim()
        : '';
    const featureName =
      typeof parsed.featureName === 'string' && parsed.featureName.trim() !== ''
        ? parsed.featureName.trim()
        : '';
    if (!featureId && !featureName) {
      const derived = WorkflowId.parseTaskId(parsed.taskId.trim())?.feature;
      if (derived) featureId = derived;
    }
    if (!featureId && !featureName) return null;
    return {
      taskId: parsed.taskId,
      ...(featureId !== '' && { featureId }),
      ...(featureName !== '' && { featureName }),
      ...(parsed.workProfile != null && { workProfile: parsed.workProfile }),
    };
  } catch {
    return null;
  }
}

export async function writeTaskStartPending(state: TaskStartPendingState): Promise<void> {
  await writeProjectFile(TASK_PENDING_PATH, JSON.stringify(state, null, 2));
}

export async function deleteTaskStartPending(): Promise<void> {
  const { unlink } = await import('fs/promises');
  const { join } = await import('path');
  const { PROJECT_ROOT } = await import('../../utils/utils');
  try {
    await unlink(join(PROJECT_ROOT, TASK_PENDING_PATH));
  } catch {
    // ignore
  }
}

// --- End pending (push gate) ---

/** State for tier end when push is pending; /accepted-push or /skip-push reads and clears. */
export interface EndPendingState {
  tier: 'feature' | 'phase' | 'session' | 'task';
  identifier: string;
  cascade?: CascadeInfo;
}

export async function readEndPending(): Promise<EndPendingState | null> {
  try {
    const raw = await readProjectFile(TIER_END_PENDING_PATH);
    const parsed = safeParse<{ tier: string; identifier: string; cascade?: CascadeInfo }>(
      TIER_END_PENDING_PATH,
      raw
    );
    if (!parsed?.tier || !parsed?.identifier) return null;
    if (
      parsed.tier !== 'feature' &&
      parsed.tier !== 'phase' &&
      parsed.tier !== 'session' &&
      parsed.tier !== 'task'
    )
      return null;
    return {
      tier: parsed.tier as EndPendingState['tier'],
      identifier: String(parsed.identifier),
      ...(parsed.cascade != null && { cascade: parsed.cascade }),
    };
  } catch {
    return null;
  }
}

export async function writeEndPending(state: EndPendingState): Promise<void> {
  await writeProjectFile(TIER_END_PENDING_PATH, JSON.stringify(state, null, 2));
}

export async function deleteEndPending(): Promise<void> {
  const { unlink } = await import('fs/promises');
  const { join } = await import('path');
  const { PROJECT_ROOT } = await import('../../utils/utils');
  try {
    await unlink(join(PROJECT_ROOT, TIER_END_PENDING_PATH));
  } catch {
    // ignore
  }
}
