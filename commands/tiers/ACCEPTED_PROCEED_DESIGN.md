# Design: /accepted-proceed and /accepted-code (chat-first flow)

## Goal

- **Planning = chat.** After a tier start (or task start) returns a planning doc and context questions, the agent and user **talk in chat** with the doc in view. No separate tool for "what to lock in" or "which modal" — choices are presented in chat.
- **"I'm done, go" = a command.** When the user is satisfied, they run a slash command instead of clicking an option. The command triggers the same re-invoke the playbook previously tied to "I'm satisfied with our plan and ready to begin" or "Begin Coding."

## Commands

| Command | When to use | Effect |
|--------|-------------|--------|
| **/accepted-proceed** | After discussing a **session/phase/feature** plan in chat. | Runs the **next pass** for the pending tier start (pass 2 or pass 3). |
| **/accepted-code** | After discussing a **task** design in chat; ready to code. | Runs task start with **execute** (same as "Begin Coding" approval). |

## State

- **`.cursor/commands/.tier-start-pending.json`** — Written by tier-start when it returns `context_gathering` or `plan_mode` (feature/phase/session only). Shape: `{ tier, params, pass: 1 | 2 }`. Read and updated/cleared by `/accepted-proceed`.
- **`.cursor/commands/.task-start-pending.json`** — Written by task-start when it returns `plan_mode`. Shape: `{ taskId, featureId? }`. Read and cleared by `/accepted-code`.
- Both files are gitignored.

## Call flow

- **tier-start** (session/phase/feature): On `context_gathering` or `plan_mode`, `tier-start.ts` writes tier-start-pending. User discusses in chat; runs `/accepted-proceed`. Agent invokes `acceptedProceed()` → reads state, calls `runTierStart(config, params, options)` with pass 1 or 2 options; on `plan_mode` updates state to pass 2; on `start_ok` deletes state.
- **task-start**: On `plan_mode`, `tier-start.ts` writes task-start-pending. User discusses in chat; runs `/accepted-code`. Agent invokes `acceptedCode()` → reads state, calls `runTierStart(TASK_CONFIG, { taskId, featureId }, { mode: 'execute' })`, deletes state.

## Playbook

- **context_gathering:** Prefer chat-first; tell user to run `/accepted-proceed` when ready.
- **plan_mode (session/phase/feature):** Prefer telling user to run `/accepted-proceed`; for task, run `/accepted-code` when ready to begin coding.
- See START_END_PLAYBOOK_STRUCTURE.md "Proceed commands" table and per-reasonCode sections.

## Entry points

- **acceptedProceed:** `.cursor/commands/tiers/shared/accepted-proceed.ts` → `acceptedProceed()`
- **acceptedCode:** `.cursor/commands/tiers/shared/accepted-code.ts` → `acceptedCode()`
- Command docs: `.cursor/commands/accepted-proceed.md`, `.cursor/commands/accepted-code.md`
