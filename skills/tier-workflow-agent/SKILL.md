---
name: tier-workflow-agent
description: >-
  Executes and interprets tier slash commands (feature/phase/session/task start and end),
  presents control-plane decisions, routes by reasonCode, structures sessions and handoffs,
  and applies cascade and failure rules. Use when the user runs a tier slash command,
  discusses workflow, accepted-plan/build/code/push, audit-fix, or when handling harness
  results from .cursor/commands/tiers/.
---

# Tier workflow agent

## Instructions

This skill complements [`.cursor/rules/process-workflow.mdc`](../../rules/process-workflow.mdc) (always-applied workflow directives) and the canonical playbook [`.cursor/commands/tiers/START_END_PLAYBOOK_STRUCTURE.md`](../../commands/tiers/START_END_PLAYBOOK_STRUCTURE.md). The playbook remains the **source of truth** for edge cases, full tables, and architecture notes. Use this skill for fast recall; open the playbook when behavior is ambiguous.

**Harness implementation map:** How `DocumentManager` handles planning docs and logs, and how git differs between **tier-start** (`ensureTierBranch`) and **tier-end** (`commitRemaining`), lives in [`.project-manager/HARNESS_CHARTER.md`](../../../.project-manager/HARNESS_CHARTER.md) §4 (Current implementation notes). Tier-end **`commit_remaining`** can take **`params.options.commitMessage`** / **`commitMessageBody`** (multi-line `git commit`) after reviewing the harness **commit preview** in output or the session/feature/phase log.

## Execute slash commands; do not summarize

- Any file under `.cursor/commands/` invoked as a **slash command** is an **executable workflow**.
- Run steps sequentially (read files, shell, git, writes) per the command implementation and the playbook.
- **Forbidden:** responding with “this command would do X” instead of executing.
- **Tier start/end:** Resolve the command to the composite file and export from the playbook’s command-to-entry-point table; invoke from **repo root** with `npx tsx -e`, e.g.:
  - Session start: `npx tsx -e "import('./.cursor/commands/tiers/session/composite/session.ts').then(m => m.sessionStart('6.4.4')).then(r => console.log(JSON.stringify(r)))"`
  - Session end: `npx tsx -e "import('./.cursor/commands/tiers/session/composite/session.ts').then(m => m.sessionEnd('6.4.4')).then(r => console.log(JSON.stringify(r)))"`
- **`/accepted-plan`**, **`/accepted-build`**, **`/accepted-code`**, **`/accepted-push`**, **`/skip-push`:** The **user** runs these in the Cursor UI. The agent fills planning docs and guides, then prompts the user. The agent does **not** invoke these as the primary workflow from the shell.

## Wait for tier-end pipelines

- **feature-end**, **phase-end**, **session-end**, **task-end** may run **several minutes** (audits, git, tests).
- Wait for completion; use only the returned `result`, `outcome`, and `controlPlaneDecision`. Do not assume a long run means failure.

## Across ladder (cascade checks)

- After tier starts/ends, the harness refreshes **`.project-manager/features/<feature>/across-ladder.json`** and may inject **## Across ladder (harness)** into handoff(s). Before suggesting `/phase-start`, `/session-start`, or `/feature-end`, read that JSON (or the handoff block) and match **`nextPhaseAcross`** / **`nextSessionAcross`** to your proposed command. If disk and the manifest disagree, re-run the relevant **tier-start** or fix phase/session guides.

## Interpreting command results

- **User-facing:** Always present `controlPlaneDecision.message` (verbatim for errors and gates). When it includes the **Recommended agent/model** block (from `.project-manager/agent-model-config.json`), switch to that model if practical, or **state explicitly** that you are staying on the current model and why before heavy planning or implementation. The harness does not change Cursor’s active model.
- **Agent context:** Use `result.output` for your own understanding; **do not** dump it verbatim to the user.
- When output includes **User choice required** (message + numbered options): present it in chat; direct the user to the listed slash command or to reply with their choice. **Do not** use an external AskQuestion tool for those choices.
- **Routing:** Use `result.outcome.reasonCode` and `result.outcome.nextAction`; do not infer next steps from internal step prose.
- **Tier-end resume (`nextInvoke`):** For `wrong_branch_before_commit`, `audit_fix_commit_failed`, and resumable **`git_failed`** (outcome carries `tierEndGitResumable`), `controlPlaneDecision.nextInvoke` re-runs the **same** tier-end with merged `params.options` including `resumeEndAfterStep` (`commit_remaining`, `end_audit`, or `git`). Do **not** ask the user to type `resumeEndAfterStep` manually; use the harness-provided re-invocation when present.
- **Audit-fix:** `getAuditFixContext` and `auditFixPrompt` (`.cursor/commands/audit/atomic/audit-fix-prompt.ts`) share the same assembly—embedded governance + architecture markdown and the same merged `paths`; CLI paste is not a weaker path than programmatic invocation.

## Git working tree reporting

- **Feature-only branches:** Phase and session tiers do not create separate git branches; expect `feature/<featureName>` for harness git steps.
- **Git friction log:** On git-related failures or non-trivial recovery, check **`.project-manager/.git-friction-log.jsonl`** (structured JSON lines). Prefer it over reconstructing history from raw terminal noise. Agents may append via `recordGitFriction` / `appendGitFriction` from `git-manager` when documenting an incident.
- **Workflow friction log:** Tier start/end **auto-append** on normalized **failure** reason codes (`parseReasonCode` / `isFailureReasonCode`); expected flow gates are suppressed. Env: `HARNESS_WORKFLOW_FRICTION` (`off` | `failures` default | `verbose`). For material friction **without** a failed harness outcome, use **`initiateWorkflowFrictionWrite`** from `.cursor/commands/harness/workflow-friction-manager.ts` with **`forcePolicy: true`** (or paste manually per the log template)—**no ad hoc friction files**. Scan entries: `npx tsx .cursor/commands/utils/read-workflow-friction.ts --last 20` (optional `--reason <normalizedCode>`). **`/harness-repair`** (`.cursor/commands/harness-repair.md`) plans triage + advisory context and can execute addressed markers; after session-end, follow **`outcome.nextAction`** for plan-mode repair before **`/accepted-push`** when open entries exist.
- **Expected dirty (do not alarm):** `.cursor/` submodule, `client/.audit-reports/`, transient `.project-manager/` dotfiles — tier-end does not auto-commit these (`isNeverCommitPath` in `working-tree-policy.ts` / `tier-branch-manager.ts`). Mention briefly; do not treat as failure by itself.
- **Still prioritize:** `client/` and `server/` product changes, wrong branch, merge/`git_failed`, and `steps.createPR` when PR freshness matters. See [`.cursor/rules/process-workflow.mdc`](../../rules/process-workflow.mdc) (Git status / dirty tree reporting).

## Reason codes (quick reference)

Runtime outcomes may use **legacy** strings; routing normalizes them via `parseReasonCode` in [`.cursor/commands/harness/reason-code.ts`](../../commands/harness/reason-code.ts) (e.g. `pending_push_confirmation` → `pending_push`, `verification_work_suggested` → `verification_suggested`, `uncommitted_changes_blocking` → `uncommitted_blocking`). Treat playbook section names and the table below as equivalent intent.

| reasonCode (playbook / runtime) | What to do (one line) |
|--------------------------------|------------------------|
| `context_gathering` | **Fill planning doc now** (agent reads Reference paths and writes sections — do not only relay instructions to the user); coverage check (non-task); user runs `/accepted-plan` or `/accepted-code`; decomposition profile may need `/accepted-build` (Gate 2). |
| `planning_doc_incomplete` | Fill planning doc placeholders; user re-runs `/accepted-plan` or `/accepted-code` (task). |
| `guide_fill_pending` | Fill guide at `guidePath`; user runs `/accepted-build`. |
| `guide_incomplete` | Fill guide placeholders in tierDown blocks; user runs `/accepted-build` again. |
| `audit_failed` | Fix per governance; retry same command; use `/audit-fix` path when offered. |
| `pending_push` / `pending_push_confirmation` | User runs `/accepted-push` or `/skip-push`; agent does not invoke push from shell as substitute. |
| `verification_suggested` / `verification_work_suggested` | Present checklist and choice block; re-invoke tier-end with `continuePastVerification: true` or add follow-up tier per options. |
| `gap_analysis_pending` | Present gap report and choice block; use **tier-add** / **tier-start** for follow-up; continue via `nextInvoke` or `continuePastGapAnalysis: true` under **`params.options`** (not top-level). |
| `uncommitted_blocking` / `uncommitted_changes_blocking` | Present blocking files; user chooses commit or stash path per playbook. |
| `wrong_branch_before_commit` | Checkout expected branch; re-run same tier-end (control plane may supply `nextInvoke` → `resumeEndAfterStep: commit_remaining`). |
| `audit_fix_commit_failed` | Fix git state if needed; re-run same tier-end (`nextInvoke` → `resumeEndAfterStep: end_audit` — not `after_audit`; audit must repopulate `autofixResult`). |
| `expected_branch_missing_run_tier_start` | Expected branch does not exist locally; run matching **tier-start** (or `git fetch` + checkout); then re-run tier-end — see playbook. |
| `validation_failed` | Start blocked; present `nextAction`; no proceed until resolved. |
| `start_ok` | Start succeeded; for **tasks** (including after `/accepted-code`): **implement the task now** (read planning doc, write code, edit files per Implementation Orders) — do not summarize or wait; run `/task-end` only after code is written. Other tiers: handle optional cascade. |
| `end_ok` | End succeeded; handle optional cascade; may follow push gate. |
| `push_done` | After `/accepted-push`; handle cascade if present. |
| `task_complete` | Task-end success; cascade across (next task) or up (session-end) per `outcome.cascade`. |
| `git_failed` (tier-end, resumable) | When `tierEndGitResumable` is set, re-run same tier-end via `nextInvoke` (`resumeEndAfterStep: git`). Otherwise treat as hard stop like other failures. |
| Other failure codes (`test_failed`, `git_failed` non-resumable, `preflight_failed`, etc.) | **Hard stop** — see [On failure or missing outcome](#on-failure-or-missing-outcome-hard-stop). |

**Full step-by-step behavior:** [reason-codes.md](reason-codes.md).

### Coverage check (feature / phase / session)

After filling the planning doc’s Analysis, Plan, and **## Decomposition**, re-read the goal and each child unit. In chat, answer whether the decomposition fully covers the goal; update the doc if not; then direct the user to **`/accepted-plan`**. Skipped for task tiers.

### Acceptance criteria verification (before tier-end)

Before directing the user to run **`/task-end`**, **`/session-end`**, etc., re-read **## Acceptance Criteria** (and **## Deliverables** when listed) from the planning doc. State in chat whether each was met and how. Not a harness gate — visible reasoning. Skip or shorten when **express** profile skipped planning.

### Deliverables drift vs coverage check (timing)

- **Coverage check:** Prompted during **plan mode** / `context_gathering` messaging in the planning doc instructions — answer in chat **before** the user runs **`/accepted-plan`**.
- **Deliverables drift:** Emitted during **tier-end** as an advisory markdown block (planned paths vs working tree). Same category as AC verification: **agent-led**, not a harness gate — use it for discussion, not automatic failure.

## Session structure and handoffs

- **Session label:** `## Session: [Phase].[Sub-Phase] - [Brief Description]`.
- Work **one sub-session at a time** with checkpoints.
- **End-of-session checklist:** (1) App starts (e.g. `npm run start:dev`), (2) Lint Vue client and server (`cd client && npm run lint`, `cd server && npm run lint`), (3) Update session log, (4) Handoff doc: **Current Status**, **Next Action**, **Transition Context**, **Last Updated** (see `.project-manager/REQUIRED_DOC_SECTIONS.md` if present in the repo), (5) Prompt user for commit and push when checks pass, (6) Compact hand-off: `@[HANDOFF_DOCUMENT] Continue [project] - start Sub-Session X.Y.Z (Description)`.
- **Quick fixes** may skip full session structure but still verify app starts and linting.

## On failure or missing outcome (hard stop)

- Show `controlPlaneDecision.message` **verbatim** (or raw error if no decision).
- **Do not** cascade to the next task, session, phase, or feature.
- **Do not** improvise next steps, read guides to guess the next command, or manually recreate artifacts the command should have produced.
- Present **User choice required** when present; **wait for the user** before acting.
- If `outcome` is missing or the command crashed: stop; do not continue as if success.

## Cascade

- When `outcome.cascade` is present: present the **User choice required** block; on confirmation, run **`outcome.cascade.command`** exactly (e.g. `/task-start …`, `/session-end …`).
- **`direction === 'across'`:** Next peer at same tier (e.g. next task in session).
- **`direction === 'up'`:** Parent tier end (e.g. session-end after last task).
- **Do not** manually `git merge` or `git branch -d` on tier branches between cascade steps — parent **tier-end** owns merge lifecycle.

## Bugbot (PR review)

- After **session / phase / feature** tier push, [`.cursor/commands/tiers/shared/accepted-push.ts`](../../commands/tiers/shared/accepted-push.ts) may append a hint to create a PR or comment `cursor review` on an existing PR.
- Bugbot is configured via Cursor dashboard + GitHub; it reviews PR diffs. Optional automated review — **not** a substitute for tier audits and governance.

## Progressive disclosure

- Implementation work: follow [`.cursor/rules/function-governance.mdc`](../../rules/function-governance.mdc), [composable-governance.mdc](../../rules/composable-governance.mdc), [component-governance.mdc](../../rules/component-governance.mdc), [type-governance.mdc](../../rules/type-governance.mdc), [coding-standards.mdc](../../rules/coding-standards.mdc).

## Anti-patterns

- Paraphrasing `controlPlaneDecision.message` on failure instead of showing it verbatim.
- Running `/accepted-push` from the agent when the flow expects the **user** to run it after `pending_push_confirmation`.
- Offering the next tier after failure or after a command crash.
- Using AskQuestion for tier command **User choice required** blocks.
