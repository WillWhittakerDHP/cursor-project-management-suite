# /propagate — Propagate shared files to all active branches

## Purpose

Copies shared files (PROJECT_PLAN.md, .gitignore, .cursor submodule) from the current branch to all active tier branches, preventing stale-file rediscovery by agents.

## When to use

- After fixing `PROJECT_PLAN.md` (status corrections, open questions, etc.)
- After updating `.gitignore` with new transient state entries
- After committing harness fixes to the `.cursor` submodule
- After any change to a file that should be identical across all branches

## Entry points

| Function | Module | What it does |
|----------|--------|-------------|
| `propagateSharedFiles` | `git/composite/propagate-files.ts` | Propagates PROJECT_PLAN.md + .gitignore + .cursor submodule |
| `propagateHarness` | `git/composite/propagate-files.ts` | Propagates .gitignore + .cursor submodule only |
| `propagateFiles` | `git/composite/propagate-files.ts` | Full options: custom file list, explicit targets, dry run |

## Agent instructions

When the user runs `/propagate`, follow these steps:

1. **Determine what to propagate.** Ask if unclear:
   - "shared" preset (default) = PROJECT_PLAN.md + .gitignore + .cursor submodule
   - "harness" preset = .gitignore + .cursor submodule only
   - Custom file list = user specifies paths

2. **Run dry run first** to show the user which branches will be touched:
   ```typescript
   import { propagateSharedFiles } from './git/composite/propagate-files';
   const preview = await propagateSharedFiles(undefined, { dryRun: true });
   ```

3. **Present the preview** showing target branches and ask user to confirm.

4. **Execute the propagation:**
   ```typescript
   const result = await propagateSharedFiles();
   ```

5. **Report results** — show updated/skipped/failed branches.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sourceBranch` | string | current branch | Branch with the canonical file versions |
| `files` | string[] | from preset | Explicit file paths to propagate |
| `includeSubmodule` | boolean | from preset | Also update .cursor submodule ref |
| `targetBranches` | string[] | auto-discover | Explicit branch list (default: all `feature/`, `phase-`, `session-` branches) |
| `preset` | 'shared' \| 'harness' | — | Predefined file sets |
| `commitMessage` | string | auto-generated | Custom commit message |
| `dryRun` | boolean | false | Preview without making changes |

## Presets

- **shared**: `.project-manager/PROJECT_PLAN.md`, `.gitignore`, `.cursor` (submodule)
- **harness**: `.gitignore`, `.cursor` (submodule)

## Safety

- Stashes uncommitted changes before starting, restores after
- Skips branches where files are already identical (no noise commits)
- Logs failed branches and continues to the next
- Returns to the original branch when done
- Use `dryRun: true` to preview before executing
