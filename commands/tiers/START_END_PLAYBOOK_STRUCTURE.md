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

---

## Required sections (every playbook)

### Check existing code (early step)

Before loading context or calling the implementation, search the codebase for **current code that looks like it does what this tier command would do** (e.g. scripts that update session logs, code that creates feature branches, logic that marks phases complete). Suggested search queries and decision prompt per command are in `.cursor/commands/utils/check-tier-overlap.ts` (`getTierOverlapSearchSpec` / `OVERLAP_SPECS`); use them if you want structured queries, or search generically for the behavior above.

- **Purpose:** Decide whether to **overwrite** existing code, **add to** it, or **deprecate** it in favor of the tier command — so the tier workflow stays the single source of truth and we avoid duplicate or conflicting behavior.
- **Output:** Present a short summary of what you found (files/locations and what they do) and the decision: overwrite / add to / deprecate (with one-line rationale). If nothing relevant is found, state that and proceed.
- **When:** First step in the procedure (or first step in a planning command that leads to this tier). The agent runs this step once per tier command invocation.

### Context

- User supplies only the identifier (F/P/S/T: feature number or name, phase number, session X.Y, task X.Y.Z). The agent never asks the user for a title or description.
- Where to get feature/phase/session/task (e.g. `.current-feature`, command args).
- Context loading and derivation supply titles/descriptions/next identifiers from existing docs (see "Identifier-only input and context-derived titles" below).

### Optional prompts

- Only where needed (e.g. "Run tests?" when `TEST_CONFIG.enabled`).
- No second confirmation prompt (e.g. no "Ready to end? Proceed with /session-end?").
- List the exact prompt text and what param to set from the response.

### Call implementation

- Resolve the composite file and export from the command-to-entry-point table. Invoke that export with the params you gathered (see "How to invoke" below).
- Capture the return value.

### Handle result

- If success and `outcome.reasonCode === 'pending_push_confirmation'`: use the **AskQuestion** tool to confirm push (see "Push confirmation (AskQuestion)" below); then follow the outcome based on the user's choice.
- If success and no push pending: show steps/output; then use `outcome.nextAction`.
- If not success: show `outcome.nextAction` and stop.
- Do not infer next step from step text.

### Outcome rule

- Always use `result.outcome.nextAction` for what to do or tell the user next.
- When push confirmation is pending, use AskQuestion first; then execute push or skip and show the next step.

---

## How to invoke (shared rule)

When the procedure says "call implementation", the agent:

1. Resolves the slash command name (e.g. feature-start) to the **composite file path** and **export name** using the command-to-entry-point table above.
2. From repo root, invokes that export with the params gathered from context and prompts.
3. Invocation method: e.g. `npx tsx -e "import('<path-to-composite>').then(m => m.<exportedFn>({ ... })).then(r => console.log(JSON.stringify(r)))"` or the project's standard way to run a TS export and capture the return value. Path and export name come from the table.
4. Captures the return value and proceeds to "Handle result" per the procedure.

**Session-start and phase-start (plan then execute):** These commands default to **plan** mode so Ask mode can use AskQuestion. First invocation: no options (or `mode: 'plan'`) — user sees the plan and can answer prompts. When the user has approved and the agent is in **Agent mode**, invoke again with **`{ mode: 'execute' }`** so the command runs the steps (branch creation, server refresh, etc.). Example: `sessionStart(sessionId, description, { mode: 'execute' })`.

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
| `tier-start.ts` → `runTierStart` | Derived from `options.mode` (default plan) | Prepended to result string |
| `tier-end.ts` → `runTierEnd` | Derived from `params.mode` (default execute) | `modeGate` field on result object |
| `tier-plan.ts` → `runTierPlan` | Always `plan` | Prepended to result string |
| `tier-change.ts` → `runTierChange` | Always `plan` | Prepended to `output` field in result |

### Rules

- **CreatePlan and AskQuestion** are used in **Plan mode** (Ask mode). Research, context loading, and generating the plan happen in this mode.
- **Execute/build** (branch creation, server refresh, file writes, merges, etc.) happen in **Agent mode**, after the user has approved and the command is invoked with `{ mode: 'execute' }`.
- The gate text comes from `modeGateText(cursorMode, commandName)` in `command-execution-mode.ts`.
- Tier-specific impls do not call `modeGateText` or produce mode messages — the generic dispatchers handle that.

---

## Shared outcome contract (end commands)

All end commands (session-end, phase-end, feature-end, task-end) return (or are wrapped to return) a common shape for agent follow-up:

- `{ status, reasonCode, nextAction }` where:
  - `status`: e.g. `'completed' | 'blocked_needs_input' | 'blocked_fix_required' | 'failed'`
  - `reasonCode`: short code (e.g. `'pending_push_confirmation'`, `'plan'`)
  - `nextAction`: single string the agent shows or follows next

Use `result.outcome.nextAction` for the next step; do not infer from `result.steps` or prose.

**Push confirmation (AskQuestion):** When `outcome.reasonCode === 'pending_push_confirmation'`, the agent must use the **AskQuestion** tool to get explicit user confirmation before pushing:

1. Show the relevant step output (e.g. `steps.gitReady.output` or the end command’s summary) so the user sees what will be pushed.
2. Call AskQuestion with:
   - **Prompt:** e.g. "All checks passed. Proceed with push to remote?"
   - **Options:** "Yes — push to remote" / "No — skip push (you can push manually later)"
3. If the user selects "Yes — push": run `git push` (or the push step indicated by the command), then show the follow-up from `outcome.nextAction` (e.g. next session or phase-end).
4. If the user selects "No": do not push; show the follow-up from `outcome.nextAction` (e.g. "To start next session run /session-start X.Y.Z" or "Run /phase-end N to complete the phase").

This matches the cascade confirmation pattern used for tier-start: use AskQuestion so the user gets a clear yes/no in the UI instead of a prose prompt in the output.

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

## Tier navigation

Adjacent-tier transitions use **tierUp**, **tierAt**, and **tierDown** (see `.cursor/commands/utils/tier-navigation.ts`).

- **tierAt(tier, identifier)** — Current tier context (identity). Use for "we are here" and prompts.
- **tierUp(tier)** — Parent tier: task→session, session→phase, phase→feature, feature→null. Use when there is no next unit at the current tier: the next step is to run the **tier-up end** (e.g. after last task in session, suggest `/session-end`; after last session in phase, suggest `/phase-end`; after last phase, suggest `/feature-end`).
- **tierDown(tier)** — Child tier: feature→phase, phase→session, session→task, task→null. Use after a tier start for **cascade** (see below).

**Identifier naming:** All tier identifiers use the `{tier}Id` pattern: `featureId`, `phaseId`, `sessionId`, `taskId`. Feature identifiers are numeric (e.g. `"3"`) and resolved to the feature name from PROJECT_PLAN.md via `resolveFeatureId`.

**Start includes plan:** Each start impl runs `runTierPlan` for the same tier internally after setup (validation, branch, context). No separate `/plan-phase`, `/plan-session`, etc. is required before start.

**Cascade confirmation:** Start output ends with a **Cascade:** line that gives the child tier and ID (e.g. "Run `/phase-start 1` after confirmation"). The agent should use the **AskQuestion** tool to ask the user: "Plan complete for [tier] [id]. Cascade to [child tier] [child id]?" with options "Yes — start [child tier] [child id]" / "No — stop here". If the user confirms, the agent calls the appropriate start for the child tier. If declined, stop; the user can start the child tier manually later.

**Tier-up at end:** When there is no next item at the current tier, use `outcome.nextAction` (which already reflects tier-up end when applicable). Auto tier-up (running parent end when last at tier) is deferred; currently "suggest" only.

**Next step at end:** Do not infer from step text; always use `outcome.nextAction`.

**Tier reopen:** Use `/phase-reopen`, `/feature-reopen`, or `/session-reopen` when a completed tier needs additional child work (e.g. add session 4.1.4 to completed phase 4.1). The implementation flips status from Complete to Reopened, ensures the branch, and logs the reopen. After the command returns, the **agent** must use **AskQuestion**: "Is there a plan you want to build this tier around?" with options e.g. "Yes — I have a plan file" / "No — I'll plan from scratch" / "No — just a quick fix". If the user selects "Yes" and provides a file reference (e.g. `@myplan.plan.md`), the agent reads that file and passes its content as `planContent` to subsequent `planSession` / `planPhase` calls so the user's authored plan is used as the guide content and planning checks run in critique mode.

**Auto-registration of children:** When planning a new child tier (e.g. `/plan-session 4.1.4`), the plan-* impl calls `appendChildToParentDoc` so the child is registered in the parent doc (e.g. session 4.1.4 added to phase-4.1-guide.md) if not already present. This is idempotent and allows cascade and discovery to work after a reopen.

**Plan content and critique mode:** `planSession` and `planPhase` accept an optional `planContent` argument (e.g. from a user's `*.plan.md` file). When provided, that content is used as the guide instead of the template; planning checks still run and their output is presented as "Planning Review" (critique) without overwriting the user's content.

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
2. **AskQuestion (agent):** After the command returns, use AskQuestion: "Is there a plan you want to build this tier around?" Options: **Yes — I have a plan file** (user provides e.g. `@myplan.plan.md`), **No — I'll plan from scratch**, **No — just a quick fix**.
3. **If Yes with plan file:** Read the referenced `*.plan.md` file and pass its content as `planContent` when calling `planSession` or `planPhase` for each new child. The plan command seeds the child guide from that content and runs planning checks in **critique mode** (suggestions appended as Planning Review, not overwriting the plan).
4. **If No (plan from scratch):** Use existing plan-* commands with no planContent; templates and cascade work as usual.
5. **If quick fix:** No planning; user makes changes and runs the tier-end command when done.

Reopened tiers are **startable** (same as In Progress). When the new work is done, run the tier-end command; mark-phase-complete (and equivalent) will set status back to Complete.

---

## Identifier-only input and context-derived titles

**Requirement:** User input is the identifier only. Never prompt for or require a title/description from the user. In the Context step, load the relevant guide/log/handoff and derive title, description, and any next identifiers using the rules below.

**Per-tier derivation rules:**

- **Session:** Description from session log title, then session guide (Session Name / Description), then phase guide session list. Next session from phase guide session list (next in order after current). Implemented in session-end (deriveSessionDescription, deriveNextSession); session-start derives description the same way when omitted.
- **Phase:** Title/description from phase guide (Phase Name, Description). Next phase from feature guide phase list if needed. phase-start does not take a title parameter.
- **Feature:** The start/end API uses **featureId** (string). Resolve to feature name via `resolveFeatureId(featureId)` (reads PROJECT_PLAN.md; `featureId` is the `#` column value, e.g. `"3"`). Then call `featureStart(featureId, options)`. No user-supplied title.
  - **Numeric identifier (e.g. `3`):** Pass as featureId; `resolveFeatureId("3")` returns the feature directory name from PROJECT_PLAN. Do not use directory listing or index; PROJECT_PLAN is the only source for resolution.
  - **Identifier omitted:** If `.project-manager/.current-feature` exists, use its contents as the feature name for context; for the API, a numeric featureId is required (from PROJECT_PLAN `#` column). Otherwise treat as error (do not infer from directories).
- **Task:** Title/description from session guide task list or handoff; next task from session guide order. task-start does not take a description parameter; task context is loaded from session guide/handoff.

**Rule for context step:** Derive [title/description/next] from [doc paths]; do not ask the user.

**Planning commands:** No plan-* command requires a description. `/plan-phase`, `/plan-session`, `/plan-feature`, and `/plan-task` all accept identifier-only; description is derived in shared utils (`resolve-planning-description.ts`, `run-planning-pipeline.ts`).
