/**
 * Command Execution Mode — single source of truth for plan/execute branching
 * and the agent-facing mode gate.
 *
 * WHY: We want a hard separation between "plan-only" (Ask mode) and "execute" (Agent mode),
 * so workflow commands can be safely previewed without performing side effects.
 *
 * This file owns:
 *  - CommandExecutionMode  — the code-level branch ('plan' | 'execute')
 *  - CursorMode            — the Cursor-IDE mode the agent should be in ('plan' | 'agent')
 *  - resolveCommandExecutionMode — resolve mode from options (default: execute)
 *  - isPlanMode            — convenience guard
 *  - cursorModeForExecution — map code mode → Cursor mode
 *  - modeGateText          — short agent-facing instruction string
 */

export type CommandExecutionMode = 'plan' | 'execute';

/** The Cursor IDE mode the agent should be in. 'plan' = Plan/Ask mode, 'agent' = Agent mode. */
export type CursorMode = 'plan' | 'agent';

export interface CommandExecutionOptions {
  mode?: CommandExecutionMode;
  /** Option A second gate: when true, skip Part A steps and run from read_start_context (guide already filled by agent). */
  guideFillComplete?: boolean;
  /** When set, the start workflow skips all steps before this one (proceed past a gate without re-running from the top). */
  resumeAfterStep?: string;
  /** When set, the end workflow skips steps before this id (control-plane only; narrow allowlist in run-end-steps). */
  resumeEndAfterStep?: string;
  /**
   * Tier-start `.cursor` submodule policy override. When omitted, derived from mode + `TIER_START_SUBMODULE_CURSOR` env.
   */
  submoduleCursor?: 'off' | 'parent' | 'remote';
  /** Optional work classifier; when present (e.g. from pending state), used instead of tier+action default. */
  workProfile?: import('../harness/work-profile').WorkProfile;
}

/**
 * Resolve the execution mode from options.
 * defaultMode: used when options.mode is not set. Start commands default to 'plan'; execute via /accepted-plan (feature/phase/session) or /accepted-code (task). End commands default to 'execute'.
 */
export function resolveCommandExecutionMode(
  options?: CommandExecutionOptions,
  defaultMode: CommandExecutionMode = 'execute'
): CommandExecutionMode {
  return options?.mode ?? defaultMode;
}

/**
 * Resolve CommandExecutionOptions from tier params (start or end).
 * Supports nested params.options (canonical) and flat params.mode for backward compatibility.
 */
export function getOptionsFromParams(params: unknown): CommandExecutionOptions | undefined {
  const p = params as Record<string, unknown> | null | undefined;
  if (p == null) return undefined;
  const opts = p.options as CommandExecutionOptions | undefined;
  if (opts != null && typeof opts === 'object') return opts;
  if (p.mode !== undefined) return { mode: p.mode as CommandExecutionMode };
  return undefined;
}

export function isPlanMode(mode: CommandExecutionMode): boolean {
  return mode === 'plan';
}

/**
 * Resolve `.cursor` submodule sync for tier-start ensureTierBranch.
 * Plan mode → `off`; execute → `parent` unless options.submoduleCursor or TIER_START_SUBMODULE_CURSOR=remote.
 */
export function resolveSubmoduleCursorForTierStart(options?: CommandExecutionOptions): 'off' | 'parent' | 'remote' {
  if (options?.submoduleCursor != null) {
    return options.submoduleCursor;
  }
  const mode = resolveCommandExecutionMode(options, 'plan');
  if (isPlanMode(mode)) {
    return 'off';
  }
  const env = typeof process !== 'undefined' ? process.env.TIER_START_SUBMODULE_CURSOR : undefined;
  if (env != null && String(env).toLowerCase() === 'remote') {
    return 'remote';
  }
  return 'parent';
}

/** Map code-level execution mode to the Cursor IDE mode the agent should be in. */
export function cursorModeForExecution(executionMode: CommandExecutionMode): CursorMode {
  return executionMode === 'plan' ? 'plan' : 'agent';
}

/**
 * Short agent-facing instruction: ensure the correct Cursor mode before proceeding.
 * Used by generic tier dispatchers (tier-start, tier-end, tier-plan, tier-change);
 * tier-specific impls do NOT call this — the dispatcher prepends it.
 *
 * @param cursorMode - 'plan' or 'agent'
 * @param commandName - e.g. 'session-start', 'phase-end'
 */
export function modeGateText(cursorMode: CursorMode, commandName?: string): string {
  const cmd = commandName ? ` \`/${commandName}\`` : '';
  if (cursorMode === 'plan') {
    return `**Mode gate:** Ensure Plan mode (Ask mode) before running${cmd} so the user can respond in chat (e.g. CreatePlan, choices).`;
  }
  return `**Mode gate:** Ensure Agent mode before executing changes${cmd}.`;
}

/**
 * Block returned by enforceModeSwitch for prepending to command output.
 * States the required Cursor mode and workflow reminder.
 */
export interface ModeEnforcementBlock {
  requiredMode: CursorMode;
  text: string;
}

/**
 * Produces a short mode-enforcement header for prepending to command output.
 * States the required Cursor mode and result status only. All behavioral rules
 * (what tools to use, when to cascade, how to handle failures) live in the
 * playbook: START_END_PLAYBOOK_STRUCTURE.md. Code must not duplicate them here.
 *
 * @param requiredMode - 'plan' or 'agent'
 * @param commandName - e.g. 'session-start', 'phase-end'
 * @param reason - 'normal' (default) or 'failure' — changes the header label
 */
export function enforceModeSwitch(
  requiredMode: CursorMode,
  commandName: string,
  reason: 'normal' | 'failure' = 'normal'
): ModeEnforcementBlock {
  const cmd = `\`/${commandName}\``;
  if (requiredMode === 'plan' && reason === 'failure') {
    return {
      requiredMode: 'plan',
      text: `## STOP — ${cmd} Failed — Plan (Ask) Mode Required\n\nSee playbook routing: "If not success (HARD STOP)".`,
    };
  }
  if (requiredMode === 'plan') {
    return {
      requiredMode: 'plan',
      text: `## Mode: Plan (Ask) — ${cmd}\n\nSee playbook routing for this \`reasonCode\`.`,
    };
  }
  return {
    requiredMode: 'agent',
    text: `## Mode: Agent — ${cmd}\n\nSee playbook routing for this \`reasonCode\`.`,
  };
}
