---
name: Archive and Refactor Islands
overview: Archive dead code + batch/, purge all documentation markdown, archive playbooks + templates, merge document/ and workflow/, collapse 37 tier-specific files into 4 tier configs + ~7 generic shared operations using config-driven pipelines.
todos:
  - id: archive-dead-code
    content: "Move 9 files to _archived/: 3 deprecated git-*.ts, execute-scoped-change.ts, scope-and-plan.ts, create-retroactive-todos-command.ts, and 3 batch/ files. Add README. Clean index.ts."
    status: pending
  - id: purge-docs
    content: "Delete all READMEs, QUICK_REFERENCEs, guides, and the entire docs/ directory (~60 files). Archive playbooks (8 files) and templates (~21 files) to _archived/playbooks/ and _archived/templates/."
    status: pending
  - id: merge-document
    content: "Merge workflow/ (5 files) into document/ (3 files). Drop workflow- prefix. Delete workflow/ directory. Update index.ts exports."
    status: pending
  - id: define-tier-configs
    content: "Create tiers/configs/ with feature.ts, phase.ts, session.ts, task.ts -- each exports a TierConfig with: name, idFormat, parseId, paths, branch pattern, replanCommand, audit refs."
    status: pending
  - id: define-shared-operations
    content: "Create tiers/shared/ with generic operations: tier-start.ts, tier-end.ts, tier-change.ts, tier-validate.ts, tier-complete.ts, tier-checkpoint.ts, tier-plan.ts. Each takes TierConfig + params."
    status: pending
  - id: collapse-starts-ends
    content: "Replace 8 fat start/end files (session-start 400 lines, session-end 960 lines, etc.) with thin wrappers calling shared tier-start/tier-end with tier config."
    status: pending
  - id: collapse-change-commands
    content: "Replace 4 *-change files (~1200 lines total) with thin wrappers calling shared tier-change with tier config."
    status: pending
  - id: collapse-other-tier-commands
    content: "Replace validate-*, mark-*-complete, *-checkpoint, plan-* with thin wrappers calling shared operations."
    status: pending
  - id: wire-islands
    content: "Wire island modules (planning/, validation/, checkpoint/, status/, handoff/) as step implementations in the shared operations."
    status: pending
  - id: cleanup-index
    content: "Update index.ts barrel to only export connected files. Remove orphaned exports."
    status: pending
  - id: audit-the-audits
    content: "AFTER this refactor: trace audit composite transitive imports, determine which audit atomics are truly orphaned, decide what to do with security/ and audit/ islands."
    status: pending
isProject: false
---

# Command Island Refactor Plan

**Decisions locked in:**

- Pipeline: Config-driven (Option B), steps are function references
- batch/: Archive alongside dead code
- document/ + workflow/: Merge into unified `document/`, delete superseded files
- audit/: Pinned for separate pass after this refactor
- Documentation markdown: Delete all READMEs/guides/docs outright (context pollution)
- Playbooks: Archive for reference during pipeline build, delete after
- Templates: Archive for reference during document-generation rebuild

---

## Phase 1: Archive Dead Code + batch/

Move these 9 files to `.cursor/commands/_archived/`:

**Dead code (zero importers):**

- `[utils/git-commit.ts](.cursor/commands/utils/git-commit.ts)` -- deprecated duplicate of `git/atomic/commit.ts`
- `[utils/git-merge.ts](.cursor/commands/utils/git-merge.ts)` -- deprecated duplicate of `git/atomic/merge.ts`
- `[utils/git-push.ts](.cursor/commands/utils/git-push.ts)` -- deprecated duplicate of `git/atomic/push.ts`
- `[utils/execute-scoped-change.ts](.cursor/commands/utils/execute-scoped-change.ts)` -- never wired in
- `[utils/scope-and-plan.ts](.cursor/commands/utils/scope-and-plan.ts)` -- never wired in
- `[todo/composite/create-retroactive-todos-command.ts](.cursor/commands/todo/composite/create-retroactive-todos-command.ts)` -- CLI wrapper, never wired in

**batch/ (full directory island, not part of tier pipeline):**

- `[batch/atomic/batch-operation.ts](.cursor/commands/batch/atomic/batch-operation.ts)`
- `[batch/composite/batch-generate-handoffs.ts](.cursor/commands/batch/composite/batch-generate-handoffs.ts)`
- `[batch/composite/batch-update-logs.ts](.cursor/commands/batch/composite/batch-update-logs.ts)`

**Steps:**

1. `mkdir -p .cursor/commands/_archived/batch`
2. `git mv` each file into `_archived/`
3. Write `_archived/README.md` explaining these are inactive commands preserved for reference
4. Remove their exports from `index.ts`

---

## Phase 1.5: Purge Documentation Markdown + Archive Functional Markdown

### DELETE outright (~60 files) -- all documentation/meta-content:

Per-directory READMEs and QUICK_REFERENCEs:
- `commands/README.md`, `commands/USAGE.md`
- `audit/README.md`, `audit/QUICK_REFERENCE.md`
- `checkpoint/README.md`, `checkpoint/QUICK_REFERENCE.md`
- `comments/README.md`, `comments/QUICK_REFERENCE.md`, `comments/STRATEGIC_PLACEMENT_GUIDE.md`, `comments/feature-comment-cleanup-guide.md`, `comments/phase-comment-cleanup-guide.md`
- `document/README.md`, `document/QUICK_REFERENCE.md`
- `git/README.md`, `git/QUICK_REFERENCE.md`
- `handoff/README.md`, `handoff/QUICK_REFERENCE.md`
- `planning/README.md`, `planning/QUICK_REFERENCE.md`, `planning/SEPARATION_OF_CONCERNS.md`
- `readme/README.md`, `readme/QUICK_REFERENCE.md`
- `registry/README.md`
- `security/README.md`, `security/QUICK_REFERENCE.md`
- `status/README.md`, `status/QUICK_REFERENCE.md`
- `testing/README.md`, `testing/QUICK_REFERENCE.md`, `testing/CHANGE_DETECTION_GUIDE.md`, `testing/ENHANCEMENT_SUMMARY.md`, `testing/IMPLEMENTATION_SUMMARY.md`, `testing/INTEGRATION_COMPLETE.md`, `testing/USAGE_EXAMPLES.md`
- `tiers/CHECK_TIER_OVERLAP.md`, `tiers/START_END_PLAYBOOK_STRUCTURE.md`
- `todo/README.md`, `todo/QUICK_REFERENCE.md`
- `utils/README.md`
- `validation/README.md`, `validation/QUICK_REFERENCE.md`

Entire `docs/` directory (meta-documentation + examples):
- `docs/atomic-commands-architecture.md`
- `docs/research-question-set.md`
- `docs/template-usage-guide.md`
- `docs/tier-discriminator-guide.md`
- `docs/troubleshooting-guide.md`
- `docs/workflow-command-chain.md`
- `docs/examples/` (entire subdirectory)

### ARCHIVE to `_archived/playbooks/` (8 files) -- reference during pipeline build:

- `tiers/feature/playbooks/feature-start.md`, `feature-end.md`
- `tiers/phase/playbooks/phase-start.md`, `phase-end.md`
- `tiers/session/playbooks/session-start.md`, `session-end.md`
- `tiers/task/playbooks/task-start.md`, `task-end.md`

### ARCHIVE to `_archived/templates/` (~21 files) -- reference during doc-generation rebuild:

- `tiers/feature/templates/feature-guide.md`, `feature-handoff.md`, `feature-log.md`, `research-question-template.md`
- `tiers/phase/templates/phase-guide.md`, `phase-handoff.md`, `phase-log.md`, `phase-change-template.md`
- `tiers/session/templates/session-guide.md`, `session-handoff.md`, `session-log.md`, `session-start-response-template.md`
- `planning/templates/planning-architecture.md`, `planning-pattern.md`, `planning-risk.md`, `planning-technology.md`
- `readme/templates/guide.md`, `module-readme.md`, `quick-reference.md`, `temporary-status.md`
- `templates/approval-prompt-template.md`

### Steps:

1. `git rm` all documentation markdown files listed above
2. `git rm -r .cursor/commands/docs/`
3. `git mv` playbook files to `_archived/playbooks/` (preserving tier subdirectory structure)
4. `git mv` template files to `_archived/templates/` (preserving tier subdirectory structure)
5. Delete any now-empty directories left behind

---

## Phase 2: Merge document/ + workflow/ into unified document/

**Current state (3 layers of overlap):**

- `utils/read-guide.ts` + `utils/read-handoff.ts` -- low-level utils used by tier start/end (KEEP in utils/)
- `utils/document-manager.ts` -- the Facade implementation (KEEP in utils/)
- `document/atomic/` -- 3 section-level commands using DocumentManager
- `workflow/` -- 5 document commands using WorkflowCommandContext

**Merge plan:**

The existing `document/atomic/` files stay. Move `workflow/` files into `document/composite/`, dropping the `workflow-` prefix:

```
document/
  atomic/
    read-section.ts       (existing, no change)
    extract-section.ts    (existing, no change)
    list-sections.ts      (existing, no change)
  composite/
    read-guide.ts         (from workflow/workflow-read-guide.ts)
    read-handoff.ts       (from workflow/workflow-read-handoff.ts)
    read-log.ts           (from workflow/workflow-read-log.ts)
    update-section.ts     (from workflow/workflow-update-section.ts)
    create-from-template.ts (from workflow/workflow-create-from-template.ts)
```

**Steps:**

1. `mkdir -p .cursor/commands/document/composite`
2. `git mv` each workflow file, renaming to drop prefix
3. Update internal import paths in the moved files (they imported from `../utils/`, now need `../../utils/`)
4. Delete the `workflow/` directory
5. Update `index.ts` exports: change `workflow/workflow-*` to `document/composite/*`

---

## Phase 3: Define TierConfig and Shared Operations

### 3a: TierConfig type

The central abstraction. Every tier-specific difference is captured in config, not code.

```typescript
interface TierConfig {
  name: 'feature' | 'phase' | 'session' | 'task';
  idFormat: string;                                    // 'name' | 'N' | 'X.Y' | 'X.Y.Z'
  parseId: (id: string) => ParsedId | null;            // WorkflowId.parseSessionId, etc.
  paths: {
    guide: (ctx: WorkflowCommandContext, id: string) => string;
    log: (ctx: WorkflowCommandContext, id: string) => string;
    handoff: (ctx: WorkflowCommandContext, id: string) => string;
  };
  branch: {
    pattern: string;                                   // '{feature}-phase-{phase}-session-{session}'
    parentTier?: TierConfig;                           // for merge-up on end
  };
  replanCommand?: (id: string, desc: string, feature?: string) => Promise<string>;
  audit?: {
    start?: PipelineStepFunction;
    end?: PipelineStepFunction;
  };
}
```

### 3b: Create `tiers/configs/`

4 files, one per tier:

```
tiers/configs/
  feature.ts   -- FEATURE_CONFIG: TierConfig
  phase.ts     -- PHASE_CONFIG: TierConfig
  session.ts   -- SESSION_CONFIG: TierConfig
  task.ts      -- TASK_CONFIG: TierConfig
```

Each is ~30-50 lines of pure configuration, no logic.

### 3c: Create `tiers/shared/` -- generic operations

7 files that replace ~37 tier-specific files:

```
tiers/shared/
  types.ts            -- TierConfig, PipelineContext, PipelineStepResult, etc.
  tier-start.ts       -- runTierStart(config, params, options)
  tier-end.ts         -- runTierEnd(config, params, options)
  tier-change.ts      -- runTierChange(config, params) -- replaces 4 *-change files (~1200 lines)
  tier-validate.ts    -- runTierValidate(config, id) -- replaces 2 validate-* files
  tier-complete.ts    -- runTierComplete(config, id) -- replaces 3 mark-*-complete files
  tier-checkpoint.ts  -- runTierCheckpoint(config, id) -- replaces 3 *-checkpoint files
  tier-plan.ts        -- runTierPlan(config, id, desc) -- replaces 4 plan-* files
```

### What `tier-change.ts` looks like (example)

The 4 current *-change files share this identical flow. The only differences are handled by config:

```typescript
export async function runTierChange(
  config: TierConfig,
  params: { identifier: string; description: string; scope?: ChangeScope },
  featureName?: string
): Promise<TierChangeResult> {
  const resolved = await resolveFeatureName(featureName);
  const context = new WorkflowCommandContext(resolved);

  // 1. Parse identifier using tier-specific parser
  const parsed = config.parseId(params.identifier);

  // 2. Parse change request (shared logic -- identical across tiers)
  const changeRequest = parseChangeRequest(params.description);

  // 3. Identify scope (shared)
  const scope = await identifyChangeScope(changeRequest);

  // 4. Assess scope (shared, tier name from config)
  const assessment = assessChangeScope(changeRequest, scope, config.name);

  // 5. Re-plan if needed (tier-specific planner from config, or skip)
  if (assessment.requiresReplanning && config.replanCommand) {
    await config.replanCommand(params.identifier, params.description, resolved);
  }

  // 6. Update log (tier-specific path from config)
  const logPath = config.paths.log(context, params.identifier);
  const logEntry = formatChangeEntry(config.name, changeRequest, scope, params.identifier);
  await appendLog(logEntry, params.identifier);

  // 7. Format output (shared, parameterized by tier name)
  return formatChangeOutput(config.name, changeRequest, scope, assessment);
}
```

Then `session-change.ts` becomes:

```typescript
import { runTierChange } from '../shared/tier-change';
import { SESSION_CONFIG } from '../configs/session';

export async function sessionChange(params: ChangeRequestParams, featureName?: string) {
  return runTierChange(SESSION_CONFIG, {
    identifier: params.sessionId,
    description: params.description,
    scope: params.scope,
  }, featureName);
}
```

---

## Phase 4: Collapse ALL Tier Commands to Thin Wrappers

### What currently exists (37 files across tiers/):

**Feature (9 files):** feature-start, feature-end, feature-change, feature-create, feature-load, feature-checkpoint, feature-research, feature-summarize, feature-close
**Phase (7 files):** phase-start, phase-end, phase-change, phase-checkpoint, plan-phase, validate-phase, mark-phase-complete
**Session (10 files):** session-start, session-end, session-change, session-checkpoint, plan-session, validate-session, mark-session-complete, update-handoff, new-agent, create-session-label
**Task (13 files):** task-start, task-end, task-change, plan-task, mark-task-complete, log-task, log-subsession, format-task-entry, format-subsession-entry, add-task-section, add-subsession-section, checkpoint, mark-complete

### What replaces them:

**4 tier configs** (~~30-50 lines each, pure config)
**7 shared operations** (~~100-200 lines each, all the logic)
**~8-12 thin wrappers** (~10-30 lines each, just route to shared + config)

Some tier-specific atomics (feature-create, feature-load, feature-close, create-session-label, format-task-entry) may survive as genuine tier-specific helpers that feed INTO the shared operations. These are cases where one tier has unique behavior that the others don't need.

### Execution order:

1. Start with `*-change` commands -- cleanest example (4 near-identical files, ~1200 lines -> ~200 shared + 4x ~15-line wrappers)
2. Then `validate-*` and `mark-*-complete` -- small and straightforward
3. Then `*-checkpoint` and `plan-*`
4. Then starts -- medium complexity
5. Then ends -- most complex (session-end is 960 lines), do last when pattern is proven

---

## Phase 5: Wire Island Modules as Step Implementations

Once the shared operations exist, the island modules become their implementations:

- `planning/` -- powers `tier-plan.ts` and planning-check steps in `tier-start.ts`
- `validation/` -- powers `tier-validate.ts`
- `checkpoint/` -- powers `tier-checkpoint.ts`
- `status/` -- feeds context-gathering step in `tier-start.ts`
- `handoff/` -- feeds document-loading steps
- `document/` (merged) -- feeds document operations

Modules pinned for audit pass:

- `security/` -- likely becomes an audit step
- `audit/` orphaned atomics -- needs transitive trace
- `comments/` orphaned files -- evaluate during cleanup
- `readme/` orphaned files -- evaluate during cleanup
- `testing/` orphaned files -- evaluate during cleanup

---

## Phase 6: Clean Up

1. Delete the original fat tier-specific files (replaced by thin wrappers)
2. Update `index.ts` to export shared operations + thin wrappers + connected utils only
3. Remove all orphaned exports

---

## Post-Refactor: Audit the Audits

Immediately after this refactor, run a separate pass to:

1. Trace transitive imports from audit composites to determine which atomics are truly orphaned
2. Decide how security/ integrates (likely as an audit step)
3. Clean up any remaining orphaned audit/security files

