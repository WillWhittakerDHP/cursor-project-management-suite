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
  /** When true, skip the context-gathering Q&A step and continue to plan/fill/cascade (set after user is satisfied). */
  contextGatheringComplete?: boolean;
}

/**
 * Resolve the execution mode from options.
 * defaultMode: used when options.mode is not set (e.g. 'plan' for tier-start, 'execute' for tier-end).
 */
export function resolveCommandExecutionMode(
  options?: CommandExecutionOptions,
  defaultMode: CommandExecutionMode = 'execute'
): CommandExecutionMode {
  return options?.mode ?? defaultMode;
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
