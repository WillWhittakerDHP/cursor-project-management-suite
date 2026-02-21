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
}

/**
 * Resolve the execution mode from options.
 * Default is 'execute' for backward compatibility — existing call sites
 * expect side effects unless the caller explicitly requests 'plan'.
 */
export function resolveCommandExecutionMode(options?: CommandExecutionOptions): CommandExecutionMode {
  return options?.mode ?? 'execute';
}

export function isPlanMode(mode: CommandExecutionMode): boolean {
  return mode === 'plan';
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
    return `**Mode gate:** Ensure Plan mode (Ask mode) before running${cmd} so CreatePlan and AskQuestion are available.`;
  }
  return `**Mode gate:** Ensure Agent mode before executing changes${cmd}.`;
}
