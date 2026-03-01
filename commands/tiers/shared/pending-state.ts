/**
 * Pending state for /accepted-proceed and /accepted-code (chat-first flow).
 * Written when a tier start returns context_gathering or plan_mode; read and cleared by the proceed commands.
 */

import { readProjectFile, writeProjectFile } from '../../utils/utils';

const TIER_PENDING_PATH = '.cursor/commands/.tier-start-pending.json';
const TASK_PENDING_PATH = '.cursor/commands/.task-start-pending.json';

/** Params shape stored for reinvoke (matches TierStartParams for feature/phase/session). */
export type TierStartPendingParams =
  | { featureId: string }
  | { phaseId: string }
  | { sessionId: string; description?: string };

/** State for session/phase/feature start: pass 1 = after context_gathering (run pass 2 next); pass 2 = after plan_mode (run execute next). */
export interface TierStartPendingState {
  tier: 'feature' | 'phase' | 'session';
  params: TierStartPendingParams;
  pass: 1 | 2;
}

/** State for task start: user will run /accepted-code to run task start with execute. */
export interface TaskStartPendingState {
  taskId: string;
  featureId?: string;
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
    const state = safeParse<TierStartPendingState>(TIER_PENDING_PATH, raw);
    if (!state?.tier || !state?.params || state.pass !== 1 && state.pass !== 2) return null;
    if (state.tier !== 'feature' && state.tier !== 'phase' && state.tier !== 'session') return null;
    return state;
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
    const state = safeParse<TaskStartPendingState>(TASK_PENDING_PATH, raw);
    if (!state?.taskId) return null;
    return state;
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
