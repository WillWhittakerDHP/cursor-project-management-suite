# `.cursor` Refactor Audit (Deterministic Outputs)

This folder mirrors the **data-first audit style** used in `frontend-root/.audit` and `frontend-root/.typecheck`.

The goal is to support a safe, reliable `.cursor/commands` refactor by generating **repeatable reports**:
- A **machine-readable JSON** file for tooling and trend comparisons
- A **human-readable Markdown** report for triage and planning

## How to run

From the repo root:

```bash
node .cursor/scripts/refactor-audit.mjs
node .cursor/scripts/refactor-audit-summary.mjs
```

## Outputs

- `workflow-refactor-audit.json`
- `workflow-refactor-audit.md`

## What it flags (high leverage)

- **plan/execute mixing**: commands that claim Ask-mode / plan-only but perform side effects (git/file writes/runCommand)
- **path duality**: single file references both `project-manager/features/...` and `.cursor/project-manager/features/...`
- **hard-coded workflow doc paths**: direct usage of workflow doc roots outside the path resolver

## Configuration

Edit `workflow-refactor-audit-config.json` to tune weights and scope.

## Next step (when we start executing the refactor)

Use the top pools to drive a **small, deterministic sequence**:
1. Fix plan/execute contract mismatches (highest risk)
2. Canonicalize workflow doc roots (remove dual paths)
3. Enforce via validation (prevent regressions)


