# /audit-fix

**When to use:** After a tier start or end returns `audit_failed`, the user can choose "Fix audit with governance context (/audit-fix)". Run this command (with the report path from the message) to generate a prompt that includes @ refs to the governance playbooks, **tier-appropriate context** (current tier's guide + planning doc from `.tier-scope`), and the audit report. The instruction directs the agent to **read the attached context first** and **reuse existing patterns** to avoid duplication and maintain governance. Paste the output into chat.

## Entry point

| Command     | Composite file (from repo root)                    | Export to invoke |
|-------------|----------------------------------------------------|-------------------|
| /audit-fix  | .cursor/commands/audit/composite/audit-fix.ts       | auditFix          |

CLI alternative (same output): `npx tsx .cursor/commands/audit/atomic/audit-fix-prompt.ts [report-path]`

## Invocation

**With report path (from tier-end or start failure message):**

From repo root:

```bash
npx tsx -e "import('./.cursor/commands/audit/composite/audit-fix.ts').then(m => m.auditFix({ reportPath: 'client/.audit-reports/component-health-audit.md' })).then(s => console.log(s))"
```

Or CLI:

```bash
npx tsx .cursor/commands/audit/atomic/audit-fix-prompt.ts client/.audit-reports/component-health-audit.md
```

**Without report path (governance refs only):**

```bash
npx tsx .cursor/commands/audit/atomic/audit-fix-prompt.ts
```

From Agent: call `auditFix({ reportPath })` from `.cursor/commands/audit/composite/audit-fix.ts` with the report path from the audit_failed message (if any). Capture the returned string and paste it into chat (or present it so the user can paste).

## Behavior

1. Loads the copy-paste block of @ refs from `.project-manager/AUDIT_FIX_CONTEXT.md` (governance playbooks + audit-global-config.json).
2. Reads `.project-manager/.tier-scope` and adds **tier-appropriate @ refs** (current tier's guide + planning doc) so the agent has the right scope.
3. Builds a prompt: instruction line (read context first, fix per playbooks, reuse patterns, no duplication) + blank line + @ refs line (governance + tier context + optional report path).
4. Returns the prompt string. Output is intended to be pasted into chat so Cursor attaches the referenced files.

## Agent instructions

- When the user runs `/audit-fix` or chooses "Fix audit with governance context (/audit-fix)" after `audit_failed`, invoke `auditFix({ reportPath, featureName?, tier?, identifier? })` with the report path from the failure message. If you have the current tier (e.g. from the command that failed), pass `tier` and `identifier` so tier-appropriate context is included; otherwise the command reads `.tier-scope` and injects it automatically.
- Paste the returned prompt into chat so the governance docs, tier context (guide + planning doc), and report are attached. **Read the attached context before making changes.** Fix findings per the playbooks' thresholds and decision trees; reuse existing patterns and do not duplicate logic. After fixes, the user can choose "Retry the command" to re-run the tier start/end.
- If no report path is available, call `auditFix({})` to get governance + tier context; the user can @ mention the report manually.
