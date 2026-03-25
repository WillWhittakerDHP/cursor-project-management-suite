# /audit-fix

**When to use:** After a tier start or end returns `audit_failed`, the user can choose "Fix audit with governance context (/audit-fix)". The agent should **read the context and fix directly**—do not output a prompt for the user to paste.

## Entry point

| Command    | Atomic file (from repo root)                              | Exports to invoke                                      |
|------------|-----------------------------------------------------------|--------------------------------------------------------|
| /audit-fix | `.cursor/commands/audit/atomic/audit-fix-prompt.ts`       | `getAuditFixContext` (agent), `auditFixPrompt` (paste) |

CLI (prompt string): `npx tsx .cursor/commands/audit/atomic/audit-fix-prompt.ts [report-path]`

## Agent instructions (direct execution)

When the user runs `/audit-fix` or chooses "Fix audit with governance context (/audit-fix)" after `audit_failed`:

1. **Call `getAuditFixContext({ reportPath, featureName?, tier?, identifier?, taskFiles? })`** from `.cursor/commands/audit/atomic/audit-fix-prompt.ts` with the report path from the failure message (and tier scope if known). You get `{ instruction, paths }` (repo-relative paths). The **`instruction` already embeds** full harness governance and architecture markdown (same builders as tier-start); **`paths`** is a deduped union of domain playbooks (from `classifyWorkProfile` + `architecture`), report-specific playbooks when `reportPath` is set, tier guide/planning when scope is passed, the report file, and `client/.audit-reports/audit-global-config.json`.
2. **Read `instruction` first** (it contains the injected blocks). **Then read `paths`** as needed for deep dives (playbooks, planning docs, report).
3. **Fix only what the report calls out:** address the findings listed in the audit report using the playbooks; fix code or config so the next audit run would pass. Reuse existing patterns, no duplicate logic. Do not run typecheck, regenerate audit JSON, or inspect raw audit files unless the report explicitly says the fix is to regenerate or fix the audit pipeline. Do not ask the user to paste anything—you already have the context from step 1–2. **Discretionary cleanups:** For **symptom-style** audits (e.g. import-graph, composables-logic, function-complexity, component-logic), prefer **module-boundary / cohesion** work first when not gate-blocked—see `.project-manager/AUDIT_FIX_CONTEXT.md` → **Governance remediation ladder** (steps 6–7). **Blocking** `audit_failed` still means: fix what the report lists now.
4. After fixes, the user can choose "Retry the command" to re-run the tier start/end.

**Do not** output a prompt for the user to paste. Inject context from `getAuditFixContext`, then fix. **Do not** run unrelated checks or regenerate audit outputs unless the report says to.

If no report path is available, call `getAuditFixContext({})`; you still get tier-appropriate playbook paths and embedded governance when defaults apply.

**Task tier:** When `tier === 'task'` with `featureName` and `identifier`, deliverable file paths are parsed from the task planning doc (unless you pass `taskFiles` explicitly) so `buildGovernanceContext` stays file-scoped.

## Invocation (programmatic)

**Direct execution (agent):** `getAuditFixContext(params)` → `{ instruction, paths }`. Same assembly as paste mode.

**Prompt string (CLI / manual paste):** `auditFixPrompt(params)` → string (`instruction` + `@` refs line built from the same `paths`).

From repo root (paste string):

```bash
npx tsx -e "import('./.cursor/commands/audit/atomic/audit-fix-prompt.ts').then(m => m.auditFixPrompt({ reportPath: 'client/.audit-reports/component-health-audit.md' })).then(s => console.log(s))"
```

From repo root (structured context for agents):

```bash
npx tsx -e "import('./.cursor/commands/audit/atomic/audit-fix-prompt.ts').then(m => m.getAuditFixContext({ reportPath: 'client/.audit-reports/component-health-audit.md' })).then(c => console.log(JSON.stringify(c, null, 2)))"
```

## Behavior

- **Single assembly:** `getAuditFixContext` and `auditFixPrompt` both call the same internal pipeline (`assembleAuditFixContext`).
- **Classification:** `classifyWorkProfile({ tier, action: 'end', reasonCode: 'audit_fix' })` drives domain intent; **`domainsForAuditFix`** = classifier domains ∪ `architecture` for both architecture excerpt depth and `getPlaybooksForGovernanceDomains`.
- **Path union:** Domain playbooks ∪ `getPlaybooksForAudit(reportPath)` when set ∪ tier guide/planning when `featureName` + `tier` + `identifier` ∪ report path ∪ `audit-global-config.json`, deduped.
- **Tier-end `audit_failed`:** Deliverables append the same harness-injected governance and architecture blocks (plus existing regex-targeted "Required reading" links). See `.project-manager/AUDIT_FIX_CONTEXT.md`.
