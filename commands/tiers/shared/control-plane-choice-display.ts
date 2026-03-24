/**
 * Format control-plane message and options for display in chat.
 * When a tier result requires a user choice, the command output includes this block;
 * the agent presents it in chat and the user runs the appropriate command or replies.
 * No external "AskQuestion" tool — choices are shown as markdown in the command output.
 */

import type { ControlPlaneDecision } from './control-plane-types';
import { QUESTION_KEYS } from './control-plane-types';

interface ChoiceOption {
  id: string;
  label: string;
}

const QUESTION_KEY_OPTIONS: Record<string, ChoiceOption[]> = {
  [QUESTION_KEYS.CASCADE]: [
    { id: 'yes_cascade', label: 'Yes — run cascade command' },
    { id: 'no_stop', label: 'No — stop here' },
  ],
  [QUESTION_KEYS.VERIFICATION_OPTIONS]: [
    { id: 'add_followup', label: 'Add follow-up task/session/phase' },
    { id: 'manual_continue', label: "I'll do it manually; continue tier-end" },
    { id: 'skip_continue', label: 'Skip; continue tier-end' },
  ],
  [QUESTION_KEYS.FAILURE_OPTIONS]: [
    { id: 'retry', label: 'Retry the command' },
    { id: 'audit_fix', label: 'Fix audit with governance context (/audit-fix)' },
    { id: 'skip', label: 'Skip and continue manually' },
  ],
  [QUESTION_KEYS.AUDIT_FAILED_OPTIONS]: [
    { id: 'retry', label: 'Retry the command' },
    { id: 'audit_fix', label: 'Fix audit with governance context (/audit-fix)' },
    { id: 'skip', label: 'Skip and continue manually' },
  ],
  [QUESTION_KEYS.REOPEN_OPTIONS]: [
    { id: 'plan_file', label: 'Yes — I have a plan file' },
    { id: 'plan_scratch', label: 'No — plan from scratch' },
    { id: 'quick_fix', label: 'No — just a quick fix' },
  ],
  [QUESTION_KEYS.UNCOMMITTED_CHANGES]: [
    { id: 'commit', label: 'Commit changes' },
    { id: 'stash', label: 'Skip (stash and continue)' },
  ],
};

/**
 * Format message and options as markdown for the agent to present in chat.
 * When decision has questionKey, returns a block to append to command output.
 */
export function formatChoiceForChat(decision: ControlPlaneDecision): string {
  if (!decision.questionKey) return '';
  const options = QUESTION_KEY_OPTIONS[decision.questionKey];
  if (!options) return '';
  // WHY: For audit_failed the command output already includes the full report (deliverables);
  // repeating decision.message here duplicates a large block in chat. See tier-end finalOutput + routeByOutcome.
  const prompt =
    decision.questionKey === QUESTION_KEYS.AUDIT_FAILED_OPTIONS
      ? '**Audit did not pass.** Use the report in the command output above, then choose how to proceed.'
      : decision.message?.trim()
        ? decision.message
        : 'How would you like to proceed?';
  const optionLines = options.map((o, i) => `${i + 1}. **${o.label}**`).join('\n');
  const cascadeNote =
    decision.questionKey === QUESTION_KEYS.CASCADE && decision.cascadeCommand
      ? `\n\n**If you choose "Yes":** run \`${decision.cascadeCommand}\``
      : '';
  return [
    '**User choice required**',
    '',
    prompt,
    '',
    '**Options:**',
    optionLines,
    cascadeNote,
    '',
    'Present this in chat and direct the user to run the corresponding command or reply with their choice.',
  ].join('\n');
}
