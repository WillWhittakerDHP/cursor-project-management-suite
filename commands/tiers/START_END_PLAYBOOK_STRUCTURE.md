# Start/End Playbook Structure

All tier start/end commands (feature-start, feature-end, phase-start, phase-end, session-start, session-end, task-start, task-end) follow this structure so the agent has one place to learn "how start/end works." The procedure below applies to all start/end commands; the **command-to-entry-point table** gives the composite file and export to invoke. No separate playbook file is required.

## Command-to-entry-point table

| Slash command   | Composite file (from repo root)                                | Export to invoke |
|-----------------|----------------------------------------------------------------|------------------|
| feature-start   | .cursor/commands/tiers/feature/composite/feature.ts           | featureStart     |
| feature-end     | .cursor/commands/tiers/feature/composite/feature.ts           | featureEnd       |
| phase-start     | .cursor/commands/tiers/phase/composite/phase.ts                | phaseStart       |
| phase-end       | .cursor/commands/tiers/phase/composite/phase.ts                | phaseEnd         |
| session-start   | .cursor/commands/tiers/session/composite/session.ts           | sessionStart     |
| session-end     | .cursor/commands/tiers/session/composite/session.ts           | sessionEnd       |
| task-start      | .cursor/commands/tiers/task/composite/task.ts                  | taskStart        |
| task-end        | .cursor/commands/tiers/task/composite/task.ts                  | taskEnd          |

**Invocation:** From repo root, run the export via the project's TS runner. Example: `npx tsx -e "import('<path>').then(m => m.<export>(...)).then(r => console.log(JSON.stringify(r)))"`. Use the path and export name from the table above.

**No one-off runner scripts:** Do not create ad hoc tier wrappers like `run-task-start-*.ts`, `run-task-end-*.ts`, or `run-session-end-*.ts` (and similar `run-*-start/end-*.ts` files). Invoke composite exports directly with inline `tsx -e` imports so all tiers follow the same entrypoint pattern.

---

## Required sections (every playbook)

### Context

- User supplies only the identifier (F/P/S/T: feature number or name, phase number, session X.Y, task X.Y.Z). The agent never asks the user for a title or description.
- Where to get feature/phase/session/task (e.g. `.project-manager/.tier-scope`, command args).
- Context loading and derivation supply titles/descriptions/next identifiers from existing docs (see "Identifier-only input and context-derived titles" below).

### Optional prompts

- Only where needed (e.g. "Run tests?" when `TEST_CONFIG.enabled`).
- No second confirmation prompt (e.g. no "Ready to end? Proceed with /session-end?").
- List the exact prompt text and what param to set from the response.

### Call implementation

- Resolve the composite file and export from the command-to-entry-point table. Invoke that export with the params you gathered (see "How to invoke" below).
- Capture the return value.

### Handle result

Start and end commands return a structured result with `result.outcome`, `result.output`, and `result.controlPlaneDecision`. Use `result.outcome` for routing and `result.controlPlaneDecision` for user-facing presentation; do not infer behavior from step text or prose.

- **Start commands** return `TierStartResultWithControlPlane`: `{ success, output, outcome, modeGate?, controlPlaneDecision }`.
- **End commands** return a result with `outcome` and `controlPlaneDecision`: `{ success, output, outcome, controlPlaneDecision }`.

### Control-plane decision (user-facing presentation)

Every start/end/reopen command returns a `controlPlaneDecision` object that tells the agent **what to show the user** and **what to ask**:

| Field | Purpose |
|-------|---------|
| `message` | **User-facing content** — deliverables, checklists, file lists, or error context. Show this to the user. |
| `questionKey` | Identifies the AskQuestion template (see per-reasonCode rules below). |
| `requiredMode` | Mode the agent must switch to before presenting (`'plan'` or `'agent'`). |
| `stop` | If `true`, stop and wait for user response before proceeding. |
| `nextInvoke` | On approval, re-invoke this command (tier, action, params with `{ mode: 'execute' }`). |
| `cascadeCommand` | Exact command string to run on cascade confirmation. |

**Critical rule:** `controlPlaneDecision.message` is the **user-facing content**. `result.output` is **agent context** (workflow steps, branch info, audit details) — read it for your own understanding, but present `controlPlaneDecision.message` to the user. Do not dump `result.output` verbatim to the user; it contains internal workflow steps they do not need to see.

**AskQuestion = Cursor's question UI (clickable options).** When `controlPlaneDecision.questionKey` is set, you MUST use Cursor's **AskQuestion** feature so the user sees a prompt with **clickable option buttons**. Do NOT write the question and options as plain text in the chat — that does not count as AskQuestion and the user will not get the intended experience. The command output may include a "REQUIRED — Use AskQuestion" block; follow it. Present `controlPlaneDecision.message` as the body of the question and use the options specified for that `questionKey` in the per-reasonCode rules below.

**Mode switching at transitions:** Each routing case below involves a mode transition. The agent MUST switch to the correct mode before performing the action: Plan mode for AskQuestion and CreatePlan; Agent mode for command execution and file writes. After the user answers an AskQuestion, switch back to Agent mode if the next step is to execute (run command, write files).

Routing (use `outcome.reasonCode`):

- If `outcome.reasonCode === 'plan_mode'`: see **Per-reasonCode behavioral rules → `plan_mode`** below.
- If `outcome.reasonCode === 'context_gathering'`: see **Per-reasonCode behavioral rules → `context_gathering`** below.
- If `outcome.reasonCode === 'pending_push_confirmation'`: see **Per-reasonCode behavioral rules → `pending_push_confirmation`** below.
- If `outcome.reasonCode === 'verification_work_suggested'`: see **Per-reasonCode behavioral rules → `verification_work_suggested`** below.
- If `outcome.reasonCode === 'uncommitted_changes_blocking'`: see **Per-reasonCode behavioral rules → `uncommitted_changes_blocking`** below.
- **If `outcome.cascade` is present (start or end):** You MUST run **Cascade confirmation** first. Do not skip to `nextAction` or infer the next step (e.g. do not assume "session roll-up" when the cascade is to the next task). Cascade direction: `outcome.cascade.direction === 'across'` → next step is the **next tier at same level** (e.g. next task via `outcome.cascade.command`, typically `/task-start <nextTaskId>`); `'up'` → next step is **parent tier end** (e.g. `/session-end <sessionId>`). See **Per-reasonCode behavioral rules → Cascade confirmation** below.
- If success and no push/cascade pending: show `controlPlaneDecision.message`; then use `outcome.nextAction`.
- **If not success (HARD STOP):**
  1. **Switch to Plan mode (Ask mode) immediately.** The `enforceModeSwitch` block prepended to the output will say "STOP — Command Failed" when `success` is false; follow it.
  2. Show `controlPlaneDecision.message` to the user. Do not paraphrase or expand.
  3. Use **AskQuestion**: "How would you like to proceed?" with options: "Retry the command" / "Investigate the issue" / "Skip and continue manually".
  4. **Do NOT cascade.** Do not offer to start the next task, session, phase, or feature. Do not check `outcome.cascade` — on failure, cascade is never present and must never be improvised.
  5. **Do NOT improvise next steps.** Do not read session guides to find the next task. Do not offer to run a different command. Do not create documents the command was supposed to create.
  6. **Wait for the user's response** to AskQuestion before taking any action.

### On command crash or missing outcome

If the command throws, exits with non-zero code, or the result has no `outcome` (e.g. `outcome` is `undefined`):

1. **Switch to Plan mode (Ask mode) immediately.**
2. Report `controlPlaneDecision.message` (or the raw error output if no decision was produced) to the user **verbatim**.
3. **STOP immediately.** Do NOT:
   - Manually create documents the command was supposed to create (guides, logs, handoffs)
   - Reconstruct the command's expected output by reading templates or impl files
   - Improvise a session-start/end response by assembling pieces from the codebase
   - Create TODO lists or plans based on what the command "would have done"
   - Offer to cascade to the next tier (start next task, end next session, etc.)
   - Stay in Agent mode and continue executing
4. Use **AskQuestion**: "The command crashed. How would you like to proceed?" with options: "Retry" / "Investigate" / "Skip".
5. The user must fix the underlying issue (missing files, broken impl, etc.) and re-run the command.
6. If the error message suggests a specific fix (e.g. "file not found"), you may point that out, but do NOT apply the fix and silently re-run.

**Why this rule exists:** When commands fail, the agent has historically read template files and impl code, then manually recreated the command's expected output — producing documents and plans that bypass the command's validation, audit, and cascade logic. The agent has also stayed in Agent mode after failures and offered to cascade to the next tier, compounding the problem. Both behaviors create invisible inconsistencies across sessions.

### Outcome rule

- **User-facing content:** Always present `controlPlaneDecision.message` to the user — this is the deliverables, checklists, or error context they need to see.
- **Agent next step:** Use `result.outcome.nextAction` for what to do next (routing hint for the agent).
- For push and cascade confirmation sequences, see the per-reasonCode behavioral rules below.

### Failure mode enforcement (code + playbook)

The `enforceModeSwitch` function in `command-execution-mode.ts` accepts a `reason` parameter (`'normal'` | `'failure'`). All three dispatchers (`tier-start.ts`, `tier-end.ts`, `tier-reopen.ts`) pass `reason: 'failure'` when `result.success === false`. This causes the prepended block to say **"STOP — [command] Failed — Plan (Ask) Mode Required"** and reference this playbook.

The code header is a **short mode declaration** only. All behavioral rules (what to do on failure, how to use AskQuestion, when not to cascade) live here in this playbook — not in the code. The code returns structured data (`status`, `reasonCode`, `nextAction`, `cascade`); the playbook tells the agent how to handle each case.

---

## Code vs. playbook responsibility

| In code (`.ts` files) | In playbook (this document) |
|---|---|
| Structured data: `status`, `reasonCode`, `cascade`, identifiers | Behavioral rules: mode switching, AskQuestion usage, stop conditions |
| Status messages: "Tests passed", "Branch created", "Task X complete" | Workflow scripts: approval sequences, cascade confirmation, failure handling |
| Short routing hints in `nextAction`: "Push pending. Then cascade if present." | How to handle each `reasonCode`: step-by-step agent behavior |
| Mode header: "Mode: Agent — /task-end" (one line) | What "Agent mode" means: write files, run git, switch to Plan for confirmations |

**Anti-pattern:** Code must NOT contain agent behavioral instructions like "Switch to Plan mode", "Use AskQuestion", "Do NOT cascade", "BEGIN IMPLEMENTATION — The agent should now write code". These belong exclusively in the playbook. Code returns *what happened* and *what's next* (data); the playbook says *how to handle it* (behavior).

**Anti-pattern (AskQuestion):** Do not present an approval or choice question as plain text in the chat (e.g. "Approve this plan and execute? Yes — execute / No — revise"). When `controlPlaneDecision.questionKey` is set, you must use the AskQuestion feature so the user gets clickable options. Writing the question in markdown is not AskQuestion.

---

## Per-reasonCode behavioral rules

These rules tell the agent what to do for each `reasonCode` returned by commands. The code returns the `reasonCode`; the playbook defines the behavior.

**Failure reasonCodes:** Any `reasonCode` not listed below (e.g. `lint_or_typecheck_failed`, `test_failed`, `test_code_error`, `test_goal_validation_failed`, `vue_architecture_gate_failed`, etc.) indicates a failure. All failure reasonCodes follow the **"If not success (HARD STOP)"** rule in the Routing section above.

### `plan_mode` (start commands, default mode)

The user is approving what we're about to build. `controlPlaneDecision.message` contains the **deliverables** — the concrete tasks, goals, files, and acceptance criteria the user needs to see. `result.output` contains agent context (branch hierarchy, workflow steps, audit data) — read it for your own understanding but do not show it verbatim.

1. **Switch to Plan mode** (Ask mode).
2. **Present `controlPlaneDecision.message`** to the user — this is the deliverables summary (e.g. task list for a session, goal/files/approach for a task, phase list for a feature). Show it as formatted text, not as a code block or raw JSON.
3. **Use AskQuestion (Cursor's question UI)** with prompt "Approve this plan and execute?" and **clickable options**: "Yes — execute" / "No — revise". Do not write this question as plain chat text; the user must see the AskQuestion UI with buttons.
4. On "Yes": **switch to Agent mode**, then re-invoke the same command with **`{ mode: 'execute' }`** using `controlPlaneDecision.nextInvoke` (tier, action, params). You must call the composite directly (e.g. `sessionStart(sessionId, undefined, { mode: 'execute' })`) so the third argument is passed; do not re-run a script or slash command that only accepts the identifier, or the second run will still be plan mode and execute will never run.

### `context_gathering` (start commands, task and session tiers)

The command loaded context and governance data, created a planning document, and generated initial questions. The agent now conducts an iterative planning conversation with the user, updating the planning document in-place.

1. **Switch to Plan mode.**
2. **Present `controlPlaneDecision.message`** (initial questions + planning doc path).
3. **Open the planning doc in the editor** so the user can watch it being built.
4. Begin the iterative Q&A loop:
   a. Ask the context questions from the message.
   b. After each user answer, **update the planning doc IN-PLACE:**
      - Move answered items from "Open Questions" to "Decisions Made"
      - Refine Goal, Files, Approach, Checkpoint based on answers
      - Add follow-up questions to "Open Questions" if new gaps appear
   c. Use **AskQuestion** with the remaining/new questions **plus** always include: **"I'm satisfied with our plan and ready to begin"**
   d. Repeat until the user selects "satisfied".
5. On **"I'm satisfied"**:
   a. Switch to Agent mode.
   b. Read the refined Goal, Files, Approach, Checkpoint from the planning doc.
   c. Write them into the session guide task section (replacing placeholders).
   d. Re-invoke the original command with **`{ mode: 'execute', contextGatheringComplete: true }`** using `controlPlaneDecision.nextInvoke`.

**Anti-pattern:** Do not skip the planning doc. Do not ask all questions at once without updating the doc. The doc IS the artifact — the user watches it being built and the final version feeds into the session guide.

### `pending_push_confirmation` (end commands)

1. Switch to Plan mode. Use **AskQuestion**: "All checks passed. Proceed with push to remote?" Options: "Yes — push to remote" / "No — skip push".
2. On "Yes": switch to Agent mode, run `git push`. Then check `outcome.cascade`.
3. On "No": skip push. Then check `outcome.cascade`.
4. If `outcome.cascade` is present: run **cascade confirmation** (see below).

### `verification_work_suggested` (end commands)

Suggested manual verification for this tier. The checklist is for **verifying what we built** (product behavior, UX, correctness), not for verifying that documentation was created. Do not use "test" in playbook wording for this flow.

1. Switch to Plan mode.
2. **Always present `controlPlaneDecision.message` as the verification checklist.** This contains the deliverables-based checklist (what to verify, what we built, artifacts/docs). Show it as a formatted, bulleted list — not as a code block or raw JSON. Present "What to verify (what we built)" first when present; then "Artifacts / docs" if present. Do not ask whether to add a validation step or whether the list is appropriate.
3. Use **AskQuestion** only to choose how to proceed: "Suggested verification/fix work for this tier. How do you want to proceed?" Options:
   - **"Add follow-up task"** (session-end), **"Add follow-up session"** (phase-end), or **"Add follow-up phase"** (feature-end): use existing planning + start with context; pass the checklist as the scope/description for the new task, session, or phase (e.g. `/plan-task [sessionId]` with description derived from the checklist, then cascade to task-start; or plan-session / plan-phase for next session or phase with that scope, then session-start or phase-start). After the user completes that work, they run the same tier-end again; they may pass `continuePastVerification: true` to skip this prompt and run audits.
   - **"I'll do it manually; continue tier-end"**: switch to Agent mode, re-invoke the same tier-end command with `continuePastVerification: true` so the workflow continues past the verification step and runs audits.
   - **"Skip; continue tier-end"**: same as above — re-invoke with `continuePastVerification: true`.

**Anti-pattern:** Do not ask "Should I add a task to add a validation step?" or similar. The checklist is the fixed list of verification todos; show it, then offer the three options only.

### `uncommitted_changes_blocking` (start/end/reopen commands)

The command detected uncommitted non-`.cursor` files that would be overwritten by a branch checkout. (Changes in the `.cursor` directory are auto-committed silently.) `controlPlaneDecision.message` contains the list of blocking files.

1. Switch to Plan mode.
2. **Present `controlPlaneDecision.message`** to the user — this lists the uncommitted files blocking checkout.
3. Use **AskQuestion**: "Uncommitted changes are blocking the branch switch. How do you want to proceed?" Options: "Commit changes" / "Skip (stash and continue)".
4. On "Commit changes": switch to Agent mode, run `git add -A && git commit -m "chore: commit changes before branch switch"`, then re-invoke the original command using `controlPlaneDecision.nextInvoke`.
5. On "Skip": switch to Agent mode, run `git stash --include-untracked`, then re-invoke the original command using `controlPlaneDecision.nextInvoke`. After the command completes, run `git stash pop` to restore the stashed changes.

### Cascade confirmation (start and end commands)

When `outcome.cascade` is present:

1. Switch to Plan mode. Use **AskQuestion**: "Cascade to [outcome.cascade.tier] [outcome.cascade.identifier]?" Options: "Yes — [outcome.cascade.command]" / "No — stop here".
2. On "Yes": switch to Agent mode, invoke `outcome.cascade.command`.
3. On "No": show `outcome.nextAction` and stop.

**Cascade direction (end commands):** For task-end, `direction === 'across'` means there is a **next task** in the session — the next step is to run the next task (e.g. `/task-start <nextTaskId>`), not to end the session. Only when `direction === 'up'` is the next step to end the parent tier (e.g. `/session-end <sessionId>`). Always use `outcome.cascade.command` as the exact next command.

### `task_complete` (task-end)

- **If `outcome.cascade` is present:** Run **Cascade confirmation** (see above). Do not offer session-end or "roll up" unless `outcome.cascade.direction === 'up'`. When `direction === 'across'`, the next step is the **next task** — invoke `outcome.cascade.command` (e.g. `/task-start <nextTaskId>`) on "Yes", not `/session-end`.
- If no cascade: task is done. Show `outcome.nextAction`.

### Task-start success (after execute mode)

After task-start succeeds, the output contains **Implementation Orders** with task details (Goal, Files, Approach, Checkpoint) and the end command. The agent:

1. Begins implementing the task (write code, modify files).
2. Works through the implementation orders.
3. When complete, runs the `/task-end` command shown in the output.

### Session-start success (after execute mode)

After session-start succeeds, the output contains task planning data (first task details, compact prompt). The agent:

1. Reviews the session context and first task details.
2. If `outcome.cascade` is present: run **cascade confirmation** to start the first task.
3. If no cascade: show the compact prompt.

### Reopen success

After a reopen succeeds, the output shows the next step (plan child tier or make changes). The agent:

1. Switch to Plan mode. Use **AskQuestion**: "Is there a plan you want to build this tier around?" Options: "Yes — I have a plan file" / "No — plan from scratch" / "No — just a quick fix".
2. On "Yes" with plan file: switch to Agent mode, read the file, pass as `planContent` to the plan command.
3. On "No — plan from scratch": switch to Agent mode, run the plan command without `planContent`.
4. On "No — quick fix": switch to Agent mode, make changes, run tier-end when done.

---

## How to invoke (shared rule)

When the procedure says "call implementation", the agent:

1. Resolves the slash command name (e.g. feature-start) to the **composite file path** and **export name** using the command-to-entry-point table above.
2. From repo root, invokes that export with the params gathered from context and prompts.
3. Invocation method: e.g. `npx tsx -e "import('<path-to-composite>').then(m => m.<exportedFn>({ ... })).then(r => console.log(JSON.stringify(r)))"` or the project's standard way to run a TS export and capture the return value. Path and export name come from the table.
4. Captures the return value and proceeds to "Handle result" per the procedure.

### Canonical inline examples (no temp scripts)

- Feature start: `npx tsx -e "import('./.cursor/commands/tiers/feature/composite/feature.ts').then(m => m.featureStart('6')).then(r => console.log(r))"`
- Phase start: `npx tsx -e "import('./.cursor/commands/tiers/phase/composite/phase.ts').then(m => m.phaseStart('6.2')).then(r => console.log(r))"`
- Session start (plan preview; default is plan): `npx tsx -e "import('./.cursor/commands/tiers/session/composite/session.ts').then(m => m.sessionStart('6.2.1')).then(r => console.log(JSON.stringify(r)))"`
- Session start (execute after approval): `npx tsx -e "import('./.cursor/commands/tiers/session/composite/session.ts').then(m => m.sessionStart('6.2.1', undefined, { mode: 'execute' })).then(r => console.log(JSON.stringify(r)))"`
- Task start: `npx tsx -e "import('./.cursor/commands/tiers/task/composite/task.ts').then(m => m.taskStart('6.2.1.4')).then(r => console.log(JSON.stringify(r)))"`
- Task start (execute after approval): `npx tsx -e "import('./.cursor/commands/tiers/task/composite/task.ts').then(m => m.taskStart('6.2.1.4', { mode: 'execute' })).then(r => console.log(JSON.stringify(r)))"`

**Session-start and phase-start (plan then execute):** Start commands default to **plan** mode. First invocation: no options — user sees the plan. When the user has approved and the agent is in **Agent mode**, invoke again with **`{ mode: 'execute' }`** so the command runs the steps (branch creation, scope update, etc.). Example: `sessionStart(sessionId, description, { mode: 'execute' })`. **Task-start:** Pass options as the second argument when you do not need to pass featureId: `taskStart(taskId, { mode: 'execute' })` (no `undefined` placeholder).

---

## Mode and switching gate

All mode logic lives in one file: `.cursor/commands/utils/command-execution-mode.ts`. Tier-specific impls (session-start-impl, phase-end-impl, etc.) do **not** add mode messages; they only branch on `isPlanMode(mode)` for their internal steps. The gate text is injected by the **generic dispatcher** for each operation.

### Types

| Type | Values | Purpose |
|------|--------|---------|
| `CommandExecutionMode` | `'plan'` / `'execute'` | Code-level branch: does the impl preview or run side effects? |
| `CursorMode` | `'plan'` / `'agent'` | Cursor IDE mode the agent should be in |

`cursorModeForExecution(executionMode)` maps one to the other: `plan` → `plan`, `execute` → `agent`.

### Where the gate is applied

| Generic dispatcher | Gate mode | How gate is delivered |
|---|---|---|
| `tier-start.ts` → `runTierStart` | Derived from `options.mode` (default plan) | `modeGate` field on result object |
| `tier-end.ts` → `runTierEnd` | Derived from `params.mode` (default execute) | `modeGate` field on result object |
| `tier-plan.ts` → `runTierPlan` | Always `plan` | Prepended to result string |
| `tier-change.ts` → `runTierChange` | Always `plan` | Prepended to `output` field in result |

### Rules

- **Switch to Plan mode whenever you need to ask the user a question.** Before any AskQuestion or CreatePlan, switch to Plan mode (Ask mode). After the user responds, if the next step is to execute (run a command, write files, git operations), switch to Agent mode. Do not ask questions in Agent mode; do not execute or write in Plan mode.
- **Mode switching is mandatory, not advisory.** Plan mode (Ask mode) is required for AskQuestion and CreatePlan. Agent mode is required for file writes, git operations, and command execution. Before each action, verify the mode matches. The `enforceModeSwitch` header at the top of every command output states the required mode; the per-reasonCode rules below define the behavioral workflow.
- **Execute/build** (branch creation, scope update, file writes, merges, etc.) happen in **Agent mode**, after the user has approved and the command is invoked with `{ mode: 'execute' }`.
- The mode header comes from `enforceModeSwitch(requiredMode, commandName)` in `command-execution-mode.ts`. It is a **short declaration** only (e.g. "Mode: Agent — /task-end"); all behavioral rules live in this playbook.
- Tier-specific impls do not call `modeGateText` or produce mode messages — the generic dispatchers handle that. Impls return **data only** in `nextAction` strings (e.g. "Push pending. Then cascade if present.") — no behavioral scripts.

---

## Start workflow architecture (dry-out guardrails)

**Shared workflow only.** All tier **start** commands use a single orchestrator and reusable step modules. The workflow is defined in:

- **Orchestrator:** `.cursor/commands/tiers/shared/tier-start-workflow.ts` — `runTierStartWorkflow(ctx, hooks)` runs the pipeline: validate → branch (optional) → ensure child docs → read context → gather context → governance → context gathering (optional Q&A; task/session) → extras → start audit → tier plan → fill direct children → trailing output (optional) → cascade.
- **Step modules:** `.cursor/commands/tiers/shared/tier-start-steps.ts` — Reusable steps (e.g. `stepValidateStart`, `stepEnsureStartBranch`, `stepReadStartContext`, `stepStartAudit`, `stepRunTierPlan`, `stepBuildStartCascade`) use shared primitives (`formatBranchHierarchy`, `ensureTierBranch`, `runTierPlan`, `buildCascadeDown`, `runStartAuditForTier`).
- **Start audit entry point:** `.cursor/commands/audit/run-start-audit-for-tier.ts` — `runStartAuditForTier({ tier, identifier, featureName })` dispatches to feature/phase/session start audits; task has no start audit.

**Impls are tier adapters only.** Each `*-start-impl.ts` (feature, phase, session, task) must:

- Build a `TierStartWorkflowContext` and a `TierStartWorkflowHooks` object (tier-specific: validation, branch options, read/gather, optional audit, cascade child id, compact prompt).
- Call `runTierStartWorkflow(ctx, hooks)` and return its result.
- **Not** re-implement or inline the workflow sequence (no copying validate → branch → read → audit → plan → cascade into the impl). Any new step that belongs in the start pipeline belongs in the orchestrator or step modules, not in a single tier impl.

**Anti-regression:** When adding or changing start behavior, add or change it in the shared workflow or step modules and/or in the hooks contract; do not re-inline workflow steps into `feature-start-impl.ts`, `phase-start-impl.ts`, `session-start-impl.ts`, or `task-start-impl.ts`.

---

## End workflow architecture (dry-out guardrails)

**Shared workflow only.** All tier **end** commands use a single orchestrator and reusable step modules. The workflow is defined in:

- **Orchestrator:** `.cursor/commands/tiers/shared/tier-end-workflow.ts` — `runTierEndWorkflow(ctx, hooks)` runs the pipeline: plan exit → resolve runTests → preWork → test goal validation → runTests → midWork → comment cleanup → readme cleanup → git → end audit → clear scope → build cascade.
- **Step modules:** `.cursor/commands/tiers/shared/tier-end-steps.ts` — Reusable steps (e.g. `stepPlanModeExit`, `stepResolveRunTests`, `stepTierPreWork`, `stepTestGoalValidation`, `stepRunTests`, `stepTierMidWork`, `stepCommentCleanup`, `stepReadmeCleanup`, `stepTierGit`, `stepEndAudit`, `stepClearScope`, `stepBuildEndCascade`) use shared primitives and tier-supplied hooks.
- **End audit entry point:** `.cursor/commands/audit/run-end-audit-for-tier.ts` — `runEndAuditForTier({ tier, identifier, params, featureName })` dispatches to `auditFeature`, `auditCodeQuality` (phase/session), or `auditTask`.

**Impls are tier adapters only.** Each `*-end-impl.ts` (feature, phase, session, task) must:

- Build a `TierEndWorkflowContext` and a `TierEndWorkflowHooks` object (tier-specific: plan steps, preWork, midWork, git, tests, comment cleanup, audit, cascade, success outcome).
- Call `runTierEndWorkflow(ctx, hooks)` and map the result to the tier’s existing return type (e.g. `FeatureEndResult`, `PhaseEndResult`, `SessionEndResult`, or task’s `{ success, output, outcome }`).
- **Not** re-implement or inline the workflow sequence. Any new step that belongs in the end pipeline belongs in the orchestrator or step modules, not in a single tier impl.

**Anti-regression:** When adding or changing end behavior, add or change it in the shared workflow or step modules and/or in the hooks contract; do not re-inline workflow steps into `feature-end-impl.ts`, `phase-end-impl.ts`, `session-end-impl.ts`, or `task-end-impl.ts`.

---

## Type governance (session tier)

Session-tier type governance is enforced via cursor rules, a reference playbook, and the existing baseline comparison pipeline.

- **Cursor rules (always-applied):** `.cursor/rules/type-governance.mdc` (inventory, Ref/ComputedRef boundaries, InjectionKey, null/undefined, type placement; session-tier type-escape and type-constant-inventory).
- **Reference playbook:** `.project-manager/TYPE_AUTHORING_PLAYBOOK.md` — decision trees (create vs reuse vs inline), Vue reactivity boundary table, null/undefined policy, assertion policy, placement, Definition of Done, common mistakes, and audit rule mapping.
- **Baseline comparison:** Type governance deltas are tracked through the existing session baseline. Session-start stores a `type-constant-inventory` score (derived from `client/.audit-reports/type-constant-inventory-audit.json`); session-end includes the same category in end scores. The audit report and comparison output show type-constant-inventory alongside other session categories (e.g. tier-quality, docs, vue-architecture).
- **Session-end checklist:** Immediately before the session end audit, the workflow emits a soft type-governance self-check (decision tree, no new escape hatches, Ref/ComputedRef boundaries). Enforcement remains automated via type-escape and type-constant-inventory audits in `audit:tier-session`.

When creating or updating session guides (e.g. under `.project-manager/features/.../sessions/*-guide.md`), agents should follow the type-governance rule and the playbook for any new or changed types referenced in the session.

---

## Composable governance (session tier)

Session-tier composable and function governance is enforced via cursor rules, a reference playbook, and the existing baseline comparison pipeline.

- **Cursor rules (always-applied):** `.cursor/rules/composable-governance.mdc` (flat contracts, action-based mutation, Ref/ComputedRef boundaries, InjectionKey, no branch-heavy logic in composables; session-tier composable-health and composables-logic).
- **Reference playbook:** `.project-manager/COMPOSABLE_AUTHORING_PLAYBOOK.md` — decision tree (flat vs split vs facade), composable contract table, mutation and injection boundary policy, function governance thresholds, Definition of Done, common mistakes, and audit rule mapping.
- **Baseline comparison:** Composable governance deltas are tracked through the existing session baseline. Session-start stores a `composable-governance` score (derived from composable-health and function-complexity audit JSON); session-end includes the same category in end scores. The audit report and comparison output show composable-governance alongside other session categories.
- **Session-end checklist:** Immediately before the session end audit, the workflow emits a soft composable-governance self-check (flat contract, action-based mutation, no Ref|ComputedRef unions, explicit return types). Enforcement remains automated via composable-health, composables-logic, and function-complexity audits in `audit:tier-session`.

When creating or updating session guides or implementing session work, agents should follow the composable-governance rule and the playbook for flat, test-friendly composable contracts and action-based mutation.

---

## Function governance (session tier)

Session-tier function governance is enforced via cursor rules, a reference playbook, and the baseline comparison pipeline.

- **Cursor rules (always-applied):** `.cursor/rules/function-governance.mdc` (thresholds, explicit return types, no silent errors; session-tier function-complexity and function-governance baseline).
- **Reference playbook:** `.project-manager/FUNCTION_AUTHORING_PLAYBOOK.md` — thresholds table, decision tree (extract vs keep vs allowlist), return type and error-handling policy, Definition of Done, anti-patterns, audit rule mapping, and baseline score formula.
- **Baseline comparison:** Function-governance score is stored at session-start and compared at session-end. The score is derived from `function-complexity-audit.json` only (100 − P0×3 − P1×1, cap 0–100). The audit report and comparison output show `function-governance` as a dedicated category.
- **Session-end checklist:** Immediately before the session end audit, the workflow emits a function-governance self-check (complexity thresholds, explicit return types, no silent error swallowing, heavy logic extracted to named utilities).

When creating or updating session guides or implementing session work, agents should follow function governance when adding or changing functions (see the playbook and rules above).

---

## Component governance (session tier)

Session-tier component governance is enforced via cursor rules, a reference playbook, and the baseline comparison pipeline.

- **Cursor rules (always-applied):** `.cursor/rules/component-governance.mdc` (boundaries, thresholds, reusability; session-tier component-logic and component-health, component-governance baseline).
- **Reference playbook:** `.project-manager/COMPONENT_AUTHORING_PLAYBOOK.md` — thresholds table, decision tree (extract vs keep vs allowlist), boundary policy, Definition of Done, anti-patterns, audit rule mapping, and baseline score formula.
- **Baseline comparison:** Component-governance score is stored at session-start and compared at session-end. The score is derived from `component-health-audit.json` only (100 − P0×3 − P1×1, cap 0–100). The audit report and comparison output show `component-governance` as a dedicated category.
- **Session-end checklist:** Immediately before the session end audit, the workflow emits a component-governance self-check (prop/emit/coupling/template thresholds, thin components, no new Tier1 hotspots without extraction/allowlist, template depth and expression limits).

When creating or updating session guides or implementing session work, agents should follow component governance when adding or changing Vue components (see the playbook and rules above).

---

## Reopen workflow architecture (dry-out guardrails)

**Shared workflow only.** Tier **reopen** (feature, phase, session) uses a single orchestrator and reusable step modules. Task reopen is not supported. The workflow is defined in:

- **Orchestrator:** `.cursor/commands/tiers/shared/tier-reopen-workflow.ts` — `runTierReopenWorkflow(ctx, hooks)` runs: validate → writeReopenedStatus → updateGuideAndLog (hook) → ensureBranch (hook) → updateScope → appendNextAction → return TierReopenResult.
- **Step modules:** `.cursor/commands/tiers/shared/tier-reopen-steps.ts` — Reusable steps (`stepValidateReopen`, `stepWriteReopenedStatus`, `stepUpdateGuideAndLog`, `stepEnsureBranch`, `stepUpdateScope`, `stepAppendNextAction`) and helpers (`flipCompleteToReopened`, `formatReopenEntry`).

**Impls are tier adapters only.** Each `*-reopen-impl.ts` (feature, phase, session) must build context and hooks and call `runTierReopenWorkflow(ctx, hooks)`. Do not re-inline reopen steps into `.cursor/commands/tiers/shared/tier-reopen.ts` or the three impl files.

---

## Shared outcome contract (start and end commands)

Start commands return **TierStartResult**: `{ success, output, outcome, modeGate? }`. End commands return a result with **outcome**: `{ status, reasonCode, nextAction, cascade? }`. Both use the same outcome shape for routing:

- `status`: e.g. `'completed' | 'blocked_needs_input' | 'blocked_fix_required' | 'failed'` (or for start: `'plan'`)
- `reasonCode`: short code (e.g. `'pending_push_confirmation'`, `'plan_mode'`)
- `nextAction`: single string the agent shows or follows next
- `cascade?`: when present, **CascadeInfo** `{ direction, tier, identifier, command }` — the command is derived generically from `tierUp`/`tierDown` (no tier-specific names in the contract)

Use `result.outcome.nextAction` for the next step; do not infer from `result.steps` or prose.

**Push confirmation and cascade:** For the step-by-step agent behavior when `outcome.reasonCode === 'pending_push_confirmation'` or when `outcome.cascade` is present, see the **Per-reasonCode behavioral rules** section (`pending_push_confirmation` and **Cascade confirmation**). No tier-specific names in cascade — use `outcome.cascade.tier` and `outcome.cascade.command` only.

---

## ID format hierarchy

Each tier has a strict dotted-number ID format. No "or" conditions — reject IDs that don't match.

| Tier | Format | Example | Parts |
|------|--------|---------|-------|
| Feature | `X` | `3` | Feature number |
| Phase | `X.Y` | `4.1` | Feature.Phase |
| Session | `X.Y.Z` | `4.1.3` | Feature.Phase.Session |
| Task | `X.Y.Z.A` | `4.1.3.1` | Feature.Phase.Session.Task |

**Rules:**
- Feature IDs are single numbers resolved from `PROJECT_PLAN.md`.
- Phase IDs always contain exactly one dot.
- Session IDs always contain exactly two dots.
- Task IDs always contain exactly three dots.
- If an ID has the wrong number of dots for its tier, reject it as an error. Do not guess or fallback.
- Parent IDs can be extracted by dropping the last segment (e.g., Task `4.1.3.1` → Session `4.1.3` → Phase `4.1`).

---

## Tier scope config (.tier-scope)

The file `.project-manager/.tier-scope` is the single source of truth for the current feature, phase, session, and task. It replaces the legacy `.current-feature` file.

**File format:** Dotted keys per tier; each tier has `id` (hierarchical identifier for commands/branches) and `name` (human-readable for display/commits).

```
feature.id=calendar-appointment-availability
feature.name=Calendar Appointment Availability
phase.id=3.6
phase.name=Google Calendar Sync
session.id=3.6.2
session.name=Slot Calculation Refactor
task.id=3.6.2.1
task.name=Update Time Slot Composable
```

**Lifecycle:**
- **Start commands** write scope after successful branch/setup: feature-start writes `feature`, phase-start writes `phase` (and clears session/task), session-start writes `session` (and clears task), task-start writes `task`.
- **End commands** clear scope: feature-end calls `clearTierScope()`; phase-end, session-end, and task-end call `updateTierScope(tier, null)` for their tier (clearing that tier and all children).
- **Tier reopen** writes scope when reopening a tier (derives name from parent guide, then `updateTierScope(tier, { id, name })`).

**Naming rule (parents name children):** The naming event happens during **parent planning**. `appendChildToParentDoc` (used by plan-feature, plan-phase, plan-session) writes entries like `### Phase 3.6: Google Calendar Sync` into the parent's guide. When the **child** tier starts, it derives its name from the parent guide via `derivePhaseDescription`, `deriveSessionDescription`, or `deriveTaskDescription` and writes `{ id, name }` to scope.

**Hierarchy clearing:** When a tier is updated, all child tiers are cleared (e.g. updating `phase` clears `session` and `task`). When a tier is set to `null` at end, that tier and its children are cleared.

**Display and commits:** Use `formatScopeDisplay(scope)` for command output. Use `formatScopeCommitPrefix(scope, tier)` for commit messages (e.g. `[3.6.2: Slot Calculation Refactor] completion`). Branch names continue to use numbers only (e.g. `-phase-3.6-session-3.6.2`).

**Backward compatibility:** `FeatureContext.getCurrent()` and `resolveFeatureName()` read from `.tier-scope` (feature.id). On first read, if `.tier-scope` is missing but `.current-feature` exists, it is migrated and the legacy file is removed.

---

## Tier navigation

Adjacent-tier transitions use **tierUp**, **tierAt**, and **tierDown** (see `.cursor/commands/utils/tier-navigation.ts`).

- **tierAt(tier, identifier)** — Current tier context (identity). Use for "we are here" and prompts.
- **tierUp(tier)** — Parent tier: task→session, session→phase, phase→feature, feature→null. Use when there is no next unit at the current tier: the next step is to run the **parent tier end** (the command is derived from `tierUp(config.name)` — no hardcoded tier names).
- **tierDown(tier)** — Child tier: feature→phase, phase→session, session→task, task→null. Use after a tier start for **cascade** (see below).

**Identifier naming:** All tier identifiers use the `{tier}Id` pattern: `featureId`, `phaseId`, `sessionId`, `taskId`. Feature identifiers are numeric (e.g. `"3"`) and resolved to the feature name from PROJECT_PLAN.md via `resolveFeatureId`.

**Start includes plan:** Each start impl runs `runTierPlan` for the same tier internally after setup (validation, branch, context). No separate `/plan-phase`, `/plan-session`, etc. is required before start.

**Cascade (structured):** Start and end commands return `outcome.cascade` when the agent should offer to cascade. The child tier (for start) or parent/next tier (for end) is derived from `tierDown(config.name)` or `tierUp(config.name)` — never hardcoded. The agent uses AskQuestion with `outcome.cascade.tier`, `outcome.cascade.identifier`, and `outcome.cascade.command`; on confirmation, invokes `outcome.cascade.command`.

**Tier-up at end:** When there is no next item at the current tier, `outcome.cascade` (if present) points to the parent tier end command. Use the cascade confirmation flow above. Auto tier-up (running parent end when last at tier) is deferred; currently "suggest" only.

**Next step at end:** Do not infer from step text; always use `outcome.nextAction`.

**Tier reopen:** Use `/phase-reopen`, `/feature-reopen`, or `/session-reopen` when a completed tier needs additional child work (e.g. add session 4.1.4 to completed phase 4.1). The implementation flips status from Complete to Reopened, ensures the branch, and logs the reopen. For agent behavior after the command returns, see **Per-reasonCode behavioral rules > Reopen success**.

**Auto-registration of children:** When planning a new child tier (e.g. `/plan-session 4.1.4`), the plan-* impl calls `appendChildToParentDoc` so the child is registered in the parent doc (e.g. session 4.1.4 added to phase-4.1-guide.md) if not already present. This is idempotent and allows cascade and discovery to work after a reopen.

**Plan content and critique mode:** `planSession` and `planPhase` accept an optional `planContent` argument (e.g. from a user's `*.plan.md` file). When provided, that content is used as the guide instead of the template; planning checks still run and their output is presented as "Planning Review" (critique) without overwriting the user's content.

---

## Tier responsibility model

**Planning vs implementation:** Only **task-start** triggers coding. All higher tiers are planning-only:

- **Feature-start** — Plan: decompose feature into phases. No code changes.
- **Phase-start** — Plan: decompose phase into sessions. No code changes.
- **Session-start** — Plan: decompose session into tasks, then cascade to task-start. No code changes.
- **Task-start** — **Implementation:** Load task plan from session guide and begin coding. Output includes task details (Goal, Files, Approach, Checkpoint) and the end command; the agent writes code until the task is done, then runs task-end.

**Automatic cascade flow:** Session-start returns `outcome.cascade` pointing to the first task (child tier from `tierDown('session')`). The agent uses AskQuestion, then invokes `outcome.cascade.command`. Task-end returns `outcome.cascade` either to the next task (across) or to the parent tier end (up, via `tierUp('task')`) when all tasks complete. Flow: session-start → (confirm cascade) → task-start → code → task-end → (confirm cascade) → task-start next or parent tier end → …

**Task-end cascade:** When task-end completes, it sets `outcome.cascade`: if a next task exists, `buildCascadeAcross('task', nextTaskId)`; if all tasks complete, `buildCascadeUp('task', sessionId)`. The agent uses AskQuestion and then invokes `outcome.cascade.command` (generic; no tier-specific names in the contract).

**ControlDoc handoff:** Every end command must write the tier status to the control doc (phase guide for sessions, session guide for tasks, etc.) so the next start's validator can read it. Session-end writes the session checkbox in the phase guide; task-end writes task status in the session guide and calls `TASK_CONFIG.controlDoc.writeStatus`. This allows sequential gating: task-start validates that the previous task is complete before allowing the next.

---

## Status taxonomy

All tiers (feature, phase, session, task) use the same status values. Statuses determine which start/end operations are allowed.

| Status | Meaning | Can start? | Can end? |
|--------|---------|------------|----------|
| `Not Started` | No work done yet | Yes | No |
| `Planning` | Plan exists, no implementation yet | Yes | No |
| `In Progress` | Active work happening | Yes (resume) | Yes |
| `Partial` | Some work done, paused/deferred | Yes (resume) | Yes |
| `Blocked` | Cannot proceed due to dependency | No (show blocker reason) | No |
| `Complete` | All work finished, no remaining items | No (error: already complete) | No |
| `Reopened` | Previously completed, additional work needed | Yes | Yes |

**Rules:**
- `Functionally Complete` is **not a valid status**. Use `Partial` (remaining work exists) or `Complete` (truly done).
- `Future` is equivalent to `Not Started` for features that have no plan yet.
- Only `Complete` blocks a start operation. All other statuses are startable (except `Blocked`, which requires the blocker to be resolved first).
- The agent must check the feature's status in PROJECT_PLAN before calling `featureStart`. If `Complete`, error and stop. If `Blocked`, show the reason and stop. Otherwise, proceed.
- Phase and session validators already enforce status checks (`validate-phase-impl.ts`, `validate-session-impl.ts`). Feature-level validation follows the same pattern.

**Where statuses live (controlDoc as authority):**

Each tier config defines a `controlDoc` (path, readStatus, writeStatus). Status is read from and written to these documents — no separate todo/JSON system.

- **Features:** `#` column status in `.project-manager/PROJECT_PLAN.md` feature summary table
- **Phases:** `**Status:**` field in phase guide documents
- **Sessions:** Checkbox `- [x] ### Session X.Y.Z:` in phase guide
- **Tasks:** `**Status:**` field in session guide task sections

**Checkpoint commands:** `/feature-checkpoint`, `/phase-checkpoint`, `/session-checkpoint`, `/create-checkpoint` read progress from controlDoc (guides) and write to logs — they do not use a todo system.

---

## Tier Reopen

When a tier (feature, phase, or session) is **Complete** but needs additional child work (e.g. adding session 4.1.4 to phase 4.1):

1. **Invoke reopen:** Resolve the slash command (`phase-reopen`, `feature-reopen`, or `session-reopen`) from the command-to-entry-point table and call the export with the tier identifier (and optional reason). The implementation validates the tier is Complete, flips status to **Reopened** in the guide/log, ensures the branch, and appends a reopen log entry.
2. **Agent behavior after reopen:** See **Per-reasonCode behavioral rules > Reopen success** for the AskQuestion flow, plan content handling, and quick fix path.

Reopened tiers are **startable** (same as In Progress). When the new work is done, run the tier-end command; mark-phase-complete (and equivalent) will set status back to Complete.

---

## Identifier-only input and context-derived titles

**Requirement:** User input is the identifier only. Never prompt for or require a title/description from the user. In the Context step, load the relevant guide/log/handoff and derive title, description, and any next identifiers using the rules below.

**Per-tier derivation rules:**

- **Session:** Description from session log title, then session guide (Session Name / Description), then phase guide session list. Next session from phase guide session list (next in order after current). Implemented in session-end (deriveSessionDescription, deriveNextSession); session-start derives description the same way when omitted.
- **Phase:** Title/description from phase guide (Phase Name, Description). Next phase from feature guide phase list if needed. phase-start does not take a title parameter.
- **Feature:** The start/end API uses **featureId** (string). Resolve to feature name via `resolveFeatureId(featureId)` (reads PROJECT_PLAN.md; `featureId` is the `#` column value, e.g. `"3"`). Then call `featureStart(featureId, options)`. No user-supplied title.
  - **Numeric identifier (e.g. `3`):** Pass as featureId; `resolveFeatureId("3")` returns the feature directory name from PROJECT_PLAN. Do not use directory listing or index; PROJECT_PLAN is the only source for resolution.
  - **Identifier omitted:** If `.project-manager/.tier-scope` has `feature.id` set, use it as the feature name for context; for the API, a numeric featureId is required (from PROJECT_PLAN `#` column). Otherwise treat as error (do not infer from directories).
- **Task:** Title/description from session guide task list or handoff; next task from session guide order. task-start does not take a description parameter; task context is loaded from session guide/handoff.

**Rule for context step:** Derive [title/description/next] from [doc paths]; do not ask the user.

**Planning commands:** No plan-* command requires a description. `/plan-phase`, `/plan-session`, `/plan-feature`, and `/plan-task` all accept identifier-only; description is derived in shared utils (`resolve-planning-description.ts`, `run-planning-pipeline.ts`).
