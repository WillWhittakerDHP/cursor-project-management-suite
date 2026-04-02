# Start/End Playbook Structure

All tier start/end commands (feature-start, feature-end, phase-start, phase-end, session-start, session-end, task-start, task-end) follow this structure so the agent has one place to understand "how start/end works." The procedure below applies to all start/end commands; the **command-to-entry-point table** gives the composite file and export to invoke. No separate playbook file is required.

## Command-to-entry-point table

| Slash command   | Composite file (from repo root)                                | Export to invoke |
|-----------------|----------------------------------------------------------------|------------------|
| feature-start   | .cursor/commands/tiers/feature/composite/feature.ts           | featureStart     |
| feature-end     | .cursor/commands/tiers/feature/composite/feature.ts           | featureEnd       |
| feature-change  | .cursor/commands/tiers/feature/composite/feature.ts           | featureChange    |
| phase-start     | .cursor/commands/tiers/phase/composite/phase.ts                | phaseStart       |
| phase-end       | .cursor/commands/tiers/phase/composite/phase.ts                | phaseEnd         |
| session-start   | .cursor/commands/tiers/session/composite/session.ts           | sessionStart     |
| session-end     | .cursor/commands/tiers/session/composite/session.ts           | sessionEnd       |
| task-start      | .cursor/commands/tiers/task/composite/task.ts                  | taskStart        |
| task-end        | .cursor/commands/tiers/task/composite/task.ts                  | taskEnd          |
| feature-add     | .cursor/commands/tiers/feature/composite/feature.ts            | featureAdd       |
| phase-add       | .cursor/commands/tiers/shared/tier-add.ts                      | phaseAdd         |
| session-add     | .cursor/commands/tiers/shared/tier-add.ts                      | sessionAdd       |
| task-add        | .cursor/commands/tiers/shared/tier-add.ts                      | taskAdd          |
| feature-reopen  | .cursor/commands/tiers/feature/composite/feature.ts            | featureReopen    |
| phase-reopen    | .cursor/commands/tiers/phase/composite/phase.ts               | phaseReopen      |
| session-reopen  | .cursor/commands/tiers/session/composite/session.ts            | sessionReopen    |

**/harness-repair:** Not a tier command. Plan/execute workflow friction triage and addressed markers; optional `.cursor` submodule commit via **`git-manager`**. Invoke **`harnessRepair`** from `.cursor/commands/harness/composite/harness-repair-impl.ts` or CLI in `.cursor/commands/harness-repair.md`. After **session-end** with open friction, **`outcome.nextAction`** requires **plan** mode before **`/accepted-push`**.

**Invocation:** From repo root, run the export via the project's TS runner. Example: `npx tsx -e "import('<path>').then(m => m.<export>(...)).then(r => console.log(JSON.stringify(r)))"`. Use the path and export name from the table above. **feature-change:** Invoke `featureChange(featureName, newFeatureName, reason)` with three string args (current feature name, new feature name for rename, reason for the change).

**/audit-fix [report-path]:** Not a tier command. Use when the user chooses "Fix audit with governance context (/audit-fix)" after `audit_failed`. Invoke **`getAuditFixContext`** or **`auditFixPrompt`** from `.cursor/commands/audit/atomic/audit-fix-prompt.ts` (same rich assembly for both), or run `npx tsx .cursor/commands/audit/atomic/audit-fix-prompt.ts [report-path]` for a paste-ready string. See `.cursor/commands/audit-fix.md`.

**No one-off runner scripts:** Do not create ad hoc tier wrappers like `run-task-start-*.ts`, `run-task-end-*.ts`, or `run-session-end-*.ts` (and similar `run-*-start/end-*.ts` files). Invoke composite exports directly with inline `tsx -e` imports so all tiers follow the same entrypoint pattern.

### Entry points and call chain (where things live)

The composite is the **invocation** entry point; the **workflow and context questions** live in the tier's `*-start-impl.ts` (or `*-end-impl.ts`). The call chain is: composite export → `runTierStart` / `runTierEnd` / `runTierReopen` (shared) → `defaultKernel.run` + `createStepAdapter` → `*StartImpl` / `*EndImpl` / `*ReopenImpl`. Tier config (e.g. `SESSION_CONFIG`) lives under `tiers/configs/<tier>.ts`.

| Concern | Session-start example | Same pattern for other tiers |
|--------|------------------------|------------------------------|
| **What to invoke for /session-start** | Playbook table → `session.ts` → `sessionStart` | Table → `<tier>.ts` → `<tier>Start` |
| **How to run from repo root** | `npx tsx -e "import('.../session/composite/session.ts').then(m => m.sessionStart('6.4.4'))..."` | Same pattern with path/export from table |
| **Where workflow and context questions live** | `tiers/session/composite/session-start-impl.ts` (`sessionStartImpl`, `getContextQuestions`, hooks) | `tiers/<tier>/composite/<tier>-start-impl.ts` |
| **Where dispatch happens** | `tiers/shared/tier-start.ts` → `runTierStart(config, params, options)` (classifies WorkProfile, builds spec) → `harness/step-adapter.ts` → `sessionStartImpl(...)` | Same; adapter switches on `config.name` |
| **Tier config** | `tiers/configs/session.ts` (`SESSION_CONFIG`) | `tiers/configs/<tier>.ts` |

**Agent path:** User says `/session-start 6.4.4` → agent calls `sessionStart('6.4.4')` from `session.ts` → `runTierStart(SESSION_CONFIG, ...)` → adapter → `sessionStartImpl`. **Harness path:** Spec runs `session-start` → adapter (with `SESSION_CONFIG`) calls `sessionStartImpl` directly; no composite in the loop.

### Proceed commands (chat-first: planning approval via command, not tool)

When the user prefers to **discuss the plan in chat** and then signal "ready" with a command instead of clicking an option:

| Slash command       | Composite file (from repo root)                           | Export to invoke   |
|---------------------|-----------------------------------------------------------|--------------------|
| /accepted-plan      | .cursor/commands/tiers/shared/accepted-plan.ts            | acceptedPlan       |
| /accepted-build     | .cursor/commands/tiers/shared/accepted-build.ts           | acceptedBuild      |
| /accepted-code      | .cursor/commands/tiers/shared/accepted-code.ts            | acceptedCode       |
| /accepted-push      | .cursor/commands/tiers/shared/accepted-push.ts            | acceptedPush       |
| /skip-push          | .cursor/commands/tiers/shared/skip-push.ts                | skipPush           |

- **/accepted-plan (Gate 1):** After the agent fills the planning doc, the **user** runs this so feature/phase/session start continues from the gate (`resumeAfterStep: ensure_branch`). Blocks with `planning_doc_incomplete` until placeholders are cleared. The agent does not invoke it — the user does.
- **/accepted-build (Gate 2):** After `guide_fill_pending`, the agent fills the guide; the **user** runs this for **decomposition** gate profile (typical feature/phase/session with guide two-pass). Blocks with `guide_incomplete` until guide placeholders are cleared. Standard/fast profiles skip this human stop (harness auto-completes guide pass). The agent does not invoke it — the user does.
- **/accepted-code:** Runs task start with execute for the pending task (Begin Coding). When the **user** runs /accepted-code, the command executes; present the result. The agent does not invoke or run the command — the user does.
- **/accepted-push:** Runs **`verifyHarnessPushBranchCoherence`** (expected **`feature/<slug>`** vs **`HEAD`**, optional fetch + compare to origin), then **`git push`**, then clears **`.tier-end-pending.json`** and returns cascade info. Pending state includes **`featureName`** for context resolution. **The user** runs /accepted-push when tier-end returns `pending_push_confirmation`. The agent does not invoke it — the user does.
- **/skip-push:** Skips push, clears end-pending state, returns cascade info. **The user** runs /skip-push when tier-end returns `pending_push_confirmation` and does not want to push. The agent does not invoke it — the user does.

See `.cursor/commands/accepted-plan.md`, `.cursor/commands/accepted-build.md`, and `.cursor/commands/accepted-code.md` for invocation and behavior.

---

## Required sections (every playbook)

### Context

- User supplies only the identifier (F/P/S/T: feature number or name, phase number, session X.Y, task X.Y.Z). The agent never asks the user for a title or description.
- Where to get feature/phase/session/task: **explicit in the command** (F/P/S/T identifiers in the slash command or params). No shared config file is read.
- Context loading and derivation supply titles/descriptions/next identifiers from existing docs (see "Identifier-only input and context-derived titles" below).

### Prompts (use when the workflow requires a user choice)

- Use a prompt only when the workflow or reasonCode requires a user choice (e.g. "Run tests?" when `TEST_CONFIG.enabled`). Do not say "optionally"; if the prompt is required by the flow, use it; otherwise do not.
- No second confirmation prompt (e.g. no "Ready to end? Proceed with /session-end?").
- List the exact prompt text and what param to set from the response.

### Call implementation

- Resolve the composite file and export from the command-to-entry-point table. Invoke that export with the params you gathered (see "How to invoke" below).
- Capture the return value.
- **End commands** (feature-end, phase-end, session-end, task-end) run a multi-step pipeline that includes tier-quality audits and may take **several minutes**. Wait for the command to complete. Do not cancel, time out, or assume the command failed; use only the returned `result` (and `outcome` / `controlPlaneDecision`) to decide next steps.

### Handle result

Start and end commands return a structured result with `result.outcome`, `result.output`, and `result.controlPlaneDecision`. Use `result.outcome` for routing and `result.controlPlaneDecision` for user-facing presentation; do not infer behavior from step text or prose.

- **Start commands** return `TierStartResultWithControlPlane`: `{ success, output, outcome, controlPlaneDecision }`.
- **End commands** return a result with `outcome` and `controlPlaneDecision`: `{ success, output, outcome, controlPlaneDecision }`.

### Control-plane decision (user-facing presentation)

Every start/end/reopen command returns a `controlPlaneDecision` object that tells the agent **what to show the user** and **what to ask**:

| Field | Purpose |
|-------|---------|
| `message` | **User-facing content** — deliverables, checklists, file lists, or error context. Show this to the user. |
| `questionKey` | Identifies the choice set for message + options (see per-reasonCode rules below). |
| `stop` | If `true`, stop and wait for user response before proceeding. |
| `nextInvoke` | On approval, run this command again (tier, action, params). For start flows, /accepted-plan, /accepted-build (when Gate 2 applies), and /accepted-code allow the workflow to proceed from the gate instead of re-running from the top. |
| `cascadeCommand` | Exact command string to run on cascade confirmation. |

When the result output includes a **User choice required** block (message + options), present that block in chat and direct the user to run the corresponding command or reply with their choice.

**Options-passing (start proceed / re-invoke):** When the user runs /accepted-plan, /accepted-build, or /accepted-code, the harness proceeds from the gate (resumeAfterStep: ensure_branch) so the start workflow does not re-run from the top. For other re-invokes (e.g. after uncommitted changes), options MUST be passed as `params.options`; flat option keys (e.g. `mode` at params root) are invalid and ignored by composite invocation.

**Tier-end resume (`resumeEndAfterStep`):** For certain failures, `controlPlaneDecision.nextInvoke` includes `params.options.resumeEndAfterStep` so re-running the **same** tier-end skips earlier steps (after always re-running the conflict-marker guard). Do **not** hand-author this option; use `nextInvoke` from the decision. Distinct from `continuePastVerification` (verification gate only).

**Harness docs + git (implementation):** Planning docs and existence checks go through `WorkflowCommandContext.documents` (`DocumentManager.planningDocExists`, `readPlanningDoc`, `getPlanningDocRelativePath`). Tier logs use idempotent `appendLog`; to repair a log file that predates that behavior, use `workflowCoalesceLog` in `document/composite/coalesce-log.ts` (see `.project-manager/HARNESS_CHARTER.md` §4 — tier-start auto-commit vs tier-end allowed prefixes, pull-after-checkout, `recoverPlanningArtifactsAfterCheckout`).

**Critical rule:** `controlPlaneDecision.message` is the **user-facing content**. `result.output` is **agent context** (workflow steps, branch info, audit details) — read it for your own understanding, but present `controlPlaneDecision.message` to the user. Do not dump `result.output` verbatim to the user; it contains internal workflow steps they do not need to see. Messages may include work-profile-specific guidance appended by control-plane handlers (e.g. governance playbook and audit report references for `audit_fix` profiles); this is transparent — present the full message as-is.

**User choices:** When the result has `controlPlaneDecision.questionKey` set (and the decision is not command-gated — e.g. not context_gathering or pending_push_confirmation), the command output will include a **User choice required** block with the message and options. Present that block in chat so the user sees the message and options clearly; direct them to run the corresponding command or reply with their choice.

Routing (use `outcome.reasonCode`):

- If `outcome.reasonCode === 'context_gathering'`: see **Per-reasonCode behavioral rules → `context_gathering`** below.
- If `outcome.reasonCode === 'planning_doc_incomplete'`: see **Per-reasonCode behavioral rules → `planning_doc_incomplete`** below. Proceeding is BLOCKED until the planning doc is filled.
- If `outcome.reasonCode === 'guide_fill_pending'`: see **Per-reasonCode behavioral rules → `guide_fill_pending`** below. Step 2 — agent fills the guide using context; then **the user** runs **/accepted-build** (Gate 2).
- If `outcome.reasonCode === 'guide_incomplete'`: see **Per-reasonCode behavioral rules → `guide_incomplete`** below. Proceeding is BLOCKED until the guide is filled.
- If `outcome.reasonCode === 'audit_failed'`: see **Per-reasonCode behavioral rules → `audit_failed`** below. **STOP and fix** all warnings/errors per governance before re-running.
- If `outcome.reasonCode === 'pending_push_confirmation'`: see **Per-reasonCode behavioral rules → `pending_push_confirmation`** below. Run **/accepted-push** or **/skip-push**; present push instructions in chat (no tool).
- If `outcome.reasonCode === 'verification_work_suggested'`: see **Per-reasonCode behavioral rules → `verification_work_suggested`** below.
- If `outcome.reasonCode === 'gap_analysis_pending'`: see **Per-reasonCode behavioral rules → `gap_analysis_pending`** below.
- If `outcome.reasonCode === 'uncommitted_changes_blocking'`: see **Per-reasonCode behavioral rules → `uncommitted_changes_blocking`** below.
- If `outcome.reasonCode === 'wrong_branch_before_commit'`: see **Per-reasonCode behavioral rules → `wrong_branch_before_commit`** below.
- If `outcome.reasonCode === 'preflight_branch_failed'`: see **Per-reasonCode behavioral rules → `preflight_branch_failed`** below (same resume pattern as wrong branch: **`resumeEndAfterStep: 'commit_remaining'`** when **`nextInvoke`** is present).
- If `outcome.reasonCode === 'audit_fix_commit_failed'`: see **Per-reasonCode behavioral rules → `audit_fix_commit_failed`** below.
- If `outcome.reasonCode === 'git_failed'` and `controlPlaneDecision.nextInvoke` is set: fix merge/push per message, then re-invoke using **nextInvoke** (resume at shared `git` step).
- If `outcome.reasonCode === 'expected_branch_missing_run_tier_start'`: see **Per-reasonCode behavioral rules → `expected_branch_missing_run_tier_start`** below.
- **If `outcome.cascade` is present (start or end):** You MUST run **Cascade confirmation** first. Do not skip to `nextAction` or infer the next step (e.g. do not assume "session roll-up" when the cascade is to the next task). Cascade direction: `outcome.cascade.direction === 'across'` → next step is the **next tier at same level** (e.g. next task via `outcome.cascade.command`, typically `/task-start <nextTaskId>`); `'up'` → next step is **parent tier end** (e.g. `/session-end <sessionId>`). See **Per-reasonCode behavioral rules → Cascade confirmation** below.
- If success and no push/cascade pending: show `controlPlaneDecision.message`; then use `outcome.nextAction`.
- **If not success (HARD STOP):**
  1. Show `controlPlaneDecision.message` to the user. Do not paraphrase or expand.
  2. Present the **User choice required** block from the command output (message + options: Retry / Fix audit with governance context (/audit-fix) / Skip). Direct the user to run the corresponding command or reply with their choice.
  3. **Do NOT cascade.** Do not offer to start the next task, session, phase, or feature. Do not check `outcome.cascade` — on failure, cascade is never present and must never be improvised.
  4. **Do NOT improvise next steps.** Do not read session guides to find the next task. Do not offer to run a different command. Do not create documents the command was supposed to create.
  5. **Wait for the user's response** before taking any action.

### On command crash or missing outcome

If the command throws, exits with non-zero code, or the result has no `outcome` (e.g. `outcome` is `undefined`):

1. Report `controlPlaneDecision.message` (or the raw error output if no decision was produced) to the user **verbatim**.
2. **STOP immediately.** Do NOT:
   - Manually create documents the command was supposed to create (guides, logs, handoffs)
   - Reconstruct the command's expected output by reading templates or impl files
   - Improvise a session-start/end response by assembling pieces from the codebase
   - Create TODO lists or plans based on what the command "would have done"
   - Offer to cascade to the next tier (start next task, end next session, etc.)
   - Continue executing as if the command had succeeded
3. Present the **User choice required** block from the command output (or the message and options: Retry / Fix audit with governance context (/audit-fix) / Skip). Direct the user to run the corresponding command or reply.
4. The user must fix the underlying issue (missing files, broken impl, etc.) and re-run the command.
5. If the error message suggests a specific fix (e.g. "file not found"), you may point that out, but do NOT apply the fix and silently re-run.

**Why this rule exists:** When commands fail, the agent has historically read template files and impl code, then manually recreated the command's expected output — producing documents and plans that bypass the command's validation, audit, and cascade logic. The agent has also continued executing after failures and offered to cascade to the next tier, compounding the problem. Both behaviors create invisible inconsistencies across sessions.

### Outcome rule

- **User-facing content:** Always present `controlPlaneDecision.message` to the user — this is the deliverables, checklists, or error context they need to see.
- **Agent next step:** Use `result.outcome.nextAction` for what to do next (routing hint for the agent).
- For push and cascade confirmation sequences, see the per-reasonCode behavioral rules below.

### Failure mode enforcement (playbook)

On failure, the command output contains the decision message and the **User choice required** block (when applicable). All behavioral rules (what to do on failure, how to present choices in chat, when not to cascade) live here in this playbook. The code returns structured data (`status`, `reasonCode`, `nextAction`, `cascade`); the playbook tells the agent how to handle each case.

---

## Code vs. playbook responsibility

| In code (`.ts` files) | In playbook (this document) |
|---|---|
| Structured data: `status`, `reasonCode`, `cascade`, identifiers | Behavioral rules: present choices in chat, stop conditions |
| Status messages: "Tests passed", "Branch created", "Task X complete" | Workflow scripts: approval sequences, cascade confirmation, failure handling |
| Short routing hints in `nextAction`: "Push pending. Then cascade if present." | How to handle each `reasonCode`: step-by-step agent behavior |

**Anti-pattern:** Code must NOT contain agent behavioral instructions like "Present choices", "Do NOT cascade", "BEGIN IMPLEMENTATION — The agent should now write code". These belong exclusively in the playbook. Code returns *what happened* and *what's next* (data); the playbook says *how to handle it* (behavior).

**Anti-pattern (choices):** When `controlPlaneDecision.questionKey` is set, the command output includes a **User choice required** block. Present that block in chat so the user sees the message and options clearly; do not omit or paraphrase the options.

---

## Per-reasonCode behavioral rules

These rules tell the agent what to do for each `reasonCode` returned by commands. The code returns the `reasonCode`; the playbook defines the behavior.

**Failure reasonCodes:** Any `reasonCode` not listed below (e.g. `lint_or_typecheck_failed`, `test_failed`, `test_code_error`, `test_goal_validation_failed`, `vue_architecture_gate_failed`, etc.) indicates a failure. All failure reasonCodes follow the **"If not success (HARD STOP)"** rule in the Routing section above.

### `validation_failed` (start commands)

Validation blocked the start. Present `outcome.nextAction` and stop. Common reasons: session already completed, previous session not finished, phase blocked/completed, session not documented in phase guide.

**Control plane:** `routeByOutcome` appends a short **Workflow friction** footer (path to `WORKFLOW_FRICTION_LOG.md` + reader CLI) so operators know a row may have been auto-appended for this failure class.

**Feature-only branching:** Phase and session tiers do **not** create separate git branches. All work for a feature uses `feature/<featureName>`. `ensureTierBranch` for phase/session ensures that feature branch is checked out.

### Git debugging: `.project-manager/.git-friction-log.jsonl`

Harness git steps append **structured JSON lines** here when operations fail or recover from risky states (complements `.project-manager/.git-ops-log`). When debugging git issues:

1. Read the last lines of `.project-manager/.git-friction-log.jsonl` for `reasonCode`, `step`, `currentBranch`, `expectedBranch`, and `disposition`.
2. After a **non-trivial** manual git fix or repeated failure, agents may append a line via `recordGitFriction` / `appendGitFriction` from `git-manager` (or document the incident in the session note).

### Workflow / planning friction: `.project-manager/WORKFLOW_FRICTION_LOG.md`

For **non-git** harness friction (unclear `reasonCode`, wrong gate command, planning parser surprises, audit noise, `ARCHITECTURE.md` vs code drift, playbook/skill contradictions), use **`.project-manager/WORKFLOW_FRICTION_LOG.md`** (markdown, append-only). Compare with **`.project-manager/.git-friction-log.jsonl`** for git-specific incidents.

1. **Auto-capture:** Tier start/end failures that exit through the shared runners append here when the normalized outcome is a **failure** reason (`isFailureReasonCode` / `FailureReasonCode` in `.cursor/commands/harness/reason-code.ts` and `.cursor/commands/harness/contracts.ts`). Expected **flow** stops (`context_gathering`, `guide_fill_pending`, `planning_doc_incomplete`, etc.) are **not** auto-logged so the file stays signal-heavy.
2. **Env:** `HARNESS_WORKFLOW_FRICTION=off | failures` (default) | `verbose`. `off` disables all writes; `verbose` also records allowlisted step warnings (deliverables heuristic, governance envelope assembly).
3. **Before changing tier-start/end or control-plane routing:** run the reader to spot repeats:
   - `npx tsx .cursor/commands/utils/read-workflow-friction.ts --last 20`
   - `npx tsx .cursor/commands/utils/read-workflow-friction.ts --reason audit_failed`
   Filter by **normalized** reason codes (post-`parseReasonCode`); legacy raw strings in entries remain in each block as `reasonCodeRaw`.
4. **Adding or renaming codes:** keep [`.cursor/skills/tier-workflow-agent/reason-codes.md`](../../skills/tier-workflow-agent/reason-codes.md) and `LEGACY_TO_CHARTER` in `reason-code.ts` aligned.
5. **Programmatic / agent capture (success path but material confusion):** import **`.cursor/commands/harness/workflow-friction-manager.ts`** and call **`initiateWorkflowFrictionWrite`** (or **`recordWorkflowFriction`**, re-exported there) with **`forcePolicy: true`** so policy bypasses flow suppression (still respects `HARNESS_WORKFLOW_FRICTION=off`). Tier start/end orchestrator failures use **`recordOrchestratorFailureFriction`**. Verbose step advisories use **`recordHarnessVerboseWarning`**. Do not create ad hoc parallel friction files.
6. **`/harness-repair` (triage + addressed flags):** Use **`harnessRepair`** from **`.cursor/commands/harness/composite/harness-repair-impl.ts`** (see **`.cursor/commands/harness-repair.md`**) for structured analysis (recurrence, **`buildTierAdvisoryContext`**) and, in execute mode, in-place **addressed** bullets plus **Policy A** parent SHA stamp (two commits). Canonical path for committing harness changes inside the **`.cursor`** submodule: **`commitCursorSubmoduleAndStageParentGitlink`** via **`git-manager`** from that flow—not ad-hoc git. **Session-end:** When **`pending_push_confirmation`** and the log has **open** entries (`hasOpenWorkflowFrictionEntries`), **`nextAction`** appends a mandatory **plan-mode `/harness-repair`** step before **`/accepted-push`** (execute stays a separate invocation after review).
7. **Model recommendation (harness advisory):** Tier start/end may append a **Recommended agent/model** block to `controlPlaneDecision.message` (config: `.project-manager/agent-model-config.json`). The harness does **not** switch Cursor’s active model. When that block appears: switch if practical, or **state explicitly** that you are staying on the current model and why. For repeated confusion (wrong model, ignored advisory, playbook mismatch), use the reader above and append **`WORKFLOW_FRICTION_LOG.md`** per the template, or call **`initiateWorkflowFrictionWrite`** with **`forcePolicy: true`**. Config parse/schema issues are logged via **`recordHarnessVerboseWarning`** when `HARNESS_WORKFLOW_FRICTION=verbose`.

### `audit_failed` (start commands: audit reported warnings or failures)

The tier start audit (baseline quality) returned **warn** or **fail** (or runtime errors). **Do not proceed.** Governance requires a clean audit before continuing.

1. **Present `controlPlaneDecision.message`** to the user — this includes the audit report and the instruction to fix in compliance with governance.
2. **Attempt autonomous fix:** Run `/audit-fix` with the report path from the message (or `npx tsx .cursor/commands/audit/atomic/audit-fix-prompt.ts [report-path]`) to load governance context, then fix **all** warnings and errors in compliance with governance rules (function/composable/component/type rules, coding standards).
3. **If all findings were resolved autonomously:** Re-run the **same** tier command immediately (e.g. `/task-end 6.10.1.4`). Do not present the choice block to the user — the fix is done; proceed directly to retry. The audit will run again; if it passes, the workflow continues.
4. **If some findings could not be resolved** (the agent is unsure how to fix them, or the fix requires a design decision): Present the **User choice required** block from the command output (options: Retry the command / Fix audit with governance context (/audit-fix) / Skip and continue manually). Explain which findings remain and why they need user input. When the user chooses **"Fix audit with governance context (/audit-fix)"**: collaborate on the remaining findings using the governance docs already loaded. After fixes, the user can choose **"Retry the command"** to re-run the tier start/end.

**Anti-pattern:** Do not ignore audit warnings or errors. Do not proceed to cascade or implementation until the audit is clean. Do not present the choice block to the user after successfully fixing all findings — retry automatically.

### `context_gathering` (start commands, all tiers)

**Two-step flow (decomposition gate profile):** **Step 1 — Plan:** In plan mode, context_gathering runs first. The command creates a **planning doc** (contract, work profile, continuity, tier-appropriate sections including **## Codebase recon** (agent-led search/read of `client/`, `server/`, `shared/`), Analysis, **## Decomposition** or **`**Leaf tier**`**, Deliverables, Acceptance Criteria where applicable, Definition of Done, Reference). New docs include a **sentinel line** in Codebase recon; **`/accepted-plan`** / **`/accepted-code`** stay blocked (`planning_doc_incomplete`) until that sentinel is removed after recording real paths and patterns. Older planning docs without the sentinel are unaffected. The harness parser recognizes **`## Decomposition`** only — migrate older docs that used a different heading so decomposition is under **`## Decomposition`**. The **agent** fills the doc using context; then **the user** runs **/accepted-plan**. **Gate 1:** `/accepted-plan` blocks with `planning_doc_incomplete` until placeholders are cleared. For **phase and session** (decomposition profile), after `/accepted-plan` the harness runs Part A (branch, ensure guide from plan) and may return **`guide_fill_pending`**. **Step 2 — Build:** The **agent** fills the **guide** (path in the outcome). **The user** runs **/accepted-build**. **Gate 2:** `/accepted-build` blocks with `guide_incomplete` until guide tierDown placeholders are cleared. Then execute continues (read context, audit, cascade). **Standard/fast** profiles skip the second human stop (no `/accepted-build`). Tasks use **/accepted-code** (and may use **express** profile with no planning-doc gate).

**Planning doc role (advisory):** The planning doc is an **advisory intake and inheritance artifact**. It must contain concrete advisory intent, constraints, governance emphasis, verification expectations, and downstream guidance. The **## Decomposition** section is **lightweight decomposition intent** unless the resolved WorkProfile `decompositionMode` is `explicit`. Once current-tier decomposition is established, the **guide** is the **authoritative** source for the canonical child-unit list; the planning doc may suggest decomposition boundaries, but the guide owns the actual list and structure.

**Guide authority:** Guide creation and guide fill remain required when the workflow depends on current-tier decomposition. The guide, not the planning doc, owns the canonical child-unit list. When planning-doc and guide child structure diverge, the guide wins once decomposition is established.

**Pipeline order:** The command loaded context and created a planning document with **doc-grounded insight prompts** in the chat message. Context questions are based on what the tier docs say we're building: each item has an **Insight** (what the docs indicate), a **Proposal** (recommended path), and a **Decision** with explicit **Options** where possible.

**REQUIRED — Filling the planning doc is NOT optional.** The **agent** MUST fill the planning doc: open it, read the Reference section links (governance, **`.project-manager/ARCHITECTURE.md`**, playbooks, tierUp guide, handoff) as needed, **fill ## Codebase recon** by searching/reading the real codebase (not only injected docs), **remove the Codebase recon sentinel line** when done, and replace placeholder sections (Analysis, Epic/Story, Plan, **## Decomposition** with `### Phase|Session|Task` headings or bullets, or **`**Leaf tier**`** when no children, Deliverables, Acceptance Criteria, etc.). **The user** runs **/accepted-plan** only after the doc is filled (feature/phase/session). If the agent does not fill the doc, **`/accepted-plan` will be BLOCKED** — `planning_doc_incomplete` until resolved.

**Coverage check (feature / phase / session, before /accepted-plan):** After filling the doc, re-read the Goal/Plan and **## Decomposition**. In chat, answer: "If this is the goal, have we outlined enough steps to enact it?" Update decomposition if gaps exist; then invite **`/accepted-plan`**. Skip for **task** tiers (no decomposition). This is agent judgment, not a separate harness gate.

**Requirement:** Context prompts must be **doc-grounded** (derived from feature/phase/session/task guides and tier responsibility). Do **not** use vague, process-only prompts (e.g. "What do you want?" or "What's your goal?") unless there is no extractable doc context. When docs exist, present insight + proposal + concrete options so the user can choose.

1. **Present `controlPlaneDecision.message`** — this contains the planning doc path and the **Insight / Proposal / Decision** blocks (what the docs say, proposed path, decision needed, and explicit options).
2. **Open the planning doc in the editor** so the user can watch it being built.
3. **MUST fill the planning doc:** Read the Reference section in the doc (and linked governance/playbook files as needed), **complete ## Codebase recon** from the repo and remove its sentinel line, then replace placeholder sections with a concrete draft (including **## Decomposition**). This step is **REQUIRED**. **The user** should not run **`/accepted-plan`** until the agent has filled the doc (feature/phase/session).
4. Discuss the plan **in chat** with the user. Use the insight/proposal/decision blocks as conversation starters. After each answer, **update the planning doc IN-PLACE**. When the doc is filled, perform the **coverage check** (non-task), then tell the user: "When you're ready, run **`/accepted-plan`** to continue." Do not invoke `acceptedPlan()` or run the command yourself; **the user** runs the command. When the user has run it, present `controlPlaneDecision.message` and handle the outcome per playbook. If the result is `start_ok`, handle cascade per playbook. If the result is `planning_doc_incomplete`, fill the doc; then **the user** runs **`/accepted-plan`** again. If the result is **`guide_fill_pending`** (feature / phase / session under **decomposition** profile), **fill the guide** at `guidePath`; then **the user** runs **`/accepted-build`** (Gate 2). Do not run or invoke those commands yourself.
5. **Enumerate tierDowns (session/phase) before inviting `/accepted-plan`:** After the planning conversation and before telling the user to run **`/accepted-plan`**, make a pass over the **session guide** (for session) or **phase guide** (for phase) so that all intended tierDown units are listed with the headings the harness uses for cascade. For **sessions:** the session guide must contain a line matching `Task X.Y.Z.N:` (e.g. `#### Task 6.4.4.1:`, `#### Task 6.4.4.2:`) for each task in that session; task-end reads this to decide whether to cascade across to the next task or up to session-end. For **phases:** the phase guide must list each session in the phase (same pattern as used by session-end for cascade across). If the guide lists only one task, task-end will not offer cascade to a second task. Add or update task/session blocks (Goal, Files, Approach, Checkpoint) so the list matches the agreed plan. **Sync the same enumerated list into the planning doc** so **## Decomposition** lists **all** phase/session/task units from the guide (or agreed plan); the doc must not be a single-task or single-session subset. Minimal child seeding is preserved only where cascade bootstrap or stable sequencing requires it; the guide is authoritative for the canonical list.

**Anti-pattern:** Do not skip filling the planning doc. **The user** should not run **`/accepted-plan`** until placeholders are replaced with concrete content. The agent does not run the command. Do not ask generic questions when the message already provides doc-grounded insight and options. The doc IS the artifact the agent maintains from context. Do not treat the planning doc as a mirrored decomposition contract — it is advisory; the guide owns current-tier decomposition.

### `planning_doc_incomplete` (returned by /accepted-plan or /accepted-code when planning doc still has placeholders)

Proceeding is **BLOCKED**. The user ran **`/accepted-plan`** (feature/phase/session) or **`/accepted-code`** (task) but the planning doc has not been filled (it still contains placeholders, including the **## Codebase recon** sentinel when present, and **## Decomposition** where applicable). Same enforcement for all tiers (except **express** profile tasks, which skip the planning-doc gate).

1. **Present `controlPlaneDecision.message` verbatim** — it explains that the agent MUST open the planning doc, replace placeholder sections with a concrete draft, save, and then **the user** runs **`/accepted-plan`** (or **`/accepted-code`** for task) again.
2. **You (the agent) MUST fill the planning doc** using the file edit tool: open the doc path from the message, examine the Reference section and linked files as needed, **complete ## Codebase recon** from the codebase and remove its sentinel line, and replace the remaining placeholder sections. Then **the user** runs **`/accepted-plan`** or **`/accepted-code`** again. Do not invoke the command yourself.
3. Do not suggest workarounds or skipping this step. The command will not proceed until the doc is filled.

### `guide_fill_pending` (feature / phase / session start — after /accepted-plan, Gate 2 prep)

The first **`/accepted-plan`** completed Part A (branch, ensure guide from plan). Under **decomposition** profile, **feature**, **phase**, and **session** starts can emit this outcome: the agent must fill the **guide** (actual planning) before execute continues. The outcome includes `guidePath` (path to the guide file).

1. **Present `controlPlaneDecision.message`** (or the outcome’s nextAction/deliverables) — the agent fills the guide with concrete Goal, Files, Approach, and Checkpoint for each session/task; then **the user** runs **`/accepted-build`**. Do not run the command yourself.
2. **Open the guide** at the path in the outcome (`outcome.guidePath`). Fill each tierDown block (Session or Task) with concrete content; remove placeholder text such as `[Fill in]`, `[To be planned]`. **Do not remove or merge tierDown blocks.** Preserve every existing Session or Task block. If the planning doc lists fewer items than the guide, keep all guide blocks and fill the extra ones from phase/session context or with `[To be planned]`. The guide may have more tasks than the planning doc — that is allowed.
3. **Do not replace the entire guide file.** Use targeted edits only. Preserve the required guide sections for this tier (see `.project-manager/REQUIRED_DOC_SECTIONS.md`). If the guide is in excerpt format or missing any of those sections, add the missing sections from the tier template (e.g. `.cursor/commands/tiers/session/templates/session-guide.md` for session) before filling; do not overwrite real content.
4. Save the file. Tell the user: "When you're ready, run **`/accepted-build`** to continue." Do not run it yourself.
5. When **the user** runs **`/accepted-build`**, Gate 2 runs (`isGuideFilled`); if the guide is filled, execute Part B runs (read context, audit, cascade). If the guide still has placeholders, the command returns **`guide_incomplete`**.

### `guide_incomplete` (returned by /accepted-build when guide still has placeholders, Gate 2)

Proceeding is **BLOCKED**. The user ran **`/accepted-build`** after `guide_fill_pending` but the guide has not been filled (it still contains placeholder text in tierDown blocks).

1. **Present `controlPlaneDecision.message` verbatim** — it explains that the agent MUST open the guide, replace placeholder text in each tierDown block (Session or Task) with concrete Goal, Files, Approach, and Checkpoint, save, and then **the user** runs **`/accepted-build`** again.
2. **You (the agent) MUST fill the guide** using the file edit tool: open the guide path from the message, and replace placeholder text (e.g. `[Fill in]`, `[To be planned]`) in each Session or Task block with concrete content. **Do not remove or merge tierDown blocks;** preserve every existing block; fill extras with `[To be planned]` or phase/session context if the planning doc lists fewer. Then **the user** runs **`/accepted-build`** again. Do not invoke the command yourself.
3. **Do not replace the entire guide file.** Use targeted edits only. Preserve the required guide sections for this tier (see `.project-manager/REQUIRED_DOC_SECTIONS.md`). If the guide is in excerpt format or missing those sections, add them from the tier template before filling; do not overwrite real content.
4. Do not suggest workarounds. The command will not proceed until the guide is filled.

### `pending_push_confirmation` (end commands)

End complete; push is pending. Direct the user to run **/accepted-push** to push to remote, or **/skip-push** to skip. **The user** runs the command; when they do, the result is presented. Do not invoke `acceptedPush()` or `skipPush()` yourself. The command clears end-pending state and returns cascade info (if any). If cascade is present, handle per **Cascade confirmation** below.

### `verification_work_suggested` (end commands)

Suggested manual verification for this tier. The checklist is for **verifying what we built** (product behavior, UX, correctness), not for verifying that documentation was created. Do not use "test" in playbook wording for this flow.

1. **Always present `controlPlaneDecision.message` as the verification checklist.** This contains the deliverables-based checklist (what to verify, what we built, artifacts/docs). Show it as a formatted, bulleted list — not as a code block or raw JSON. Present "What to verify (what we built)" first when present; then "Artifacts / docs" if present. Do not ask whether to add a validation step or whether the list is appropriate.
2. Present the **User choice required** block from the command output. Options:
   - **"Add follow-up task"** (session-end), **"Add follow-up session"** (phase-end), or **"Add follow-up phase"** (feature-end): use existing planning + start with context; pass the checklist as the scope/description for the new task, session, or phase (e.g. `/plan-task [sessionId]` with description derived from the checklist, then cascade to task-start; or plan-session / plan-phase for next session or phase with that scope, then session-start or phase-start). After the user completes that work, they run the same tier-end again; they may pass `continuePastVerification: true` to skip this prompt and run audits.
   - **"I'll do it manually; continue tier-end"**: re-invoke the same tier-end command with `continuePastVerification: true` so the workflow continues past the verification step and runs audits.
   - **"Skip; continue tier-end"**: same as above — re-invoke with `continuePastVerification: true`.

**Anti-pattern:** Do not ask "Should I add a task to add a validation step?" or similar. The checklist is the fixed list of verification todos; show it, then offer the three options only.

### `gap_analysis_pending` (end commands)

Tier-end **`gap_analysis`** step found possible **planned-vs-actual** or scope gaps (advisory). This is a **soft gate**: `success` may still be true; the workflow stopped before **`planning_rollup`** so you can register follow-up work.

1. **Present `controlPlaneDecision.message`** — it includes the gap report (same content as the structured checklist in command output when present).
2. Present the **User choice required** block (`questionKey`: **`gap_analysis_options`**). Options guide the user toward **tier-add** + **tier-start** for new child tiers; do **not** create child planning docs from tier-end.
3. **Continuation:** When the user is ready to proceed past the gate, re-invoke the **same** tier-end using **`controlPlaneDecision.nextInvoke`** when present (it sets `params.options.resumeEndAfterStep: 'gap_analysis'` and `continuePastGapAnalysis: true`). If `nextInvoke` is absent, re-run the same tier-end manually with **`continuePastGapAnalysis: true`** nested under **`params.options`** (not a top-level param — unlike **`continuePastVerification`**). There is **no** separate `/accepted-gaps` command.
4. **Follow-up registration:** Use existing **`/<tier>-add`** (and then **`/<tier>-start`**) per the report; the harness does not auto-create planning docs during tier-end.
5. **LLM review packet (v1):** The gap output includes **`## LLM review packet (v1)`** with harness sections (**Metadata**, **Drift summary**, **Planning excerpt**, **Changed files sample**, **Confidence and data quality**) and a **Rubric for reviewer** that lists **`### Review — …`** headings. The agent (or a subagent when context is large) performs that review in chat — **no** harness LLM API. Reply using only those **Review —** headings; do not paste empty copies of harness subsections.
6. **Two delivery paths:** When drift triggers the soft gate, **`controlPlaneDecision.message`** / deliverables carry the **full** report including the packet (primary read surface). When there is **no** drift, tier-end does **not** stop on `gap_analysis_pending`; the same packet still appears in **`result.output`** (stdout). In that case, **scan printed tier-end output** for **`## LLM review packet (v1)`** and perform the review anyway (see **LLM review packet (tier-end)** below).
7. **Friction:** Log only **material** harness/planning confusion to **`.project-manager/WORKFLOW_FRICTION_LOG.md`** (see process-workflow rule); not for every packet run.
8. **Express profile:** When **`gap_analysis`** is skipped, there is **no** packet for that run.

### `uncommitted_changes_blocking` (start/end/reopen commands)

**Before deep-diving raw git output:** check `.project-manager/.git-friction-log.jsonl` for the latest structured incident (see **Git debugging** above).

The command detected uncommitted files that would be overwritten by a branch checkout. Workflow artifacts (`.cursor`, `.project-manager`, `client/.audit-reports`) are non-blocking: they are stashed before checkout and restored (stash pop) on the target branch; they are never auto-committed by the tier-end commit step. Any other uncommitted files are blocking; `controlPlaneDecision.message` contains the list of blocking files. **Tier-end commit behavior:** All git operations for tier workflows go through **gitManager** (`.cursor/commands/git/shared/git-manager.ts`). Before committing, the workflow ensures the repo is on the tier's expected branch: if the current branch is wrong (e.g. two threads), it switches to the expected branch (stashing only workflow artifacts, then checkout, then stash pop) then commits. **Staging:** touched paths under **`client/`**, **`server/`**, and **`.project-manager/`** (non-transient docs only). **Never** staged: **`.cursor/`** (submodule), **`client/.audit-reports/`**, or **transient** `.project-manager/` harness files (e.g. `.tier-scope`, `.write-log`). See `.project-manager/HARNESS_CHARTER.md` (**Current implementation notes**).

**When only workflow artifacts were uncommitted:** The workflow auto-stashes them and proceeds with checkout, then runs stash pop on the target branch. The user may see planning doc (or other .project-manager) tabs show as deleted/red in the editor during that window — the file was **not** deleted by the agent; it was stashed and is restored when the workflow runs stash pop. The command output will include messages to that effect. If the user asks "why was the planning doc deleted?", explain: it was stashed for the branch switch and has been restored; no delete was run.

1. **Present `controlPlaneDecision.message`** to the user — this lists the uncommitted files blocking checkout.
2. Present the **User choice required** block from the command output (options: Commit changes / Skip (stash and continue)).
3. On "Commit changes": run `git add -A && git commit -m "chore: commit changes before branch switch"`, then re-invoke the original command using `controlPlaneDecision.nextInvoke`.
4. On "Skip": run `git stash --include-untracked`, then re-invoke the original command using `controlPlaneDecision.nextInvoke`. After the command completes, run `git stash pop` to restore the stashed changes.

### `wrong_branch_before_commit` (end commands)

The tier-end commit step aborted because the current git branch does not match the **expected feature branch** (e.g. `feature/my-feature`). Phase/session/task ends all resolve to the same feature branch.

1. **Present `controlPlaneDecision.message`** to the user — it states current vs expected branch.
2. **Consult `.project-manager/.git-friction-log.jsonl`** if the message alone is unclear.
3. **Checkout the correct branch:** run `git checkout <expected-branch>` (the expected branch is in the message). Resolve any uncommitted changes first (commit or stash per `uncommitted_changes_blocking` if needed).
4. Re-invoke tier-end using **`controlPlaneDecision.nextInvoke`** when present (same command with `params.options.resumeEndAfterStep: 'commit_remaining'`). If `nextInvoke` is absent, re-run the same tier-end manually with the same identifiers.

### `audit_fix_commit_failed` (end commands)

Autofix produced changes but committing them failed (strict git step).

1. Present **`controlPlaneDecision.message`** and fix git state (status, conflicts, hooks) per the message.
2. Re-invoke using **`controlPlaneDecision.nextInvoke`** so the harness resumes at **`end_audit`** (re-runs audit to repopulate autofix context, then retries the post-audit commit). Do not add `resumeEndAfterStep` manually.

### `git_failed` with resume (end commands — session / feature / phase)

When merge, push, or related git operations fail in the shared tier-end git step and the outcome is marked resumable, the control plane supplies **`nextInvoke`** with **`resumeEndAfterStep: 'git'`**.

1. Fix the underlying git issue (merge conflict, push auth, remote, etc.) per **`controlPlaneDecision.message`** and `.project-manager/.git-friction-log.jsonl`.
2. Re-invoke using **`controlPlaneDecision.nextInvoke`** — do not restart the full tier-end from scratch unless `nextInvoke` is missing.

### `expected_branch_missing_run_tier_start` (end commands)

**Legacy / rare:** Tier-end used to fail here before **preflight** could recover. With **`preflightFeatureBranchForHarness`**, “local missing, remote exists” is usually fixed by fetch + **`git checkout -B … origin/…`**. If you still see this code, treat like **`preflight_branch_failed`**: read the message, fix **origin** / network / branch name, then re-run tier-end.

### `preflight_branch_failed` and related codes (end commands)

**`preflight_branch_failed`** (or **`no_local_no_remote`**, **`diverged_from_remote`**, **`branch_behind_remote`**, **`ambiguous_branch_prefix`**, etc.): branch preflight before **`commit_remaining`** or tier **`runGit`** did not succeed.

1. Read **`controlPlaneDecision.message`** and **`steps.preflightBranch`** output.
2. **Wrong remote / no branch on origin:** Check **`git remote -v`**; ensure **`origin/feature/<slug>`** exists after **`git fetch`**, or run **tier-start** from develop if the feature branch was never published.
3. **Behind / diverged:** Pull or rebase per git hygiene; optional env: **`HARNESS_GIT_BEHIND_FF_PULL`**, **`SOLO_GIT_COHERENCE=warn`** / **`HARNESS_GIT_DIVERGED_POLICY=warn`** (see **HARNESS_CHARTER.md** §4).
4. Re-run the same tier-end (or **`resumeEndAfterStep: 'commit_remaining'`** when offered).

### Cascade confirmation (start and end commands)

When `outcome.cascade` is present:

1. Present the **User choice required** block (or use **AskQuestion**): "Cascade to [outcome.cascade.tier] [outcome.cascade.identifier]?" Options: "Yes — [outcome.cascade.command]" / "No — stop here".
2. On "Yes": invoke `outcome.cascade.command`.
3. On "No": show `outcome.nextAction` and stop.

**Cascade direction (end commands):** For task-end, `direction === 'across'` means there is a **next task** in the session — the next step is to run the next task (e.g. `/task-start <nextTaskId>`), not to end the session. Only when `direction === 'up'` is the next step to end the parent tier (e.g. `/session-end <sessionId>`). Always use `outcome.cascade.command` as the exact next command.

**Branch ownership during cascade:** When cascading up (e.g. task-end → session-end), the agent must **not** manually merge or delete the child branch. Branch merge is the **parent tier-end's** job: session-end merges session→phase; phase-end merges phase→feature. The agent should invoke `outcome.cascade.command` and let the parent tier-end handle its own branch lifecycle. Manually merging a session branch into the phase branch before session-end runs will cause session-end to fail (branch not found).

### `task_complete` (task-end)

- **If `outcome.cascade` is present:** Run **Cascade confirmation** (see above). Do not offer session-end or "roll up" unless `outcome.cascade.direction === 'up'`. When `direction === 'across'`, the next step is the **next task** — invoke `outcome.cascade.command` (e.g. `/task-start <nextTaskId>`) on "Yes", not `/session-end`.
- If no cascade: task is done. Show `outcome.nextAction`.

### Task-start success (after execute mode)

Task-start creates a **task planning doc** (e.g. `.project-manager/features/<feature>/sessions/task-6.4.4.1-planning.md`) during context gathering, with the same short-prompt shape as other tiers (Contract, Where we left off, Goal, Files, Approach, Checkpoint, Reference links). That doc is the **single source of truth** for the task plan. The session guide task block may be updated from it; do not overwrite a filled task block with placeholders.

After task-start succeeds (including after **/accepted-code**), the output contains **Implementation Orders** and the end command. The agent **must implement the task (write code, edit files) before running /task-end**. Do not run /task-end until the implementation is done; "Task ready" / "End with /task-end" means "ready to implement; when done, run task-end," not "run task-end now."

1. Uses the **task planning doc** as the source of truth for Goal, Files, Approach, and Checkpoint (same expectation as session-start and its session planning doc).
2. **Implements the task now** (write code, modify files) according to that plan.
3. Works through the implementation orders.
4. **Only when implementation is complete**, runs the `/task-end` command shown in the output.

### Session-start success (after execute mode)

After session-start succeeds, the output contains task planning data (first task details, compact prompt). The agent:

1. Reviews the session context and first task details.
2. If `outcome.cascade` is present: run **cascade confirmation** to start the first task.
3. If no cascade: show the compact prompt.

### Reopen success

After a reopen succeeds, the output shows the next step (plan child tier or make changes). The agent:

1. Present the **User choice required** block from the command output (Is there a plan you want to build this tier around? Options: Yes — I have a plan file / No — plan from scratch / No — just a quick fix).
2. On "Yes" with plan file: read the file, pass as `planContent` to the plan command.
3. On "No — plan from scratch": run the plan command without `planContent`.
4. On "No — quick fix": make changes, run tier-end when done.

---

## How to invoke (shared rule)

When the procedure says "call implementation", the agent:

1. Resolves the slash command name (e.g. feature-start) to the **composite file path** and **export name** using the command-to-entry-point table above.
2. From repo root, invokes that export with the params gathered from context and prompts.
3. Invocation method: e.g. `npx tsx -e "import('<path-to-composite>').then(m => m.<exportedFn>({ ... })).then(r => console.log(JSON.stringify(r)))"` or the project's standard way to run a TS export and capture the return value. Path and export name come from the table.
4. Captures the return value and proceeds to "Handle result" per the procedure.

When invoking a **tier-end** command (e.g. `/phase-end 6.5`), the pipeline runs verification, git steps, and tier-quality audits. **Wait for the command to finish** and capture the return value before handling the result.

### LLM review packet (tier-end)

After **non-express** tier-ends that run **`gap_analysis`**, the harness emits an **LLM review packet** for agent-led interpretation (drift facts, planning excerpt sample, changed paths, over-build rubric). **There is no OpenAI/API call from the harness.**

- **If `gap_analysis_pending`:** The packet is inside **`controlPlaneDecision.message`** (and output). Perform the **`### Review — …`** response in chat per the rubric in that message.
- **If tier-end succeeds without that stop:** Read **`result.output`** and look for **`## LLM review packet (v1)`**; if present, perform the same **`### Review — …`** review in chat. Do not skip the review only because there was no soft gate.
- **Subagent:** Use a subagent only when the packet plus context is large or branchy; otherwise answer in the main thread.

### Canonical inline examples (no temp scripts)

- Feature start: `npx tsx -e "import('./.cursor/commands/tiers/feature/composite/feature.ts').then(m => m.featureStart('6')).then(r => console.log(r))"`
- Phase start: `npx tsx -e "import('./.cursor/commands/tiers/phase/composite/phase.ts').then(m => m.phaseStart('6.2')).then(r => console.log(r))"`
- Session start (default execute): `npx tsx -e "import('./.cursor/commands/tiers/session/composite/session.ts').then(m => m.sessionStart('6.2.1')).then(r => console.log(JSON.stringify(r)))"`
- Session start (plan-only preview): `npx tsx -e "import('./.cursor/commands/tiers/session/composite/session.ts').then(m => m.sessionStart('6.2.1', undefined, { mode: 'plan' })).then(r => console.log(JSON.stringify(r)))"`
- Task start: `npx tsx -e "import('./.cursor/commands/tiers/task/composite/task.ts').then(m => m.taskStart('6.2.1.4')).then(r => console.log(JSON.stringify(r)))"`
- Task start (plan-only): `npx tsx -e "import('./.cursor/commands/tiers/task/composite/task.ts').then(m => m.taskStart('6.2.1.4', { mode: 'plan' })).then(r => console.log(JSON.stringify(r)))"`

**Start commands always run in plan mode.** Invoking a start command (e.g. `sessionStart('6.2.1')`) creates the planning doc and exits with `context_gathering`. The **agent** fills the planning doc; then **the user** runs **`/accepted-plan`** (feature/phase/session), **`/accepted-build`** when Gate 2 applies, or **`/accepted-code`** (task) to execute. Execute (branch, docs, audit, cascade) runs only when the user runs accepted commands.

---

## Code-level mode (plan vs execute)

Mode logic lives in `.cursor/commands/utils/command-execution-mode.ts`. Tier-specific impls branch on `isPlanMode(mode)` for their internal steps (e.g. guide sync, ensure tierDown, fill run only in execute). They do not add mode messages to output.

| Type | Values | Purpose |
|------|--------|---------|
| `CommandExecutionMode` | `'plan'` / `'execute'` | Code-level branch: does the impl preview or run side effects? |

**Execute/build** (branch creation, scope update, file writes, merges, etc.) happen after the user has approved. **`/accepted-plan`**, **`/accepted-build`** (when applicable), and **`/accepted-code`** allow the start workflow to proceed from the gate (resumeAfterStep) so the command does not re-run from the top. Impls return **data only** in `nextAction` strings (e.g. "Push pending. Then cascade if present.") — no behavioral scripts; behavioral rules live in this playbook.

---

## Start workflow architecture (dry-out guardrails)

**Shared workflow only.** All tier **start** commands use a single orchestrator and reusable step modules. The workflow is defined in:

- **Orchestrator:** `.cursor/commands/harness/run-start-steps.ts` — `runTierStartWorkflow(ctx, hooks)` runs the pipeline. **Start always runs in plan mode first**: context_gathering (validate → read context light → context gathering: write short planning doc) runs and exits. When the user runs **`/accepted-plan`**, **`/accepted-build`** (Gate 2 when required), or **`/accepted-code`**, the workflow **proceeds from the gate** (resumeAfterStep: ensure_branch) so it does not re-run validate, read_context_light, or context_gathering; it continues from ensure_branch → **ensure guide from plan** (when in active steps) → read context → gather → governance → extras → start audit → tier plan → fill direct tierDown → cascade. **Gate profile** may skip planning or guide steps for lighter work.
- **Step modules:** `.cursor/commands/tiers/shared/tier-start-steps.ts` — Reusable steps (e.g. `stepValidateStart`, `stepEnsureStartBranch`, `stepReadStartContext`, `stepStartAudit`, `stepRunTierPlan`, `stepBuildStartCascade`) use shared primitives (`formatBranchHierarchy`, `ensureTierBranch`, `runTierPlan`, `buildCascadeDown`). **Do not** add a synchronous blocking start-audit API; start audits stay async only.
- **Start audit (async only):** `stepStartAudit` spawns `.cursor/commands/audit/background-audit-runner.ts` (fire-and-forget) so tier-start never blocks on audit results; tier-end reads baseline deltas. There is no `runStartAuditForTier` entry point.
- **WorkProfile classification:** `tiers/shared/tier-start.ts` calls `classifyWorkProfile({ tier, action: 'start' })` before building the spec. The resolved profile is threaded through `options.workProfile`, `routingContext.workProfile`, and `pendingState` so downstream steps (planning doc, context injector, control-plane handlers) can use it without re-classifying.

**Impls are tier adapters only.** Each `*-start-impl.ts` (feature, phase, session, task) must:

- Build a `TierStartWorkflowContext` and a `TierStartWorkflowHooks` object (tier-specific: validation, branch options, read/gather, optional audit, first tierDown id, compact prompt).
- Call `runTierStartWorkflow(ctx, hooks)` and return its result.
- **Not** re-implement or inline the workflow sequence (no copying validate → branch → read → audit → plan → cascade into the impl). Any new step that belongs in the start pipeline belongs in the orchestrator or step modules, not in a single tier impl.

**Anti-regression:** When adding or changing start behavior, add or change it in the shared workflow or step modules and/or in the hooks contract; do not re-inline workflow steps into `feature-start-impl.ts`, `phase-start-impl.ts`, `session-start-impl.ts`, or `task-start-impl.ts`. **All four tiers (feature, phase, session, task) get the same workflow and doc steps** — never describe or implement changes as "optional for session/phase" or "session/phase left as-is"; if a step or doc applies to one tier, it applies to all tiers that have that concept (e.g. planning doc, tierDown enumeration, ensure guide from plan).

### Options-passing contract (tier-start re-invokes)

**Canonical params shape (non-negotiable):**
- `nextInvoke.params` must carry tier identifiers at top level (`featureId`, `phaseId`, `sessionId`, `taskId`, `description` where applicable).
- Execution toggles must live **only** in `nextInvoke.params.options`.
- Valid nested options for tier-start re-invoke: `options: { mode: 'plan' | 'execute' }`.

**Anti-patterns (prohibited):**
- Flat params like `{ mode: 'plan', sessionId: '6.4.4' }`.
- Mixing modes in two places (e.g. both `params.mode` and `params.options.mode`).
- Building re-invoke params ad hoc in handlers with inconsistent shape; use `buildStartReinvokeParams(baseParams, options)` in control-plane handlers.

**Decision flow table:**

| Reason code | Re-invoke params contract | Expected next |
|-------------|---------------------------|----------------|
| `context_gathering` | User runs /accepted-plan, /accepted-build (if prompted), or /accepted-code (workflow proceeds from gate, no re-run from top) | proceed → `start_ok` or `planning_doc_incomplete` |
| `uncommitted_changes_blocking` (start) | preserve existing `params.options` unchanged | same pass retried |

**Options-passing verification matrix (all tiers):** For each of `featureStart`, `phaseStart`, `sessionStart`, `taskStart` verify: (1) Start returns `context_gathering` (or proceeds per gate profile); user runs **`/accepted-plan`** / **`/accepted-build`** / **`/accepted-code`** as prompted. (2) `start_ok`: no further start required. (3) Proceed path: accepted commands pass `resumeAfterStep: 'ensure_branch'` so the workflow continues from ensure_branch without re-running validate, read_context_light, or context_gathering.

---

## End workflow architecture (dry-out guardrails)

**Shared workflow only.** All tier **end** commands use a single orchestrator and reusable step modules. The workflow is defined in:

- **Orchestrator:** `.cursor/commands/harness/run-end-steps.ts` — `runTierEndWorkflow(ctx, hooks)` runs the pipeline: plan exit → resolve runTests → preWork → test goal validation → runTests → midWork → comment cleanup → readme cleanup → **deliverables_check** → **planning_rollup** → **doc_rollup** → **commit_remaining** → **git** → propagate_shared → verification_check → config_fix → end_audit → after_audit → cascade.
- **Step modules:** `.cursor/commands/tiers/shared/tier-end-steps.ts` — Reusable steps include `stepDeliverablesAndPlanningHints`, `stepPlanningRollup`, `stepDocRollup` (log/handoff/optional guide rollup; `params.options.docRollupProfile` or `HARNESS_DOC_ROLLUP`, default **`planning_only`**; set **`all_non_guides`** or **`all`** to enable; **`express`** skips), `stepCommitUncommittedNonCursor`, `stepTierGit`, `stepEndAudit`, `stepBuildEndCascade`, etc. Git operations go through **gitManager** (`.cursor/commands/git/shared/git-manager.ts`); do not import from `tier-branch-manager` or `git/atomic` directly.
- **End audit entry point:** `.cursor/commands/audit/run-end-audit-for-tier.ts` — `runEndAuditForTier({ tier, identifier, params, featureName })` dispatches to `auditFeature`, `auditCodeQuality` (phase/session), or `auditTask`.
- **WorkProfile classification:** `tiers/shared/tier-end.ts` calls `classifyWorkProfile({ tier, action: 'end' })` and threads the profile through `routingContext.workProfile` so control-plane handlers can append work-profile-specific guidance to the decision message.

**Agents must wait for the full pipeline (including end audit) to complete;** do not treat a long run as a failure.

**Before `commit_remaining`: branch preflight:** **`stepCommitUncommittedNonCursor`** calls **`preflightFeatureBranchForHarness`** (via **`git-manager`**) before the in-scope diff and **`commitRemaining`**: fetch **`origin`**, create/checkout the local feature branch from **`origin/...`** when missing, enforce **`HEAD`**, then compare local vs remote (block **diverged** / **behind** by default; env toggles in **HARNESS_CHARTER.md** §4). Failures surface as **`preflight_branch_failed`** or a specific reason code (`no_local_no_remote`, `diverged_from_remote`, etc.).

**Commit preview & custom `commit_remaining` message:** After preflight, before **`commit_remaining`** stages files, the harness emits a read-only in-scope diff (command output) and **upserts** the same **## Harness: commit preview (in-scope diff)** block into the appropriate log (see **HARNESS_CHARTER.md** §4 — `getInScopeDiffPreviewForCommit`, `DocumentManager.upsertAnchoredLogSection`). Before re-running tier-end to finalize the commit, read that section (or the command output), draft a **conventional** subject (and optional body), and pass **`params.options.commitMessage`** with optional **`params.options.commitMessageBody`**. Those options apply **only** to the shared **`commit_remaining`** step; they are **not** the same as top-level **`commitMessage`** on some session/task flows used for feature-scoped **`gitCommit`**.

**Acceptance criteria & deliverables (agent-led, before tier-end):** Before telling the user to run the tier **end** command, re-read **## Acceptance Criteria** and **## Deliverables** from the planning doc (when present). In chat, state briefly whether each criterion was met and how. This is **not** a harness gate — visible reasoning for the user. **`express`** start profile may have skipped a planning doc; shorten or skip accordingly. Tier-end output may include an advisory **deliverables drift** report (planned paths vs working tree changes via git-manager); treat as discussion input, not an automatic failure. After **`planning_rollup`**, the consolidated planning file includes a `<!-- harness-planning-rollup … -->` marker; on a **re-run** of tier-end, the harness skips the drift heuristic for that file (child deliverables are merged into the parent doc). After **`doc_rollup`** (when not skipped by profile), parent logs/handoffs may include `<!-- harness-log-rollup … -->` / `<!-- harness-handoff-rollup … -->`; guide safe mode uses `<!-- harness-guide-rollup … -->` and archives child guides under **`doc-archive/guide/...`**. Scope: **`params.options.docRollupProfile`** or **`HARNESS_DOC_ROLLUP`** (default **`planning_only`**; **`all_non_guides`** for log + handoff; **`all`** enables guide rollup). **Wave A** skips **`6.*`** parents and **`appointment-workflow`** for all doc kinds.

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

**Harness entry:** `.cursor/commands/tiers/shared/tier-reopen.ts` — **`runTierReopen`** resolves context, builds **`WorkflowSpec`** with **`action: 'reopen'`** and **`mode: 'execute'`**, runs **`defaultKernel.run`**, and uses **`createStepAdapter`** with **`actionParams: { action: 'reopen', params }`** (same plugin/recorder/routing stack as start/end).

**Impls are tier adapters only.** Each `*-reopen-impl.ts` (feature, phase, session) receives a pre-resolved **`WorkflowCommandContext`** from the step adapter, builds hooks, and calls `runTierReopenWorkflow(ctx, hooks)`. Do not re-inline reopen steps into `tier-reopen.ts` or duplicate the kernel path outside `runTierReopen`.

---

## Shared outcome contract (start and end commands)

Start commands return **TierStartResult**: `{ success, output, outcome }`. End commands return a result with **outcome**: `{ status, reasonCode, nextAction, cascade? }`. Both use the same outcome shape for routing:

- `status`: e.g. `'completed' | 'blocked_needs_input' | 'blocked_fix_required' | 'failed'` (or for start: `'plan'`)
- `reasonCode`: short code (e.g. `'pending_push_confirmation'`, `'context_gathering'`)
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

## Tier vs WorkProfile (work classification)

**Tier** answers *who owns the work* and *where it cascades*. **WorkProfile** answers *what kind of work* this is. They are complementary: tier is orchestration; WorkProfile is the work-type classifier.

| Concern | Owned by | Purpose |
|---------|----------|---------|
| Scope, cascade, status, control-doc | Tier | Orchestration and ownership |
| Context packs, planning guidance, decomposition intensity | WorkProfile | Work classification |

**When classifier metadata influences behavior:**

- **Context gathering:** WorkProfile drives extra context artifacts (governance playbooks, context packs). Planning docs include a `## Work Profile` section with execution intent, action type, scope shape, and decomposition mode.
- **Planning-doc drafting:** Use the Work Profile section as advisory guidance. Decomposition mode (`light` / `moderate` / `explicit`) affects how much child detail to pre-specify.
- **Guide-authoritative decomposition:** The guide owns current-tier decomposition. WorkProfile's `decompositionMode` affects fill-direct-tier-down placeholder intensity.
- **Governance references:** `governanceDomains` map to playbooks and audit reports (see `governance-domain-map.ts`).
- **Verification suggestions:** Control-plane messages may include work-profile-specific planning focus (e.g. audit_fix → foreground report and playbook).

**Terminology:** Use `WorkProfile` (not tier-discriminator). The model complements tier; it does not replace it.

---

## Scope: explicit per command (context from params)

**Scope is explicit in every command.** Commands receive F/P/S/T via the slash command (e.g. `/session-start 6.9.2`, `/task-start 6.10.1.3`) or via params. Context is built once with **`WorkflowCommandContext.contextFromParams(tier, params)`**; the returned context carries **tier** and **identifier** so it is the single carrier of "what param" was used. Entry points (tier-start, tier-end, accepted-code, validate) pass this context through; impls and steps read from context (e.g. `context.identifier`, `context.feature.name`) and do not re-resolve from params.

**How scope is supplied:**
- **Start/end:** The command includes the tier identifier. Entry calls `contextFromParams(config.name, params)` and passes context to the adapter and impls. **Phase and session** params **must** include **`featureId` or `featureName`**. **Task** may omit them when **taskId** is **X.Y.Z.A** — **`resolveWorkflowScope`** derives the feature # from the first segment (`WorkflowId.parseTaskId`); pass **`featureId` / `featureName`** explicitly to override (e.g. directory slug). Resolution uses **`resolveWorkflowScope`** only (no git-branch inference). See `.project-manager/HARNESS_CHARTER.md` and this playbook (this section and **Tier navigation** below).
- **/audit-fix:** Pass explicit `featureName`, `tier`, and `identifier` to get tier-appropriate refs (guide + planning). Omit them to get governance refs only (no tier context).
- **/harness-repair:** Pass **`featureId`** (required); **`tier`** defaults to **`feature`**. For session-scoped advisory, pass **`tier: 'session'`** and **`sessionId`**. Plan mode is default; execute requires **`confirmed: true`** and **`entryHeadings`** matching `###` titles in the friction log.
- **/accepted-code:** Uses pending task state (**taskId**; **featureId** / **featureName** when stored, else derived from **taskId** when reading pending). Builds context via `contextFromParams('task', { taskId, featureId | featureName })`.

**Display and commits:** Commit message prefix and any scope display are derived from the current context (tier + identifier) in the command, e.g. `ctx.identifier` in end steps. Branch names use numbers only (e.g. `-phase-3.6-session-3.6.2`).

---

## Tier navigation

Adjacent-tier transitions use **tierUp**, **tierAt**, and **tierDown** (see `.cursor/commands/utils/tier-navigation.ts`).

- **tierAt(tier, identifier)** — Current tier context (identity). Use for "we are here" and prompts.
- **tierUp(tier)** — Parent tier: task→session, session→phase, phase→feature, feature→null. Use when there is no next unit at the current tier: the next step is to run the **parent tier end** (the command is derived from `tierUp(config.name)` — no hardcoded tier names).
- **tierDown(tier)** — Child tier: feature→phase, phase→session, session→task, task→null. Use after a tier start for **cascade** (see below).

**Identifier naming:** All tier identifiers use the `{tier}Id` pattern: `featureId`, `phaseId`, `sessionId`, `taskId`. Feature refs are PROJECT_PLAN **`#`** or **directory slug**; canonical directory via **`resolveFeatureDirectoryFromPlan`** / **`resolveWorkflowScope`** (`.cursor/commands/utils/workflow-scope.ts`).

**Start includes plan:** Each start impl runs `runTierPlan` for the same tier internally after setup (validation, branch, context). No separate `/plan-phase`, `/plan-session`, etc. is required before start.

**Cascade (structured):** Start and end commands return `outcome.cascade` when the agent should offer to cascade. The child tier (for start) or parent/next tier (for end) is derived from `tierDown(config.name)` or `tierUp(config.name)` — never hardcoded. The agent presents the User choice required block (cascade prompt + options) in chat; on confirmation, invokes `outcome.cascade.command`.

**Tier-up at end:** When there is no next item at the current tier, `outcome.cascade` (if present) points to the parent tier end command. Use the cascade confirmation flow above. Auto tier-up (running parent end when last at tier) is deferred; currently "suggest" only.

**Next step at end:** Do not infer from step text; always use `outcome.nextAction`.

**Tier reopen:** Use `/phase-reopen`, `/feature-reopen`, or `/session-reopen` when a completed tier needs additional child work (e.g. add session 4.1.4 to completed phase 4.1). **`runTierReopen`** uses the same harness path as start/end: **`defaultKernel.run`** with **`action: 'reopen'`**, **`mode: 'execute'`**, plugins, shadow recorder, and control-plane routing. Context comes from **`WorkflowCommandContext.contextFromParams`** and a params bag derived from **`TierReopenParams`** (phase/session include feature ref via id segments or explicit **`featureId`** / **`featureName`**), unless the caller passes **`preResolvedContext`** (e.g. tier-add). The workflow flips status from Complete to Reopened, ensures the branch, and logs the reopen. For agent behavior after the command returns, see **Per-reasonCode behavioral rules > Reopen success**.

**Adding children (`/{tier}-add`):** Use **`/feature-add`** to register a new feature row in **`.project-manager/PROJECT_PLAN.md`** Feature Summary (directory slug, e.g. `my-feature-track`; does not create `features/<slug>/` on disk — use **`/plan-feature`** or **`/feature-start`** next). Use **`/phase-add`**, **`/session-add`**, or **`/task-add`** to register a new child tier in its **parent guide** (`appendChildToParentDoc`). For phase/session/task, the command validates the identifier, resolves context, classifies a WorkProfile, **reads the immediate parent's control-doc status**, and if the parent is **Complete**, runs **`runTierReopen`** on that parent first (child context passed as **`preResolvedContext`**; spec metadata **`sourceCommand: 'tier-add'`**). If that reopen fails, add **aborts** (child is not registered) and workflow friction may be recorded with **`action: 'reopen'`**. Otherwise it appends the child to the parent doc (or, for **`feature-add`**, the program index row) and runs planning checks. It uses the same shared harness advisory-context builder as tier-start planning (`buildTierAdvisoryContext` in `.cursor/commands/harness/tier-advisory-context.ts`): governance contract preview (or an explicit **Task governance (deferred)** section for `task-add` when task files are not yet known), full **Work Profile** block, and **Architecture context** when available. Command output includes a **Reference** section with `.project-manager/WORKFLOW_FRICTION_LOG.md` and `npx tsx .cursor/commands/utils/read-workflow-friction.ts --last 20`. Material failures (context resolution, append to parent guide, parent auto-reopen) may append to the workflow friction log via **`.cursor/commands/harness/workflow-friction-manager.ts`** (same family as tier-start). The add command does **not** run **`/{tier}-start`** or write pending state; however, **auto-reopen of a Complete parent** uses the same **`ensureTierBranch`** path as manual reopen and may surface checkout / uncommitted-change handling. Child branch creation remains **`/{tier}-start`**'s job. After `/{tier}-start`, complete the planning doc and coverage check before `/accepted-plan` where applicable. Example: `/session-add 6.10.2 "availability polish"` registers session 6.10.2 in the phase 6.10 guide. Then run `/session-start 6.10.2` when ready. The add command is idempotent: if the child already exists, it reports that and skips the append.

**Auto-registration of children:** When planning a new child tier (e.g. `/plan-session 4.1.4`), the plan-* impl calls `appendChildToParentDoc` so the child is registered in the parent doc (e.g. session 4.1.4 added to phase-4.1-guide.md) if not already present. This is idempotent and allows cascade and discovery to work after a reopen. The **`phase-add` / `session-add` / `task-add`** commands use that `appendChildToParentDoc` mechanism; **`feature-add`** uses **`appendFeatureSummaryRowIfMissing`** in `.cursor/commands/utils/append-feature-summary-row.ts` for the PROJECT_PLAN table.

**Plan content and critique mode:** `planSession` and `planPhase` accept an optional `planContent` argument (e.g. from a user's `*.plan.md` file). When provided, that content is used as the guide instead of the template; planning checks still run and their output is presented as "Planning Review" (critique) without overwriting the user's content.

### Branch lifecycle (ownership and retention)

Each tier manages its **own** branch. Tier-end commands **delete** the tier branch (local + remote) after a successful merge and push to the parent.

| Operation | Owner | When |
|-----------|-------|------|
| **Create** session branch | session-start (`ensureTierBranch`) | At session start |
| **Commit on** session branch | task-end (`gitCommit`) | At each task-end |
| **Merge + delete** session → phase | session-end (`mergeTierBranch`) | When session is complete |
| **Create** phase branch | phase-start (`ensureTierBranch`) | At phase start |
| **Merge + delete** phase → feature | phase-end (`mergeTierBranch`) | When phase is complete |

**Pull requests (GitHub):** **session-end**, **phase-end**, and **feature-end** call `scripts/create-pr.ts`, which runs `gh pr create` using `--body-file` (reliable titles/bodies). This is **not** optional prose for the agent — the harness opens the PR when `gh` is on PATH and authenticated (`gh auth login`). Set **`HARNESS_SKIP_PR=1`** (or `true`/`yes`) to skip in CI or environments without `gh`. Optional **`HARNESS_PR_ASSIGNEE=me`** (or `1`) adds `--assignee @me`; omit the variable to avoid assignee failures. Successful runs surface the PR URL in `steps.createPR` and in `outcome.nextAction` when detectable.

**Deletion policy:** `mergeTierBranch` defaults to `deleteBranch: false`, but all tier-end impls (session, phase, feature) pass `deleteBranch: true`. Deletion uses `git branch -D` (force) because the merge and parent push are already confirmed at that point — the safe-delete check (`-d`) is redundant and fails when the tier branch has local-only commits (e.g. the tier-end commit) that were never pushed to its own remote. Remote branch deletion (`git push origin --delete`) follows the local delete.

**Re-entry (branch from prior run):** If a session or phase branch still exists (e.g. tier-end failed before delete, or the branch was recreated), tier-start validates parentage and checks out the existing branch instead of blocking. Work on it is cumulative. This means `/session-start 6.9.2` works even when `session-6.9.2` already exists, as long as the branch is properly based on its phase branch.

**Anti-pattern:** The agent must **never** manually run `git merge` or `git branch -d` on a tier branch between cascade steps. Branch merge and deletion are handled exclusively by the tier-end pipeline (`mergeTierBranch` in session-end-impl and phase-end-impl). Manually merging a session branch into the phase branch before running session-end will delete the branch and cause session-end to fail.

---

## Tier responsibility model

**Planning vs implementation:** Only **task-start** triggers coding. All higher tiers are planning-only:

- **Feature-start** — Plan: decompose feature into phases. No code changes.
- **Phase-start** — Plan: decompose phase into sessions. No code changes.
- **Session-start** — Plan: decompose session into tasks, then cascade to task-start. No code changes.
- **Task-start** — **Implementation:** Use the task planning doc (e.g. `task-<id>-planning.md`) as the single source of truth; load Goal, Files, Approach, Checkpoint from it and begin coding. Output includes Implementation Orders and the end command; the agent writes code until the task is done, then runs task-end.

**Automatic cascade flow:** Session-start returns `outcome.cascade` pointing to the first task (child tier from `tierDown('session')`). The agent uses AskQuestion, then invokes `outcome.cascade.command`. Task-end returns `outcome.cascade` either to the next task (across) or to the parent tier end (up, via `tierUp('task')`) when all tasks complete. Flow: session-start → (confirm cascade) → task-start → code → task-end → (confirm cascade) → task-start next or parent tier end → …

**Task-end cascade:** When task-end completes, it sets `outcome.cascade`: if a next task exists, `buildCascadeAcross('task', nextTaskId)`; if all tasks complete, `buildCascadeUp('task', sessionId)`. The agent presents the cascade choice in chat and then invokes `outcome.cascade.command` (generic; no tier-specific names in the contract).

**ControlDoc handoff:** Every end command must write the tier status to the control doc (phase guide for sessions, session guide for tasks, etc.) so the next start's validator can read it. Session-end writes the session checkbox in the phase guide; task-end writes task status in the session guide and calls `TASK_CONFIG.controlDoc.writeStatus`. This allows sequential gating: task-start validates that the previous task is complete before allowing the next.

**Document lifecycle (planning doc → guide and todos; handoff at tier-end only):**

- **Planning doc:** Created at tier-start in plan mode; updated in-place during the conversation. It is the single source for what we're building (Goal, Files, Approach, Checkpoint).
- **Guide and todos:** At tier-start in **execute** mode, the harness runs a single **ensure guide from plan** step: the current-tier guide is created or updated from the planning doc (structure and initial content from plan or placeholders); the guide is then filled by the agent (Gate 2) or by placeholder-fill only—never overwritten by a second sync. Enumerate tierDowns (step 6 in context_gathering) still ensures all task/session blocks exist for cascade.
- **Handoff:** Created and updated **only at tier-end** (session-end, phase-end, feature-end). Handoff is never generated from the planning doc at tier-start; it reflects "where we left off" after the tier completes. When filling or updating handoff, ensure all required sections exist (see `.project-manager/REQUIRED_DOC_SECTIONS.md`).

**Planning doc and guide write guard:** All writes to `*-planning.md` and `*-guide.md` under `.project-manager/` go through a guard in `utils/utils.ts`. If the file already exists and is "filled" (no placeholders), the write is **blocked** and a line is logged to stderr and to `.project-manager/.write-log`. Every protected-path write is logged to stderr with path and caller; set **`TIER_LOG_WRITES=1`** to also append all such writes to `.project-manager/.write-log` for a full audit of what is writing or attempting to overwrite planning docs and guides.

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

1. **Invoke reopen:** Resolve the slash command (`phase-reopen`, `feature-reopen`, or `session-reopen`) from the command-to-entry-point table and call the export with the tier identifier (and optional reason). Execution goes through **`runTierReopen` → `defaultKernel.run`** (same adapter pattern as start/end). The workflow validates the tier is Complete, flips status to **Reopened** in the guide/log, ensures the branch, and appends a reopen log entry.
2. **Agent behavior after reopen:** See **Per-reasonCode behavioral rules > Reopen success** for the choice flow, plan content handling, and quick fix path.

Reopened tiers are **startable** (same as In Progress). When the new work is done, run the tier-end command; mark-phase-complete (and equivalent) will set status back to Complete.

---

## Identifier-only input and context-derived titles

**Requirement:** User input is the identifier only. Never prompt for or require a title/description from the user. In the Context step, load the relevant guide/log/handoff and derive title, description, and any next identifiers using the rules below.

**Per-tier derivation rules:**

- **Session:** Description from session log title, then session guide (Session Name / Description), then phase guide session list. Next session from phase guide session list (next in order after current). Implemented in session-end (deriveSessionDescription, deriveNextSession); session-start derives description the same way when omitted.
- **Phase:** Title/description from phase guide (Phase Name, Description). Next phase from feature guide phase list if needed. phase-start does not take a title parameter.
- **Feature:** The start/end API uses **featureId** (string). Resolve to feature directory via **`resolveFeatureDirectoryFromPlan(featureId)`** (same mapping as PROJECT_PLAN Feature Summary — `#` or slug). Then call `featureStart(featureId, options)`. No user-supplied title.
  - **Numeric identifier (e.g. `3`):** Pass as featureId; `resolveFeatureDirectoryFromPlan("3")` returns the feature directory name. Do not use raw directory listing as authority; PROJECT_PLAN + scope helpers are the contract.
  - **Slug (e.g. `appointment-workflow`):** Pass as featureId; same helper validates against the plan / features dir.
  - **Identifier omitted:** Not valid for feature-start API — a feature ref is required. For utilities with no ref, use **`resolveActiveFeatureDirectory()`** (reads `.project-manager/.tier-scope`, not git).
- **Task:** Title/description from session guide task list or handoff; next task from session guide order. task-start does not take a description parameter; task context is loaded from session guide/handoff. The session guide must list each task with a heading matching `Task X.Y.Z.N:` (e.g. `#### Task 6.4.4.2:`) so task-end can cascade across; see "Enumerate tierDowns" in the context_gathering flow.

**Rule for context step:** Derive [title/description/next] from [doc paths]; do not ask the user.

**Planning commands:** No plan-* command requires a description. `/plan-phase`, `/plan-session`, `/plan-feature`, and `/plan-task` all accept identifier-only; description is derived in shared utils (`resolve-planning-description.ts`, `run-planning-pipeline.ts`).

---

## Debugging: protected writes and .write-log

To see **when and why** guides or planning docs are written (and to track overwrites):

- **`.project-manager/.write-log`** — Every protected write (`*-guide.md`, `*-planning.md` under `.project-manager`) is appended here with a timestamp and caller (file:line). Lines are either `WRITE <path> (caller: ...)` or `BLOCKED overwrite <path> (caller: ...)`. Use this to see which step or rerun wrote a file (e.g. after a workflow rerun that replaced a filled guide).
- **stderr** — The same lines are written to stderr when the write (or block) happens. To reduce noise when running commands, redirect stderr or run in a context where stderr is captured.

All protected writes go through `writeProjectFile` (in `.cursor/commands/utils/utils.ts`) or, when using DocumentManager, through the same guard. The guard blocks overwriting files that are already "filled" (no placeholders). Implementation: `.cursor/commands/utils/project-manager-write-guard.ts`.

---

## Atomic cutover checklist (harness git + tier-end resume)

Use when shipping changes to `.cursor/commands/git/**`, `run-end-steps.ts`, or control-plane routing for tier-end:

1. **`ensureTierBranch(`** — Grep all call sites; **tier-start** composites (feature, phase, session via git-policy) must pass `submoduleCursor` intentionally (`resolveSubmoduleCursorForTierStart` / execute vs plan). Tier-end `ensureTierBranch` for recovery may omit submodule sync.
2. **`wrong_branch_before_commit`**, **`audit_fix_commit_failed`**, **`git_failed`** — Grep: `control-plane-route.ts`, `control-plane-handlers.ts`, `buildEndReinvokeParams`, `tier-outcome` / `tierEndGitResumable`, this playbook, and `.cursor/skills/tier-workflow-agent/SKILL.md` stay aligned.
3. **Git boundary** — Grep for new `git` subprocess strings or `child_process` usage **outside** `.cursor/commands/git/**` (pre-existing npm/config-fix runners are OK).
4. **Hidden start composites** — Before merge, confirm any branch-local tier-start files still call `ensureTierBranch` with the intended submodule policy.
