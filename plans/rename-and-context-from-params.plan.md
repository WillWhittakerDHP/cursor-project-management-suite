---
name: ""
overview: ""
todos: []
isProject: false
---

# Rename resolution APIs and pass context through

## Goal

1. **Rename** to a consistent "from params" naming: `featureNameFromTierAndId` (or keep internal), **contextFromParams(tier, params)** (replacing fromTierParams). Context carries **tier** and **identifier** when built from params.
2. **Pass context through** so entry builds context once, adapter/impls receive it and read from it (no re-resolve).
3. **Context only:** No shared file or module for "current" tier/identifier. Commit prefix and any display come from **ctx** (tier + identifier) in the workflow only.

---

## Part A: Renames and context-from-params

- **featureNameFromTierAndId(tier, identifier):** In [feature-context.ts](.cursor/commands/utils/feature-context.ts), rename `deriveFeatureNameFromIdentifier` to this (or keep as internal helper). Returns feature name string.
- **contextFromParams(tier, params):** In [command-context.ts](.cursor/commands/utils/command-context.ts), rename `fromTierParams` to this. When building from params, set on the instance: **tier** and **identifier** (extracted from params per tier) so context is the single carrier of "what param and what we resolved to."
- All call sites of `fromTierParams` switch to `contextFromParams`. Entry points (tier-start, tier-end, accepted-code, validate-task) pass **context** into the adapter; adapter passes **context** into impls. Impls (e.g. taskStartImpl) accept **context** and use `context.identifier`, `context.feature.name`, `context.paths`; no second resolution and no `resolveFeatureName`/`resolveFeatureId` for context.

---

## Part B: Context only (no shared file)

**No shared file or re-exposed types for tier/identifier.**

1. Commit prefix and any "cleared" messaging are derived from **ctx** in the end workflow only.
2. **Call sites:** command-context (remove scope property), task-start-impl (no writes to any shared file), tier-end-steps (commit prefix from ctx; remove stepClearScope), run-end-steps (remove stepClearScope), playbook (context from params only), feature-context (reword comment).
3. No stub or helpers that re-expose file-based tier/identifier.

---

## File-level checklist

**Renames and context:**

- [feature-context.ts](.cursor/commands/utils/feature-context.ts) — rename `deriveFeatureNameFromIdentifier` → `featureNameFromTierAndId` (or keep internal name)
- [command-context.ts](.cursor/commands/utils/command-context.ts) — rename fromTierParams → contextFromParams; add tier? and identifier? to context; remove scope property
- [tier-start.ts](.cursor/commands/tiers/shared/tier-start.ts) — use `contextFromParams`, pass `context` into `createTierAdapter`
- [tier-end.ts](.cursor/commands/tiers/shared/tier-end.ts) — use `contextFromParams`, pass `context` into `createTierAdapter`
- [tier-adapter.ts](.cursor/commands/harness/tier-adapter.ts) — accept `context` in opts; call impls with context (e.g. `taskStartImpl(context, options, shadow)`)
- [task-start-impl.ts](.cursor/commands/tiers/task/composite/task-start-impl.ts) — signature with context; use context.identifier, context.feature.name, context.paths; remove resolveFeatureName/resolveFeatureId and any shared-file usage
- [accepted-code.ts](.cursor/commands/tiers/shared/accepted-code.ts) — use `contextFromParams`
- [validate-task-impl.ts](.cursor/commands/tiers/task/composite/validate-task-impl.ts) — use `contextFromParams`
- [START_END_PLAYBOOK_STRUCTURE.md](.cursor/commands/tiers/START_END_PLAYBOOK_STRUCTURE.md) — update Scope section for contextFromParams and context-carrying tier/identifier

**Context only (no shared file):**

- No shared file for tier/identifier; commit prefix and display from ctx only
- [tier-end-steps.ts](.cursor/commands/tiers/shared/tier-end-steps.ts) — commit prefix from ctx; remove stepClearScope
- [run-end-steps.ts](.cursor/commands/harness/run-end-steps.ts) — remove stepClearScope import and call
- [feature-context.ts](.cursor/commands/utils/feature-context.ts) — reword comment

