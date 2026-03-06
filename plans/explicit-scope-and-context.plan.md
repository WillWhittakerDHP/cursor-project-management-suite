# Explicit scope and context: flatten and document

## Current problems (why agents can't reason)

- **Two ways to get feature:** (1) `WorkflowCommandContext.fromTierParams(tier, params)` (identifier → derive feature from files), (2) `resolveFeatureName()` → `FeatureContext.getCurrent()` (git branch). Same command path can use different sources (e.g. runTierStart uses fromTierParams, taskStartImpl then uses resolveFeatureName → wrong feature when branch differs).
- **Recursion/fallbacks:** Task feature derivation has two code paths (task planning doc, then session guide fallback). `resolveFeatureName(override)` means "override or git branch." Legacy scope file: read/write, empty reads, resolveTierId/Name — all add indirection and confusion. That scope file is legacy cruft: sometimes written, never read for resolution. Delete it entirely.

## Single explicit rule

**Context (feature) is determined only from the tier identifier in the command (or an explicit featureId when the API allows). Never from git branch. Never from a scope file.**

- **One entry point for "params → context":** `WorkflowCommandContext.fromTierParams(tier, params)`.
- Params must include the tier identifier (`featureId`, `phaseId`, `sessionId`, `taskId`). For `task`, optional `featureId` overrides derivation.
- All commands that need feature must call `fromTierParams` with the identifier they have; no `getCurrent()` and no `resolveFeatureName()` without an explicit override.
- **No scope file:** Delete the legacy scope module and file concept. No legacy fallbacks or accommodations.

---

## DELETE LEGACY SCOPE MODULE ENTIRELY

**Remove with no leftovers:**

1. **Delete the legacy scope file.** Do not leave any of its exports in another file. Commit message prefix and "scope cleared" messaging must be derived from **context (ctx)** in the end workflow only.

2. **Call sites to update:** command-context (remove scope type and property), task-start-impl (remove scope writes), tier-end-steps (commit prefix from ctx; remove stepClearScope), playbook (scope from context only), feature-context (reword comment). End pipeline: remove stepClearScope from orchestrator.

3. **No legacy accommodations:** No stub file or re-export of scope types. Commit prefix from `ctx` (tier + identifier) only.

---

## Inventory: where scope/validation/identification are used

| Location | Current behavior | Change |
|----------|------------------|--------|
| [validate-task-impl.ts](.cursor/commands/tiers/task/composite/validate-task-impl.ts) | Uses `fromTierParams('task', { taskId })` only | Done; no change. |
| [tier-start.ts](.cursor/commands/tiers/shared/tier-start.ts) | `fromTierParams(config.name, params)` | No change. |
| [tier-end.ts](.cursor/commands/tiers/shared/tier-end.ts) | `fromTierParams(config.name, params)` | No change. |
| [accepted-code.ts](.cursor/commands/tiers/shared/accepted-code.ts) | `fromTierParams('task', { taskId, featureId: state.featureId })` | No change. |
| [task-start-impl.ts](.cursor/commands/tiers/task/composite/task-start-impl.ts) | resolveFeatureId/resolveFeatureName; scope writes | **Use contextFromParams only**; remove scope usage. |
| [task.ts](.cursor/commands/tiers/task/composite/task.ts) | logTask, markTaskComplete | **Use contextFromParams** for context. |
| [tier-change.ts](.cursor/commands/tiers/shared/tier-change.ts) | resolveFeatureName | **Use contextFromParams when no featureName**. |
| [tier-end-steps.ts](.cursor/commands/tiers/shared/tier-end-steps.ts) | scope reads, stepClearScope | **Commit prefix from ctx only;** remove stepClearScope. |
| [feature-context.ts](.cursor/commands/utils/feature-context.ts) | getCurrent, resolveFeatureName, deriveFeatureNameFromIdentifier | **Narrow:** keep featureNameFromTierAndId and resolveFeatureId; remove getCurrent from command paths. |
| [command-context.ts](.cursor/commands/utils/command-context.ts) | getCurrent; scope property | **Remove scope property and getCurrent** (or deprecate). |

---

## Implementation summary (scope module deletion)

1. **Delete** the legacy scope module file entirely. No replacement. No preserved helpers that replicate scope file behavior.

2. **command-context.ts:** Remove scope type import and `scope` property. Remove or deprecate `getCurrent()`.

3. **task-start-impl.ts:** Get context via `contextFromParams('task', { taskId, featureId })` only; remove scope writes.

4. **task.ts:** logTask and markTaskComplete use `fromTierParams('task', { taskId, featureId })` for context.

5. **tier-change.ts:** When featureName missing, use `fromTierParams(config.name, bag)` with bag built from params.identifier; when provided, resolveFeatureId(featureName).

6. **tier-end-steps.ts:** Remove all scope-module imports and usage. Commit prefix from `ctx.identifier` only. stepClearScope: remove from pipeline and delete.

7. **run-end-steps (or equivalent):** If it calls stepClearScope, remove that call so the step is no longer in the end workflow.

8. **feature-context.ts:** resolveFeatureName require override or remove; getCurrent removed from command use.

9. **Playbook:** Scope section states: context from identifier only; display and commit prefix from context (tier + identifier).

---

## Optional: single path for task feature derivation

In `deriveFeatureNameFromIdentifier` for task, keep one documented order (e.g. task planning doc then session guide). No extra fallbacks.

---

## Files to touch (checklist)

- [ ] DELETE legacy scope module file
- [ ] command-context.ts — remove scope type + property; remove/deprecate getCurrent
- [ ] task-start-impl.ts — contextFromParams only; remove scope usage
- [ ] task.ts — logTask, markTaskComplete use contextFromParams
- [ ] tier-change.ts — contextFromParams when featureName missing
- [ ] tier-end-steps.ts — commit prefix from ctx; remove stepClearScope
- [ ] run-end-steps — remove stepClearScope from pipeline
- [ ] feature-context.ts — getCurrent out of command paths
- [ ] START_END_PLAYBOOK_STRUCTURE.md — Scope: explicit from context only

No legacy fallbacks or accommodations.
