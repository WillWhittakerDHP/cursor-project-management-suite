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

- If success: show any push/next-step prompt; then use `outcome.nextAction`.
- If not success: show `outcome.nextAction` and stop.
- Do not infer next step from step text.

### Outcome rule

- Always use `result.outcome.nextAction` for what to do or tell the user next.

---

## How to invoke (shared rule)

When the procedure says "call implementation", the agent:

1. Resolves the slash command name (e.g. feature-start) to the **composite file path** and **export name** using the command-to-entry-point table above.
2. From repo root, invokes that export with the params gathered from context and prompts.
3. Invocation method: e.g. `npx tsx -e "import('<path-to-composite>').then(m => m.<exportedFn>({ ... })).then(r => console.log(JSON.stringify(r)))"` or the project's standard way to run a TS export and capture the return value. Path and export name come from the table.
4. Captures the return value and proceeds to "Handle result" per the procedure.

No tier-specific invocation quirks; one pattern for all start/end commands.

---

## Shared outcome contract (end commands)

All end commands (session-end, phase-end, feature-end, task-end) return (or are wrapped to return) a common shape for agent follow-up:

- `{ status, reasonCode, nextAction }` where:
  - `status`: e.g. `'completed' | 'blocked_needs_input' | 'blocked_fix_required' | 'failed'`
  - `reasonCode`: short code (e.g. `'pending_push_confirmation'`, `'plan'`)
  - `nextAction`: single string the agent shows or follows next

Use `result.outcome.nextAction` for the next step; do not infer from `result.steps` or prose.

---

## Identifier-only input and context-derived titles

**Requirement:** User input is the identifier only. Never prompt for or require a title/description from the user. In the Context step, load the relevant guide/log/handoff and derive title, description, and any next identifiers using the rules below.

**Per-tier derivation rules:**

- **Session:** Description from session log title, then session guide (Session Name / Description), then phase guide session list. Next session from phase guide session list (next in order after current). Implemented in session-end (deriveSessionDescription, deriveNextSession); session-start derives description the same way when omitted.
- **Phase:** Title/description from phase guide (Phase Name, Description). Next phase from feature guide phase list if needed. phase-start does not take a title parameter.
- **Feature:** Resolve the identifier to a feature name, then call `featureStart(resolvedFeatureName, options)`. No user-supplied title.
  - **Numeric identifier (e.g. `3`):** Resolve to feature name by (1) listing directories under `.project-manager/features` and taking the **Nth** directory (1-based: `3` = third directory), or (2) matching by feature number/order in PROJECT_PLAN or `.project-manager/PROJECT_PLAN.md` if present. If only one feature exists, use it.
  - **Non-numeric identifier:** Use it as the feature name (after trimming).
  - **Identifier omitted:** If `.project-manager/.current-feature` exists, use its contents as the feature name; otherwise resolve from context (e.g. handoff/plan).
- **Task:** Title/description from session guide task list or handoff; next task from session guide order. task-start does not take a description parameter; task context is loaded from session guide/handoff.

**Rule for context step:** Derive [title/description/next] from [doc paths]; do not ask the user.

**Planning commands:** No plan-* command requires a description. `/plan-phase`, `/plan-session`, `/plan-feature`, and `/plan-task` all accept identifier-only; description is derived in shared utils (`resolve-planning-description.ts`, `run-planning-pipeline.ts`, `create-planning-todo.ts`).
