# Workflow Harness (Charter End-State)

- **Kernel:** `defaultKernel` runs a deterministic step graph; `getStepGraph(spec)` and `run(spec, deps)`.
- **Adapter:** `createTierAdapter({ config, params, options })` delegates to tier start/end impls (feature, phase, session, task).
- **Plugins:** `createPluginRegistry()` — register plugins; kernel runs `beforeStep`/`afterStep`/`onFailure` and merges `contributeOutcome`. Capability enforcement: `write_context` plugins are skipped when `spec.constraints.allowWrites === false`.
- **Entry:** `tier-start.ts` and `tier-end.ts` build a `WorkflowSpec`, run `defaultKernel.run(spec, deps)`, and return control-plane decision + outcome.

Contracts: `.project-manager/HARNESS_CHARTER.md` §7.
