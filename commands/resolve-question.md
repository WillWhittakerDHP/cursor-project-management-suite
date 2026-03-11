# /resolve-question

**When to use:** To record a design decision for an unresolved open question in any planning or guide document. Open questions are surfaced during tier-start when parent documents contain `### Open Questions` sections. Use this command to formally resolve a question, mark it `[x]`, and record the decision inline.

## Entry point

| Command            | Composite file (from repo root)                               | Export to invoke          |
|--------------------|---------------------------------------------------------------|---------------------------|
| /resolve-question  | .cursor/commands/planning/composite/resolve-question.ts       | resolveQuestion, listOpenQuestions |

## Agent instructions

### List all open questions

Call `listOpenQuestions()` from `.cursor/commands/planning/composite/resolve-question.ts`. Returns a formatted list of all unresolved open questions across `PROJECT_PLAN.md` and feature/phase/session guide files, with file paths and question numbers for use with `resolveQuestion`.

### Resolve a specific question

Call `resolveQuestion({ filePath?, section?, questionNumber, decision })`:

- **filePath** *(optional)*: Repo-relative path to the file containing the question (e.g. `.project-manager/PROJECT_PLAN.md`). If omitted, auto-discovers from `PROJECT_PLAN.md` and feature guides.
- **section** *(optional)*: Substring to match the Open Questions section heading (e.g. `"Feature 7"` matches `"### Open Questions (Feature 7)"`).
- **questionNumber** *(required)*: The 1-based question number within the section.
- **decision** *(required)*: The design decision or answer to record.

The command marks the question `[x]` and appends a `**Decision:**` line in the document.

## Examples

```
// List all unresolved questions
const result = await listOpenQuestions();

// Resolve question #1 in Feature 7's Open Questions
const result = await resolveQuestion({
  section: 'Feature 7',
  questionNumber: 1,
  decision: 'Use a select menu with admin/agent/client/anonymous roles. Four auth conditions total.'
});

// Resolve in a specific file
const result = await resolveQuestion({
  filePath: '.project-manager/features/appointment-workflow/phases/phase-6.9-guide.md',
  section: 'Phase 6.9',
  questionNumber: 2,
  decision: 'Deferred to Feature 12 scope.'
});
```

## Workflow integration

- **tier-start (hard gate)**: When the parent guide has unresolved open questions, tier-start is **blocked** with `reasonCode: unresolved_questions`. The agent cannot proceed to context gathering or planning until all inherited open questions are resolved. The blocking message lists the questions and directs the user to run `/resolve-question`.
- **After resolving**: The question is marked `[x]` in the source document. Future tier-start runs no longer inherit it and the gate passes.
- **Propagation**: Decisions are recorded in the document where the question lives. Resolved questions do not block downstream tiers.
