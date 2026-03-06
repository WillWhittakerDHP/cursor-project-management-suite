# /accepted-code

**Chat-first flow:** After a task-start has shown the task design (plan_mode / "Begin Coding"), discuss the design in chat, then run this command to start coding (reinvoke task start with execute).

## Entry point

| Command        | Composite file (from repo root)                                | Export to invoke |
|----------------|-----------------------------------------------------------------|------------------|
| /accepted-code | .cursor/commands/tiers/shared/accepted-code.ts                  | acceptedCode     |

## Invocation

From repo root:

```bash
npx tsx -e "import('./.cursor/commands/tiers/shared/accepted-code.ts').then(m => m.acceptedCode()).then(r => console.log(JSON.stringify(r)))"
```

Or from Agent: call `acceptedCode()` from the module above and capture the return value.

## Behavior

1. Reads `.cursor/commands/.task-start-pending.json` (written by task-start when it returns `plan_mode`).
2. If no pending state: returns a result with `controlPlaneDecision.message` explaining to run task-start first.
3. Reinvokes task start with `options: { mode: 'execute' }`.
4. Deletes pending state after the call.

## Agent instructions

- Present `result.controlPlaneDecision.message` to the user.
- Use `result.outcome` and `result.controlPlaneDecision` for routing per START_END_PLAYBOOK_STRUCTURE.md (cascade, etc.).
- The user signals "Begin Coding" by running this command; present the result message and route per playbook.
