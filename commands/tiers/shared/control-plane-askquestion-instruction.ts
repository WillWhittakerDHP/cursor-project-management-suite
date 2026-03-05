/**
 * Emits an explicit instruction block so the agent uses Cursor's AskQuestion UI
 * (clickable options) instead of writing the question as plain chat text.
 */

import type { ControlPlaneDecision } from './control-plane-types';
import { QUESTION_KEYS } from './control-plane-types';

interface AskQuestionOption {
  id: string;
  label: string;
}

const QUESTION_KEY_OPTIONS: Record<string, AskQuestionOption[]> = {
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
 * Emit a structured instruction block that the agent can parse to build an
 * AskQuestion tool call. The cursor rule `process-workflow.mdc` tells the agent
 * to look for ASKQUESTION_REQUIRED=true and invoke the AskQuestion tool.
 */
export function formatAskQuestionInstruction(decision: ControlPlaneDecision): string {
  if (!decision.questionKey) return '';
  const options = QUESTION_KEY_OPTIONS[decision.questionKey];
  if (!options) return '';
  const cascadeNote =
    decision.questionKey === QUESTION_KEYS.CASCADE && decision.cascadeCommand
      ? `\nASKQUESTION_CASCADE_COMMAND=${decision.cascadeCommand}`
      : '';
  const optionLines = options
    .map((o) => `  - id: "${o.id}" label: "${o.label}"`)
    .join('\n');
  return [
    '**ASKQUESTION_REQUIRED=true**',
    `ASKQUESTION_KEY=${decision.questionKey}`,
    `ASKQUESTION_PROMPT=How would you like to proceed?`,
    `ASKQUESTION_OPTIONS:`,
    optionLines,
    cascadeNote,
    '',
    'AGENT DIRECTIVE: Call the AskQuestion tool now with the prompt and options above. Do NOT write these options as plain text.',
  ].join('\n');
}
