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

- **Step 1:** Command created a planning doc. The agent **must fill the planning file immediately** — read Reference paths, write Analysis / Story / Design / Deliverables / AC (and Decomposition or **`**Leaf tier**`** for non-task). **Do not** treat `controlPlaneDecision.message` as instructions *for the user to follow alone*; you execute the fill, save the doc, then summarize in chat. User runs **`/accepted-plan`** when ready (feature/phase/session); tasks use **`/accepted-code`** (agent does not run those slash commands).
- Present `controlPlaneDecision.message` (includes **AGENT DIRECTIVE** + CONTEXT). Open planning doc; refine in place; discuss with the user only after you have drafted substantive sections.
- **Coverage check (non-task):** Before `/accepted-plan`, re-read Goal/Plan and Decomposition; confirm steps cover the goal in chat.
- **Phase/session (decomposition profile):** After **`/accepted-plan`**, may return **`guide_fill_pending`** — agent fills guide; user runs **`/accepted-build`** (**Gate 2**).
- **Enumerate tierDowns** before inviting **`/accepted-plan`**: session guide needs `Task X.Y.Z.N:` headings; phase guide lists sessions; sync list into planning doc decomposition.
- Do not skip planning doc fill; command blocks with `planning_doc_incomplete` until filled.

### planning_doc_incomplete

- User ran **`/accepted-plan`** or **`/accepted-code`** but placeholders remain in the planning doc.
- Present message verbatim. Agent **must** edit the planning doc. User re-runs the same accepted command.

### guide_fill_pending

- After **`/accepted-plan`** for phase/session (decomposition profile); Part A ran (branch, guide scaffold).
- Open `outcome.guidePath` / message path. Fill each Session/Task block; **do not** remove or merge blocks; targeted edits only.
- Preserve required guide sections; add from tier template if missing.
- User runs **`/accepted-build`** for Gate 2.

### guide_incomplete

- Gate 2 failed: placeholders remain in guide tierDown blocks.
- Agent fills placeholders; user runs **`/accepted-build`** again.

### pending_push_confirmation

- Maps to router case **`pending_push`** after parse.
- End pipeline finished; push not done yet. Direct user: **`/accepted-push`** or **`/skip-push`**. Agent does not invoke these via shell as primary path.
- After push, if cascade present, follow cascade rules below.

### verification_work_suggested

- Maps to **`verification_suggested`** in router.
- Present `controlPlaneDecision.message` as verification checklist (bulleted, not raw JSON).
- Present **User choice required**: add follow-up task/session/phase vs “continue tier-end” / “skip” — re-invoke same tier-end with **`continuePastVerification: true`** when continuing.
- Do not ask open-ended “should we add validation?” — use the three fixed options.

### gap_analysis_pending

- Router case **`gap_analysis_pending`** (same string in `LEGACY_TO_CHARTER`).
- Soft gate after **`deliverables_check`**: possible deliverables drift / scope gaps; **tier-add** + **tier-start** for follow-up tiers — no child planning docs created in tier-end.
- Present **User choice required** (`gap_analysis_options`). Continue via **`controlPlaneDecision.nextInvoke`** or manual re-run with **`continuePastGapAnalysis: true`** under **`params.options`** (not top-level).

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

### start_ok

- Start succeeded. Control plane returns `stop: false, requiredMode: 'agent'`.
- Handle optional cascade per playbook (cascade confirmation if `outcome.cascade` present).
- **Task tier (including after `/accepted-code`):** Output contains **Implementation Orders** (Goal, Files, Approach, Checkpoint) and a **`/task-end`** hint. The agent **must implement the task now** — read the task planning doc, write code, edit files per the orders. Do not summarize the plan back to the user; do not ask permission to begin; **write code immediately**. Run **`/task-end`** only after implementation is complete.
- **Session tier:** Review session context and first task. If cascade present, confirm cascade to first **`/task-start`**.
- **Feature / phase tier:** Present success; handle cascade to first child tier if present.

### reopen_ok

- Present **User choice required**: plan file vs plan from scratch vs quick fix. Route per user choice and playbook.

### planning_rollup_failed, doc_rollup_failed, gap_analysis_failed

- Emitted for **non-gating** tier-end step errors (rollup / gap analysis); often logged to `WORKFLOW_FRICTION_LOG.md` with `forcePolicy` rather than as a primary user-facing stop.
- If surfaced as an outcome: treat like other **failure_hard_stop** — fix the underlying path/archive issue; re-run tier-end if appropriate.

### fill_tier_down_failed

- Tier-start **fill_tier_down** step threw; fix paths/permissions per message; re-run tier-start in execute mode.

### planning_checks_failed

- **tier-add** planning pipeline (`runPlanningWithChecks`) threw; logged for diagnosis; command output still shows “Planning checks skipped”.

### failure_hard_stop

- Any **failure** (`success: false`) or unknown failure reasonCode: follow playbook **“If not success (HARD STOP)”**.
- Show `controlPlaneDecision.message` verbatim; present **User choice required** when present; **no cascade**; **no** improvised next tier; **wait for user**.
- **Crash / missing outcome:** Stop immediately; do not reconstruct command output from templates or impl files.

---

Back to quick reference: [SKILL.md](SKILL.md).
