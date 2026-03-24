---
description: Gate 2 — approve guide fill and resume start (decomposition) with guideFillComplete
---

**User runs this in Cursor** after the agent fills the guide when the workflow returned `guide_fill_pending`. The agent does not invoke it from the shell as the primary workflow.

From **repo root**:

```bash
npx tsx -e "import('./.cursor/commands/tiers/shared/accepted-build.ts').then(m => m.acceptedBuild()).then(r => console.log(JSON.stringify(r)))"
```

See `.cursor/commands/tiers/START_END_PLAYBOOK_STRUCTURE.md` (`guide_fill_pending`, `guide_incomplete`).
