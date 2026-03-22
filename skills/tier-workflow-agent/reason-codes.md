# Reason codes — expanded agent behavior

Canonical reference: [`.cursor/commands/tiers/START_END_PLAYBOOK_STRUCTURE.md`](../../commands/tiers/START_END_PLAYBOOK_STRUCTURE.md) (Per-reasonCode behavioral rules and related sections).

**Runtime aliases:** Outcomes may emit legacy strings; [`.cursor/commands/harness/reason-code.ts`](../../commands/harness/reason-code.ts) maps them for [`.cursor/commands/tiers/shared/control-plane-route.ts`](../../commands/tiers/shared/control-plane-route.ts). If a code name differs between playbook and `result.outcome.reasonCode`, follow the **playbook section** intent and the router mapping.

Quick one-liners: [SKILL.md](SKILL.md) § Reason codes.

---

### validation_failed

- Start command validation blocked (e.g. session already complete, previous session unfinished, phase blocked, session not in phase guide).
- Present `outcome.nextAction` and stop.
- **Session branch exists:** If properly based on parent, start may proceed and `ensureTierBranch` checks out the branch. If diverged, user must rebase/delete per message before retry.

### audit_failed

- **Start:** Tier-start audit reported warnings or failures. Do not proceed until clean.
- Present `controlPlaneDecision.message` (includes audit context).
- Attempt autonomous fix via `/audit-fix` with report path from the message (or `npx tsx .cursor/commands/audit/atomic/audit-fix-prompt.ts [report-path]`).
- If all findings fixed autonomously: **re-run the same tier start** immediately (do not show choice block).
- If some findings need user input: present **User choice required** (Retry / audit-fix / Skip).
- **End:** Same spirit — fix governance issues; re-run tier-end; do not cascade on dirty audit.

### context_gathering

- **Step 1:** Command created a short planning doc. Agent **must** fill Goal, Files, Approach, Checkpoint, **How we build the tierDown** (one bullet line per child unit). User runs **`/accepted-proceed`** when ready (agent does not run it).
- Present `controlPlaneDecision.message` (insight / proposal / decision blocks). Open planning doc; refine in place as user answers.
- **Phase/session:** After first `/accepted-proceed`, may return **`guide_fill_pending`** — agent fills guide; user runs `/accepted-proceed` again (**Gate 2**).
- **Enumerate tierDowns** before inviting `/accepted-proceed`: session guide needs `Task X.Y.Z.N:` headings; phase guide lists sessions; sync list into planning doc bullets.
- Do not skip planning doc fill; command blocks with `planning_doc_incomplete` until filled.

### planning_doc_incomplete

- User ran `/accepted-proceed` or `/accepted-code` but placeholders remain in the planning doc.
- Present message verbatim. Agent **must** edit the planning doc (including **How we build the tierDown** bullets). User re-runs proceed command.

### guide_fill_pending

- After first `/accepted-proceed` for phase/session; Part A ran (branch, guide scaffold).
- Open `outcome.guidePath` / message path. Fill each Session/Task block; **do not** remove or merge blocks; targeted edits only.
- Preserve required guide sections; add from tier template if missing.
- User runs **`/accepted-proceed`** again for Gate 2.

### guide_incomplete

- Gate 2 failed: placeholders remain in guide tierDown blocks.
- Agent fills placeholders; user runs **`/accepted-proceed`** again.

### pending_push_confirmation

- Maps to router case **`pending_push`** after parse.
- End pipeline finished; push not done yet. Direct user: **`/accepted-push`** or **`/skip-push`**. Agent does not invoke these via shell as primary path.
- After push, if cascade present, follow cascade rules below.

### verification_work_suggested

- Maps to **`verification_suggested`** in router.
- Present `controlPlaneDecision.message` as verification checklist (bulleted, not raw JSON).
- Present **User choice required**: add follow-up task/session/phase vs “continue tier-end” / “skip” — re-invoke same tier-end with **`continuePastVerification: true`** when continuing.
- Do not ask open-ended “should we add validation?” — use the three fixed options.

### uncommitted_changes_blocking

- Maps to **`uncommitted_blocking`** in router.
- Non-`.cursor` / non-workflow-artifact files block checkout. Present file list.
- **Commit path:** commit, then re-invoke with `controlPlaneDecision.nextInvoke`.
- **Skip path:** stash, re-invoke, then `git stash pop` after command completes.
- Workflow-only paths may be auto-stashed; explain if user sees planning doc “disappear” briefly (stash pop restores).

### wrong_branch_before_commit

- Tier-end commit aborted: current branch ≠ expected tier branch.
- Present message (current vs expected). User checks out expected branch, resolves dirty tree if needed, **re-runs same tier-end**.

### expected_branch_missing_run_tier_start

- Tier-end commit step found the **expected branch name** but it **does not exist locally**. Tier-end does **not** create branches (only **tier-start** does).
- Present `controlPlaneDecision.message` verbatim (hints: `/feature-start`, `/phase-start`, `/session-start`, optional `git fetch`).
- User creates/checks out the branch per message, then **re-runs the same tier-end**.

### cascade

- When `outcome.cascade` is present (after start or end success, or after push in some flows):
  - Present **User choice required**: cascade to `[tier] [identifier]`? Yes — run `outcome.cascade.command` / No — stop with `nextAction`.
- **End:** `direction === 'across'` → next task (not session-end). `direction === 'up'` → parent tier end (e.g. `/session-end`).
- **Do not** manually merge session→phase or delete child branch before parent tier-end runs.

### task_complete

- Task-end success with optional cascade.
- If cascade: run cascade confirmation; on across, next is **`/task-start <nextTaskId>`**, not session-end unless direction is up.

### task_start_success

- After task-start execute (including after **`/accepted-code`**): output includes implementation orders and **`/task-end`** hint.
- Agent **implements** (code changes) **before** running **`/task-end`**. “Ready for task-end” means after implementation is done.

### session_start_success

- Review session context and first task. If cascade present, confirm cascade to first **`/task-start`**.

### reopen_ok

- Present **User choice required**: plan file vs plan from scratch vs quick fix. Route per user choice and playbook.

### failure_hard_stop

- Any **failure** (`success: false`) or unknown failure reasonCode: follow playbook **“If not success (HARD STOP)”**.
- Show `controlPlaneDecision.message` verbatim; present **User choice required** when present; **no cascade**; **no** improvised next tier; **wait for user**.
- **Crash / missing outcome:** Stop immediately; do not reconstruct command output from templates or impl files.

---

Back to quick reference: [SKILL.md](SKILL.md).
