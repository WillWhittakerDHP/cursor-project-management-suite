# Checkpoint Commands Quick Reference

## Commands

| Command | Function | Parameters | Description |
|---------|----------|------------|-------------|
| `/checkpoint` | `checkpoint` | `tier, identifier?, featureName?, runQualityChecks?, notes?` | Unified checkpoint across all tiers |
| `/checkpoint-review` | `checkpointReview` | `tier, identifier?, featureName?` | Review checkpoint quality with quality checks |

## Parameter Types

- **tier**: `'feature' | 'phase' | 'session' | 'task'`
- **identifier**: `string | undefined` (required for phase/session/task)
- **featureName**: `string` (default: 'vue-migration')
- **runQualityChecks**: `boolean` (default: false)
- **notes**: `string | undefined` (optional checkpoint notes)

## Return Types

```typescript
Promise<string> // Formatted markdown output
```

## Examples

### Feature Checkpoint
```typescript
await checkpoint('feature', undefined, 'vue-migration');
```

### Phase Checkpoint
```typescript
await checkpoint('phase', '1', 'vue-migration');
```

### Session Checkpoint with Quality Checks
```typescript
await checkpoint('session', '2.1', 'vue-migration', true, 'Mid-session checkpoint');
```

### Task Checkpoint
```typescript
await checkpoint('task', '2.1.3', 'vue-migration', false, 'Completed component migration');
```

### Checkpoint Review
```typescript
await checkpointReview('phase', '1', 'vue-migration');
```

## Delegation

The unified checkpoint delegates to tier-specific commands:
- Feature → `featureCheckpoint()`
- Phase → `phaseCheckpoint()`
- Session → `sessionCheckpoint()`
- Task → `taskCheckpoint()`

## Quality Checks

When enabled, quality checks include:
- Linting (`/lint vue`)
- Type checking (`/type-check`)
- Optional tests (`/test vue`)

