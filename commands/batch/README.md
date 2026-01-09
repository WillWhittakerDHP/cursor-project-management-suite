# Batch Operations Commands

This directory contains slash commands for batch operations across multiple tiers/identifiers. These commands enable efficient bulk operations while handling partial failures gracefully.

## Overview

Batch commands are organized into **atomic** (core logic) and **composite** (specific batch operations) operations. All commands follow the existing command pattern and can be called programmatically or via slash commands.

The batch abstraction uses `WorkflowCommandContext` for paths (no hardcoding), calls existing single-tier commands in loops, and aggregates results from multiple operations.

## Quick Reference

See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for a one-page lookup table.

## Command Categories

### Atomic Commands

#### Core Batch Logic
- `executeBatchOperation(identifiers, operation)` - Core batch operation logic

### Composite Commands

- `batchUpdateLogs(params)` - Update multiple logs
- `batchGenerateHandoffs(params)` - Generate multiple handoffs

## Usage Examples

### Programmatic Usage

```typescript
import { batchUpdateLogs, batchGenerateHandoffs } from './cursor/commands/batch';

// Update multiple logs
const logsOutput = await batchUpdateLogs({
  tier: 'session',
  identifiers: ['2.1', '2.2', '2.3'],
  content: 'Batch update entry',
  featureName: 'vue-migration'
});

// Generate multiple handoffs
const handoffsOutput = await batchGenerateHandoffs({
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

### Slash Command Usage

Commands can be invoked via slash commands (if configured in your environment):
- `/batch-update-logs session 2.1 2.2 2.3 vue-migration`
- `/batch-generate-handoffs session 2.1 2.2 2.3 vue-migration`

## Batch Tiers

Commands support batch operations for:
- **Feature** (Tier 0) - Feature-level batch operations
- **Phase** (Tier 1) - Phase-level batch operations
- **Session** (Tier 2) - Session-level batch operations

## Error Handling

Batch operations handle partial failures gracefully:
- Continue processing remaining items if one fails
- Report success/failure for each item
- Provide summary of total/successful/failed operations

## Architecture

### Utilities

Core batch logic:
- `executeBatchOperation()` - Generic batch execution with error handling
- Calls existing single-tier commands in loops
- Aggregates results from multiple operations

### Commands

Command wrappers are in `.cursor/commands/batch/`:
- `atomic/` - Core batch operation logic
- `composite/` - Specific batch operations

## Best Practices

1. **Use batch operations** for repetitive tasks across multiple identifiers
2. **Review failures** - check which items failed and why
3. **Handle partial failures** - batch operations continue even if some items fail
4. **Use appropriate tier** - batch operations work best for phase/session tiers
5. **Provide context** - include next identifiers and transition notes when generating handoffs

## Related Documentation

- [Document Commands](../document/README.md) - Document operations
- [Handoff Commands](../handoff/README.md) - Handoff operations
- [Workflow Manager](../../workflow-manager/README.md) - Core workflow utilities

