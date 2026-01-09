# Status/Query Operations Commands

This directory contains slash commands for status and query operations in the workflow system. These commands extend the existing status command with detailed queries and cross-tier status capabilities.

## Overview

Status commands are organized into **atomic** (single-responsibility) and **composite** (multi-step workflows) operations. All commands follow the existing command pattern and can be called programmatically or via slash commands.

The status abstraction uses `WorkflowCommandContext` for paths (no hardcoding), calls existing todo commands, and aggregates information from multiple sources.

## Quick Reference

See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for a one-page lookup table.

## Command Categories

### Atomic Commands

#### Status Operations
- `getStatus(params)` - Get status for specific tier
- `queryChanges(params)` - Query changes for tier
- `queryChangesProgrammatic(params)` - Query changes (programmatic API)
- `queryCitationsForTier(params)` - Query citations for tier

### Composite Commands

- `statusDetailed(params)` - Detailed status with todos, citations, changes
- `statusCrossTier(params)` - Status across multiple tiers

## Usage Examples

### Programmatic Usage

```typescript
import { getStatus, queryChanges, statusDetailed } from './cursor/commands/status';

// Get status for a tier
const statusInfo = await getStatus({
  tier: 'session',
  identifier: '2.1',
  featureName: 'vue-migration'
});

// Query changes
const changesOutput = await queryChanges({
  tier: 'phase',
  identifier: '1',
  featureName: 'vue-migration',
  filters: {
    since: '2025-01-01'
  }
});

// Get detailed status
const detailedStatus = await statusDetailed({
  tier: 'session',
  identifier: '2.1',
  featureName: 'vue-migration',
  includeChanges: true,
  includeCitations: true
});
```

### Slash Command Usage

Commands can be invoked via slash commands (if configured in your environment):
- `/status-detailed session 2.1 vue-migration`
- `/status-query-changes phase 1 vue-migration`
- `/status-query-citations session 2.1 vue-migration`

## Integration with Existing Commands

Status commands integrate with:
- **Todo Commands**: `getAllTodosCommand()` for todo status
- **Change Log**: `readChangeLog()` for change history
- **Citations**: `queryCitations()` for citation queries
- **Existing Status**: Extends `status()` command

## Status Tiers

Commands support all workflow tiers:
- **Feature** (Tier 0) - Feature-level status
- **Phase** (Tier 1) - Phase-level status (requires identifier)
- **Session** (Tier 2) - Session-level status (requires identifier in X.Y format)
- **Task** (Tier 3) - Task-level status (requires identifier in X.Y.Z format)

## Architecture

### Utilities

Core status logic uses utilities from `workflow-manager/utils/`:
- `getAllTodos()` - Get all todos for feature
- `aggregateDetails()` - Aggregate progress from child todos
- `readChangeLog()` - Read change log entries
- `queryCitations()` - Query citations
- `WorkflowCommandContext` - Path resolution and context

### Commands

Command wrappers are in `.cursor/commands/status/`:
- `atomic/` - Single-responsibility commands
- `composite/` - Multi-step workflows

## Best Practices

1. **Use detailed status** for comprehensive overview
2. **Query changes** to track history
3. **Query citations** to see important references
4. **Use cross-tier status** for multi-tier overview
5. **Filter changes** by date or type for focused queries

## Related Documentation

- [Todo Commands](../todo/README.md) - Todo management integration
- [Document Commands](../document/README.md) - Document operations
- [Workflow Manager](../../workflow-manager/README.md) - Core workflow utilities
- Existing status command in `utils/status.ts`

