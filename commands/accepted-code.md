---
description: Begin coding — approve pending task tier-start from gate
---

**User runs this in Cursor** after the agent fills the task planning doc (unless **express** gate profile applies). The agent does not invoke it from the shell as the primary workflow.

From **repo root**:

```bash
npx tsx -e "import('./.cursor/commands/tiers/shared/accepted-code.ts').then(m => m.acceptedCode()).then(r => console.log(JSON.stringify(r)))"
```

See `.cursor/commands/tiers/START_END_PLAYBOOK_STRUCTURE.md` (task start, `planning_doc_incomplete`).
