# Command Registry (Hardening)

This folder provides a **data-first** way to prevent command drift across:
- `.cursor/commands/index.ts` (the public export surface)
- implementation files under `.cursor/commands/**`
- the slash-command names declared in file headers

## Why this exists

Over time, workflow systems become unstable when:
- a command file exists but is not exported (or vice versa)
- slash-command names are duplicated or inconsistent
- “real” side-effect commands aren’t clearly identified

The registry audit is meant to catch those problems **deterministically**.

## How it works

- `validation/atomic/audit-registry.ts` parses `.cursor/commands/index.ts`
- verifies every exported module exists
- scans for “command files” (files with `Atomic Command:` or `Composite Command:` headers)
- flags orphan command files not exported in `index.ts`
- extracts slash-command names (e.g. `/session-start`) and ensures they are unique

## Configuration

See `registry-audit-config.json` for allowlists (files that are intentionally not exported).


