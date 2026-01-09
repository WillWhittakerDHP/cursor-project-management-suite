/**
 * Command Execution Mode
 *
 * WHY: We want a hard separation between "plan-only" (Ask mode) and "execute" (Agent mode),
 * so workflow commands can be safely previewed without performing side effects.
 */

export type CommandExecutionMode = 'plan' | 'execute';

export interface CommandExecutionOptions {
  mode?: CommandExecutionMode;
}

/**
 * Backwards compatible default:
 * - existing code likely expects commands to execute side effects
 * - callers can explicitly request `mode: 'plan'` to generate a safe preview
 */
export function resolveCommandExecutionMode(options?: CommandExecutionOptions): CommandExecutionMode {
  return options?.mode ?? 'execute';
}

export function isPlanMode(mode: CommandExecutionMode): boolean {
  return mode === 'plan';
}


