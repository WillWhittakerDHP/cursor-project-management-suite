# Status/Query Operations Quick Reference

## Commands

| Command | Function | Parameters | Description |
|---------|----------|------------|-------------|
| `/status-detailed` | `statusDetailed` | `tier, identifier?, featureName?, includeChanges?, includeCitations?` | Detailed status with todos, citations, changes |
| `/status-query-changes` | `queryChanges` | `tier, identifier?, featureName?, filters?` | Query changes for tier |
| `/status-query-citations` | `queryCitationsForTier` | `tier, identifier?, featureName?, filters?` | Query citations for tier |
| `/status-cross-tier` | `statusCrossTier` | `tiers[], featureName?` | Status across multiple tiers |

## Parameter Types

- **tier**: `'feature' | 'phase' | 'session' | 'task'`
- **identifier**: `string | undefined` (required for phase/session/task)
- **featureName**: `string` (default: 'vue-migration')
- **includeChanges**: `boolean` (default: true)
- **includeCitations**: `boolean` (default: true)
- **filters**: Object with optional `todoId`, `changeType`, `since` (ISO date)

## Return Types

### CLI API (Formatted String)
```typescript
Promise<string> // Formatted markdown output
```

### Programmatic API (Structured Data)
```typescript
// getStatus
Promise<StatusInfo | null>

// queryChangesProgrammatic
Promise<{
  success: boolean;
  changes?: ChangeLogEntry[];
  error?: string;
}>
```

## Examples

### Detailed Status
```typescript
await statusDetailed({
  tier: 'session',
  identifier: '2.1',
  featureName: 'vue-migration'
});
```

### Query Changes
```typescript
await queryChanges({
  tier: 'phase',
  identifier: '1',
  featureName: 'vue-migration',
  filters: {
    since: '2025-01-01',
    changeType: 'todo_status_changed'
  }
});
```

### Query Citations
```typescript
await queryCitationsForTier({
  tier: 'session',
  identifier: '2.1',
  featureName: 'vue-migration',
  filters: {
    unreviewed: true,
    priority: 'high'
  }
});
```

### Cross-Tier Status
```typescript
await statusCrossTier({
  tiers: [
    { tier: 'feature' },
    { tier: 'phase', identifier: '1' },
    { tier: 'session', identifier: '2.1' }
  ],
  featureName: 'vue-migration'
});
```

## Common Patterns

### Get Status with Progress
```typescript
const statusInfo = await getStatus({
  tier: 'phase',
  identifier: '1',
  featureName: 'vue-migration'
});

if (statusInfo?.progress) {
  console.log(`Progress: ${statusInfo.progress.completed}/${statusInfo.progress.total}`);
}
```

### Query Recent Changes
```typescript
const changes = await queryChanges({
  tier: 'session',
  identifier: '2.1',
  featureName: 'vue-migration',
  filters: {
    since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  }
});
```

