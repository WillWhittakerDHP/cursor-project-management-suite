# Batch Operations Quick Reference

## Commands

| Command | Function | Parameters | Description |
|---------|----------|------------|-------------|
| `/batch-update-logs` | `batchUpdateLogs` | `tier, identifiers[], content, featureName?` | Update multiple logs |
| `/batch-generate-handoffs` | `batchGenerateHandoffs` | `tier, identifiers[], featureName?, nextIdentifiers?, transitionNotes?` | Generate multiple handoffs |

## Parameter Types

- **tier**: `'feature' | 'phase' | 'session'`
- **identifiers**: `string[]` (array of identifiers)
- **content**: `string` (content to append to logs)
- **featureName**: `string` (default: 'vue-migration')
- **nextIdentifiers**: `Record<string, string>` (map of identifier to next identifier)
- **transitionNotes**: `Record<string, string>` (map of identifier to transition notes)

## Return Types

```typescript
Promise<string> // Formatted markdown output with batch results
```

## Examples

### Batch Update Logs
```typescript
await batchUpdateLogs({
  tier: 'session',
  identifiers: ['2.1', '2.2', '2.3'],
  content: 'Batch update entry',
  featureName: 'vue-migration'
});
```

### Batch Generate Handoffs
```typescript
await batchGenerateHandoffs({
  tier: 'session',
  identifiers: ['2.1', '2.2', '2.3'],
  featureName: 'vue-migration',
  nextIdentifiers: {
    '2.1': '2.2',
    '2.2': '2.3',
    '2.3': '2.4'
  },
  transitionNotes: {
    '2.1': 'Completed component migration',
    '2.2': 'Completed API integration'
  }
});
```

## Batch Results

Batch operations return:
- **Total** - Number of items processed
- **Successful** - Number of successful operations
- **Failed** - Number of failed operations
- **Per-item results** - Success/failure for each identifier

## Error Handling

- Batch operations continue even if some items fail
- Each item's success/failure is reported separately
- Summary shows total/successful/failed counts

## Common Patterns

### Batch Update All Phase Logs
```typescript
await batchUpdateLogs({
  tier: 'phase',
  identifiers: ['1', '2', '3'],
  content: 'Phase checkpoint update',
  featureName: 'vue-migration'
});
```

### Batch Generate Session Handoffs
```typescript
await batchGenerateHandoffs({
  tier: 'session',
  identifiers: ['2.1', '2.2', '2.3'],
  featureName: 'vue-migration',
  nextIdentifiers: {
    '2.1': '2.2',
    '2.2': '2.3'
  }
});
```

