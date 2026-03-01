# /accepted-proceed

**Chat-first flow:** After a session/phase/feature start has created a planning doc and you've discussed the plan in chat, run this command to run the next pass (pass 2: plan deliverables, or pass 3: execute — branch, docs, audit, cascade).

## Entry point

| Command           | Composite file (from repo root)                                    | Export to invoke   |
|-------------------|--------------------------------------------------------------------|--------------------|
| /accepted-proceed | .cursor/commands/tiers/shared/accepted-proceed.ts                  | acceptedProceed    |

## Invocation

From repo root:

```bash
npx tsx -e "import('./.cursor/commands/tiers/shared/accepted-proceed.ts').then(m => m.acceptedProceed()).then(r => console.log(JSON.stringify(r)))"
```

Or from Agent: call `acceptedProceed()` from the module above and capture the return value.

## Behavior

1. Reads `.cursor/commands/.tier-start-pending.json` (written by session/phase/feature start when it returns `context_gathering` or `plan_mode`).
2. If no pending state: returns a result with `controlPlaneDecision.message` explaining to run a tier start first.
3. If pending pass 1: reinvokes the tier start with `options: { contextGatheringComplete: true, mode: 'plan' }` (pass 2).
4. If pending pass 2: reinvokes with `options: { mode: 'execute' }` (pass 3).
5. On `plan_mode` result: updates pending state to pass 2 so the next `/accepted-proceed` runs execute.
6. On `start_ok` result: deletes pending state.

## Agent instructions

- Present `result.controlPlaneDecision.message` to the user.
- Use `result.outcome.nextAction` and `result.controlPlaneDecision` for routing (cascade, AskQuestion, etc.) per START_END_PLAYBOOK_STRUCTURE.md.
- Do not use AskQuestion for "satisfied / ready to begin" when using this flow; the user signals by running this command.
