# Handoff Operations Quick Reference

## Commands

| Command | Function | Parameters | Description |
|---------|----------|------------|-------------|
| `/handoff-generate` | `generateHandoff` | `tier, identifier?, featureName?, nextIdentifier?, transitionNotes?` | Generate handoff from current state |
| `/handoff-review` | `reviewHandoff` | `tier, identifier?, featureName?` | Review handoff completeness |
| `/handoff-complete` | `handoffComplete` | `tier, identifier?, featureName?, nextIdentifier?, transitionNotes?` | Complete handoff workflow |

## Parameter Types

- **tier**: `'feature' | 'phase' | 'session' | 'task'`
- **identifier**: `string | undefined` (required for phase/session/task)
- **featureName**: `string` (default: 'vue-migration')
- **nextIdentifier**: `string | undefined` (next session/phase/task identifier)
- **transitionNotes**: `string | undefined` (transition context notes)

## Return Types

### CLI API (Formatted String)
```typescript
Promise<string> // Formatted markdown output
```

### Programmatic API (Structured Data)
```typescript
// reviewHandoffProgrammatic
Promise<{
  success: boolean;
  result?: {
    complete: boolean;
    missingSections: string[];
    recommendations: string[];
  };
  error?: string;
}>
```

## Examples

### Generate Handoff
```typescript
await generateHandoff({
  tier: 'session',
  identifier: '2.1',
  featureName: 'vue-migration',
  nextIdentifier: '2.2',
  transitionNotes: 'Completed component migration. All tests passing.'
});
```

### Review Handoff
```typescript
await reviewHandoff({
  tier: 'session',
  identifier: '2.1',
  featureName: 'vue-migration'
});
```

### Complete Handoff Workflow
```typescript
await handoffComplete(
  'session',
  '2.1',
  'vue-migration',
  '2.2',
  'Completed component migration'
);
```

## Required Sections

Handoffs should include:
- **Current Status** - Last completed, next item, git branch, timestamp
- **Next Action** - What to do next
- **Transition Context** - Where we left off, what you need to start

## Handoff Guidelines

- **Size**: 100-200 lines maximum
- **Focus**: Transition context, not detailed history
- **Move to guide/log**: Detailed notes, instructions, patterns
- **Keep minimal**: Only essential context for next tier

