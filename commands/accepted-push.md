---
description: Confirm git push after tier-end pending_push_confirmation
---

**User runs this in Cursor** when tier-end completed with push pending. Push runs through `git-manager` (`gitPush`). The agent does not invoke it from the shell as the primary workflow.

From **repo root**:

```bash
npx tsx -e "import('./.cursor/commands/tiers/shared/accepted-push.ts').then(m => m.acceptedPush()).then(r => console.log(JSON.stringify(r)))"
```

See `.cursor/commands/tiers/START_END_PLAYBOOK_STRUCTURE.md` (`pending_push_confirmation`).
