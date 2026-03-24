---
description: Gate 1 — approve planning doc and resume feature/phase/session start from ensure_branch
---

**User runs this in Cursor** after the agent fills the planning doc. The agent does not invoke it from the shell as the primary workflow.

From **repo root**:

```bash
npx tsx -e "import('./.cursor/commands/tiers/shared/accepted-plan.ts').then(m => m.acceptedPlan()).then(r => console.log(JSON.stringify(r)))"
```

See `.cursor/commands/tiers/START_END_PLAYBOOK_STRUCTURE.md` (`context_gathering`, `planning_doc_incomplete`, `guide_fill_pending`).
