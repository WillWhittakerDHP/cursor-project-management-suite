# /audit-fix

**When to use:** After a tier start or end returns `audit_failed`, the user can choose "Fix audit with governance context (/audit-fix)". The agent should **read the context and fix directly**—do not output a prompt for the user to paste.

## Entry point

| Command     | Composite file (from repo root)                    | Export to invoke |
|-------------|----------------------------------------------------|-------------------|
| /audit-fix  | .cursor/commands/audit/composite/audit-fix.ts       | auditFixWithPaths (preferred), auditFix |

CLI (prompt string): `npx tsx .cursor/commands/audit/atomic/audit-fix-prompt.ts [report-path]`

## Agent instructions (direct execution)

When the user runs `/audit-fix` or chooses "Fix audit with governance context (/audit-fix)" after `audit_failed`:

1. **Call `auditFixWithPaths({ reportPath, featureName?, tier?, identifier? })`** from `.cursor/commands/audit/composite/audit-fix.ts` with the report path from the failure message (and tier/identifier if known). You get `{ instruction, paths }` (repo-relative paths).
2. **Read each path** (e.g. with your read/file tools) to load the governance playbooks, tier guide/planning, and audit report.
3. **Fix only what the report calls out:** address the findings listed in the audit report using the playbooks; fix code or config so the next audit run would pass. Reuse existing patterns, no duplicate logic. Do not run typecheck, regenerate audit JSON, or inspect raw audit files unless the report explicitly says the fix is to regenerate or fix the audit pipeline. Do not ask the user to paste anything—you already have the context from step 2.
4. After fixes, the user can choose "Retry the command" to re-run the tier start/end.

**Do not** output a prompt for the user to paste. Inject context by reading the paths and then fix. **Do not** run unrelated checks or regenerate audit outputs unless the report says to.

If no report path is available, call `auditFixWithPaths({})`; you still get tier-appropriate paths and can @ mention or read the report separately if needed.

## Invocation (programmatic)

**Direct execution (agent):** `auditFixWithPaths({ reportPath, tier?, identifier? })` → `{ instruction, paths }`. Read each path, then fix.

**Prompt string (CLI / manual paste):** `auditFix({ reportPath, ... })` → string. Use when a human wants to paste the line into chat.

From repo root (prompt string):

```bash
npx tsx -e "import('./.cursor/commands/audit/composite/audit-fix.ts').then(m => m.auditFix({ reportPath: 'client/.audit-reports/component-health-audit.md' })).then(s => console.log(s))"
```

## Behavior

- **auditFixWithPaths:** Returns `{ instruction, paths }`. Paths are repo-relative (governance playbooks from tier-context-config or AUDIT_FIX_CONTEXT; tier guide + planning only when explicit `featureName`, `tier`, and `identifier` are passed; plus report path). Agent reads them and fixes.
- **auditFix:** Returns a single string (instruction + @ refs line) for CLI or manual paste.
- Governance and tier context are tier/report-pertinent when tier or reportPath is passed (see `.project-manager/AUDIT_FIX_CONTEXT.md`).
