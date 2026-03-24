---
description: Skip push and clear end-pending; surface cascade if present
---

**User runs this in Cursor** when tier-end completed with push pending but you choose not to push. The agent does not invoke it from the shell as the primary workflow.

From **repo root**:

```bash
npx tsx -e "import('./.cursor/commands/tiers/shared/skip-push.ts').then(m => m.skipPush()).then(r => console.log(JSON.stringify(r)))"
```

See `.cursor/commands/tiers/START_END_PLAYBOOK_STRUCTURE.md` (`pending_push_confirmation`).
