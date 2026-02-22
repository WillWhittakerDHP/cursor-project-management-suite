/**
 * Tier overlap check: search spec for finding existing code that duplicates tier command behavior.
 * Used as an early step in playbooks or planning so we can decide overwrite / add to / deprecate.
 *
 * Search specs are defined in this module; no separate doc.
 */

export type TierName = 'feature' | 'phase' | 'session' | 'task';
export type TierVerb = 'start' | 'end';

export interface TierOverlapSearchSpec {
  commandName: string;
  whatItDoes: string;
  searchQueries: string[];
  decisionPrompt: string;
}

const OVERLAP_SPECS: Record<string, TierOverlapSearchSpec> = {
  'feature-start': {
    commandName: 'feature-start',
    whatItDoes: 'Creates feature branch from develop, generates workflow docs, loads context, checkpoint, audit.',
    searchQueries: [
      'createBranch.*feature',
      'feature.*branch.*develop',
      'current-feature',
      'generateFeatureGuide',
      'feature-load',
    ],
    decisionPrompt: 'Decide: overwrite / add to / deprecate existing code that creates feature branches or loads feature context.',
  },
  'feature-end': {
    commandName: 'feature-end',
    whatItDoes: 'Summarizes feature, closes docs, merge to develop, delete branch, update current feature.',
    searchQueries: [
      'merge.*develop',
      'feature.*summary',
      'featureClose',
      'delete.*branch',
      'updateCurrentFeature',
    ],
    decisionPrompt: 'Decide: overwrite / add to / deprecate existing code that merges feature branch or finalizes feature.',
  },
  'phase-start': {
    commandName: 'phase-start',
    whatItDoes: 'Loads phase guide/handoff, validates phase, creates phase branch, sets phase context.',
    searchQueries: [
      'readPhaseGuide',
      'phase.*guide',
      'phase.*handoff',
      'phase-.*-guide',
      'createBranch.*phase',
    ],
    decisionPrompt: 'Decide: overwrite / add to / deprecate existing code that loads phase context or creates phase branch.',
  },
  'phase-end': {
    commandName: 'phase-end',
    whatItDoes: 'Marks phase complete, updates phase log/handoff, merges session branches, commit/push.',
    searchQueries: [
      'markPhaseComplete',
      'phase.*complete',
      'phase.*log',
      'phase.*handoff',
      'merge.*session.*branch',
    ],
    decisionPrompt: 'Decide: overwrite / add to / deprecate existing code that marks phase complete or merges session branches.',
  },
  'session-start': {
    commandName: 'session-start',
    whatItDoes: 'Loads session guide/handoff, validates session, creates session branch, session label.',
    searchQueries: [
      'readSessionGuide',
      'session.*guide',
      'session.*handoff',
      'session-.*-guide',
      'createSessionLabel',
      'session-start',
    ],
    decisionPrompt: 'Decide: overwrite / add to / deprecate existing code that loads session context or creates session branch.',
  },
  'session-end': {
    commandName: 'session-end',
    whatItDoes: 'Updates session log/handoff/guide, marks session complete in phase guide, git merge/commit, push prompt.',
    searchQueries: [
      'appendLog',
      'session.*log',
      'updateHandoff',
      'session.*handoff',
      'markSessionComplete',
      'session.*complete',
      'session-end',
    ],
    decisionPrompt: 'Decide: overwrite / add to / deprecate existing code that updates session log/handoff or marks session complete.',
  },
  'task-start': {
    commandName: 'task-start',
    whatItDoes: 'Loads task context from session guide/handoff, task todo lookup, citations.',
    searchQueries: [
      'task.*guide',
      'task.*context',
      'session.*guide.*task',
    ],
    decisionPrompt: 'Decide: overwrite / add to / deprecate existing code that loads task context from session guide.',
  },
  'task-end': {
    commandName: 'task-end',
    whatItDoes: 'Appends task entry to session log, marks task complete in session guide.',
    searchQueries: [
      'formatTaskEntry',
      'appendLog',
      'markTaskComplete',
      'task.*complete',
      'session.*log.*task',
    ],
    decisionPrompt: 'Decide: overwrite / add to / deprecate existing code that appends task entries or marks task complete.',
  },
};

/**
 * Returns the search spec for a tier command so callers (playbook, planning) can run
 * codebase searches and present the "check existing code" step.
 */
export function getTierOverlapSearchSpec(tier: TierName, verb: TierVerb): TierOverlapSearchSpec | null {
  const key = `${tier}-${verb}`;
  return OVERLAP_SPECS[key] ?? null;
}

/**
 * Returns a short formatted string for the "check existing code" step (e.g. for inclusion in planning output).
 */
export function formatTierOverlapCheckStep(tier: TierName, verb: TierVerb): string {
  const spec = getTierOverlapSearchSpec(tier, verb);
  if (!spec) return '';

  const lines: string[] = [
    `**Command:** /${spec.commandName}`,
    `**Does:** ${spec.whatItDoes}`,
    `**Search for:** ${spec.searchQueries.join(', ')}`,
    `**Then:** ${spec.decisionPrompt}`,
  ];
  return lines.join('\n');
}
