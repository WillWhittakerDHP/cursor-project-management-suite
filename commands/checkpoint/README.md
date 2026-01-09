# Checkpoint Commands

This directory contains slash commands for unified checkpoint operations in the workflow system. These commands consolidate tier-specific checkpoint operations into a unified interface while delegating to existing tier-specific commands for full functionality.

## Overview

Checkpoint commands are organized into **atomic** (core logic) and **composite** (unified interface) operations. All commands follow the existing command pattern and can be called programmatically or via slash commands.

The checkpoint abstraction uses `WorkflowCommandContext` for paths (no hardcoding), calls existing tier-specific checkpoint commands, and aggregates status from todo commands.

## Quick Reference

See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for a one-page lookup table.

## Command Categories

### Atomic Commands

#### Core Checkpoint Logic
- `createCheckpoint(params)` - Core checkpoint creation logic (used by composite command)

### Composite Commands

- `checkpoint(tier, identifier?, featureName?, runQualityChecks?, notes?)` - Unified checkpoint across all tiers
- `checkpointReview(tier, identifier?, featureName?)` - Review checkpoint quality with quality checks

## Usage Examples

### Programmatic Usage

```typescript
import { checkpoint, checkpointReview } from './cursor/commands/checkpoint';

// Create checkpoint
const checkpointOutput = await checkpoint(
  'session',
  '2.1',
  'vue-migration',
  false, // runQualityChecks
  'Mid-session checkpoint after completing task 2.1.3'
);

// Review checkpoint with quality checks
const reviewOutput = await checkpointReview(
  'phase',
  '1',
  'vue-migration'
);
```

### Slash Command Usage

Commands can be invoked via slash commands (if configured in your environment):
- `/checkpoint feature vue-migration`
- `/checkpoint phase 1 vue-migration`
- `/checkpoint session 2.1 vue-migration`
- `/checkpoint task 2.1.3 vue-migration`
- `/checkpoint-review session 2.1 vue-migration`

## Integration with Existing Commands

Checkpoint commands delegate to existing tier-specific commands:
- **Feature**: Calls `featureCheckpoint()` from `feature/atomic/feature-checkpoint.ts`
- **Phase**: Calls `phaseCheckpoint()` from `phase/composite/phase-checkpoint.ts`
- **Session**: Calls `sessionCheckpoint()` from `session/composite/session-checkpoint.ts`
- **Task**: Calls `taskCheckpoint()` from `task/atomic/checkpoint.ts`

## Checkpoint Tiers

Commands support all workflow tiers:
- **Feature** (Tier 0) - Feature-level checkpoints
- **Phase** (Tier 1) - Phase-level checkpoints (requires identifier)
- **Session** (Tier 2) - Session-level checkpoints (requires identifier in X.Y format)
- **Task** (Tier 3) - Task-level checkpoints (requires identifier in X.Y.Z format)

## Quality Checks

When `runQualityChecks: true` is set, checkpoint commands will:
1. Run linting (`/lint vue`)
2. Run type checking (`/type-check`)
3. Optionally run tests (`/test vue`) if requested

Quality check results are included in checkpoint output.

## Architecture

### Utilities

Core checkpoint logic uses utilities from `.cursor/commands/utils/`:
- `getAllTodos()` - Get all todos for feature
- `aggregateDetails()` - Aggregate progress from child todos
- `WorkflowCommandContext` - Path resolution and context
- `verify()` - Quality check utilities

### Commands

Command wrappers are in `.cursor/commands/checkpoint/`:
- `atomic/` - Core checkpoint logic
- `composite/` - Unified interface delegating to tier-specific commands

## Best Practices

1. **Use unified checkpoint** for consistent interface across tiers
2. **Use tier-specific commands** when you need tier-specific functionality
3. **Run quality checks** before major checkpoints (phase/session end)
4. **Include notes** for context and future reference
5. **Review checkpoints** regularly to ensure quality

## Related Documentation

- [Todo Commands](../todo/README.md) - Todo management integration
- [Planning Commands](../planning/README.md) - Planning integration
- [Project Manager](../../project-manager/PROJECT_MANAGER_HANDOFF.md) - Core workflow utilities
- Tier-specific checkpoint commands in respective tier directories

