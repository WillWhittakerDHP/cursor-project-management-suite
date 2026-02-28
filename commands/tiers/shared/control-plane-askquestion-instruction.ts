/**
 * Emits an explicit instruction block so the agent uses Cursor's AskQuestion UI
 * (clickable options) instead of writing the question as plain chat text.
 */

import type { ControlPlaneDecision } from './control-plane-types';
import { QUESTION_KEYS } from './control-plane-types';

/** Option labels for each questionKey (used in the instruction block). */
const QUESTION_KEY_OPTIONS: Record<string, string> = {
  [QUESTION_KEYS.APPROVE_EXECUTE]: 'Yes — execute | No — revise',
  [QUESTION_KEYS.CONTEXT_GATHERING]:
    'Use the decision options from the message above (Insight / Proposal / Decision blocks). Always include "I\'m satisfied with our plan and ready to begin" as a clickable option.',
  [QUESTION_KEYS.CASCADE]: 'Yes — run cascade command | No — stop here',
  [QUESTION_KEYS.PUSH_CONFIRMATION]: 'Yes — push to remote | No — skip push',
  [QUESTION_KEYS.VERIFICATION_OPTIONS]: 'Add follow-up task/session/phase | I\'ll do it manually; continue tier-end | Skip; continue tier-end',
  [QUESTION_KEYS.FAILURE_OPTIONS]: 'Retry the command | Investigate the issue | Skip and continue manually',
  [QUESTION_KEYS.REOPEN_OPTIONS]: 'Yes — I have a plan file | No — plan from scratch | No — just a quick fix',
  [QUESTION_KEYS.UNCOMMITTED_CHANGES]: 'Commit changes | Skip (stash and continue)',
};

/**
 * When the command result requires a user choice, append this block so the agent
 * uses AskQuestion (Cursor UI) instead of echoing the question in chat.
 */
export function formatAskQuestionInstruction(decision: ControlPlaneDecision): string {
  if (!decision.questionKey) return '';
  const options = QUESTION_KEY_OPTIONS[decision.questionKey] ?? 'See playbook for options';
  const cascadeNote =
    decision.questionKey === QUESTION_KEYS.CASCADE && decision.cascadeCommand
      ? ` (Yes = run: ${decision.cascadeCommand})`
      : '';
  return [
    '**REQUIRED — Use AskQuestion (Cursor\'s question UI with clickable options).**',
    'Do NOT write the question as plain text in the chat. Present the message above via AskQuestion so the user gets clickable choices.',
    `Options for this prompt: ${options}${cascadeNote}`,
  ].join('\n');
}
