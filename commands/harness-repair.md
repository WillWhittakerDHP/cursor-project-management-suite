# /harness-repair

**When to use:** Triage **non-git** harness friction in `.project-manager/WORKFLOW_FRICTION_LOG.md`, detect recurrence, and (in execute mode) mark entries **addressed** with notes and parent-repo SHA. After **session-end** with **`pending_push_confirmation`**, if **`outcome.nextAction`** includes the friction reminder, run **plan mode** before **`/accepted-push`**. Use **`git-manager`** paths only for `.cursor` submodule commits (no ad-hoc `git` from tier code).

## Entry point

| Command         | Composite file (from repo root)                                      | Export to invoke   |
|-----------------|----------------------------------------------------------------------|--------------------|
| /harness-repair | `.cursor/commands/harness/composite/harness-repair-impl.ts`         | `harnessRepair`    |

**CLI (plan):**

```bash
npx tsx .cursor/commands/harness/composite/harness-repair-impl.ts --feature <#|slug> [--session <x.y.z>|--phase <id>|--task <id>] [--plan]
```

**CLI (execute — requires `--confirm` and `--headings`):**

```bash
npx tsx .cursor/commands/harness/composite/harness-repair-impl.ts --feature <#|slug> --session <x.y.z> --execute --confirm --headings "Exact ### heading text,Other heading" [--note "…"] [--commit-submodule] [--submodule-message "…"]
```

## Agent instructions

1. **Plan (default):** Call **`harnessRepair({ featureId, tier?, sessionId?, phaseId?, taskId?, mode: 'plan' })`**. The output markdown includes open entries, recurrence clusters, **`buildTierAdvisoryContext`** sections (governance contract or deferred task governance, work profile, architecture excerpt), suggested next harness actions, and a Reference block. **`featureId`** is required; **`tier`** defaults to **`feature`**; for non-feature tiers pass the matching id param.
2. **Execute:** Only after reviewing the plan. Call **`harnessRepair({ …, mode: 'execute', confirmed: true, entryHeadings: [...], note?, runSubmoduleCommit?, submoduleCommitMessage? })`**. Headings must **exactly** match the `###` line text (without `###`). Execute applies **Policy A**: writes **`parentRepoCommit: pending`**, commits, **`git rev-parse HEAD`**, stamps pending → real SHA, second commit. Submodule: optional **`commitSubmodule`** uses **`commitCursorSubmoduleAndStageParentGitlink`** from **`git-manager`** (commits inside `.cursor`, stages parent gitlink).
3. **Git boundary:** Do not shell `git` from outside **`git-manager`** / **`.cursor/commands/git/**` for this flow.

## Behavior

- **Classifier:** `classifyWorkProfile({ tier, action: 'start', reasonCode: 'workflow_bug_fix' })` → **`buildTierAdvisoryContext`** verbatim.
- **Open / gate:** `hasOpenWorkflowFrictionEntries()` / `isFrictionEntryOpenForHarnessGate` treat entries with **`parentRepoCommit: pending`** as still open for session-end push reminder.
- **Utilities:** `.cursor/commands/utils/read-workflow-friction.ts` (parse, clusters, patch helpers); log path **`.cursor/commands/utils/workflow-friction-log.ts`** (`getWorkflowFrictionLogPath`).
