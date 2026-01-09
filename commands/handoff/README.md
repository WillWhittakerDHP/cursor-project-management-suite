# Handoff Operations Commands

This directory contains slash commands for handoff operations in the workflow system. These commands standardize handoff generation and review across all tiers.

## Overview

Handoff commands are organized into **atomic** (single-responsibility) and **composite** (multi-step workflows) operations. All commands follow the existing command pattern and can be called programmatically or via slash commands.

The handoff abstraction uses `WorkflowCommandContext` for paths (no hardcoding), calls existing handoff commands, and uses templates from `TemplateManager`.

## Quick Reference

See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for a one-page lookup table.

## Command Categories

### Atomic Commands

#### Handoff Operations
- `generateHandoff(params)` - Generate handoff from current state
- `reviewHandoff(params)` - Review handoff completeness
- `reviewHandoffProgrammatic(params)` - Review handoff (programmatic API)

### Composite Commands

- `handoffComplete(tier, identifier?, featureName?, nextIdentifier?, transitionNotes?)` - Complete handoff workflow (generate + review)

## Usage Examples

### Programmatic Usage

```typescript
import { generateHandoff, reviewHandoff, handoffComplete } from './cursor/commands/handoff';

// Generate handoff
const handoffOutput = await generateHandoff({
  tier: 'session',
  identifier: '2.1',
  featureName: 'vue-migration',
  nextIdentifier: '2.2',
  transitionNotes: 'Completed component migration. All tests passing.'
});

// Review handoff
const reviewOutput = await reviewHandoff({
  tier: 'session',
  identifier: '2.1',
  featureName: 'vue-migration'
});

// Complete handoff workflow
const completeOutput = await handoffComplete(
  'session',
  '2.1',
  'vue-migration',
  '2.2',
  'Completed component migration'
);
```

### Slash Command Usage

Commands can be invoked via slash commands (if configured in your environment):
- `/handoff-generate session 2.1 vue-migration 2.2`
- `/handoff-review session 2.1 vue-migration`
- `/handoff-complete session 2.1 vue-migration 2.2`

## Integration with Existing Commands

Handoff commands integrate with:
- **Todo Commands**: `getAllTodosCommand()` for current status
- **Status Commands**: `getStatus()` for tier status
- **Document Operations**: `WorkflowCommandContext` for reading/writing handoffs
- **Existing Handoff Commands**: Uses `updateHandoff()` and `updateHandoffMinimal()` patterns

## Handoff Tiers

Commands support all workflow tiers:
- **Feature** (Tier 0) - Feature-level handoffs
- **Phase** (Tier 1) - Phase-level handoffs (requires identifier)
- **Session** (Tier 2) - Session-level handoffs (requires identifier in X.Y format)
- **Task** (Tier 3) - Task-level handoffs (requires identifier in X.Y.Z format)

## Handoff Structure

Handoffs should include:
- **Current Status** - Last completed item, next item, git branch, timestamp
- **Next Action** - What to do next
- **Transition Context** - Where we left off, what you need to start

Handoffs should be minimal (100-200 lines) and focus on transition context, not detailed history.

## Architecture

### Utilities

Core handoff logic uses utilities from `.cursor/commands/utils/`:
- `getAllTodos()` - Get all todos for feature
- `aggregateDetails()` - Aggregate progress from child todos
- `getStatus()` - Get tier status
- `MarkdownUtils` - Section extraction and manipulation
- `WorkflowCommandContext` - Path resolution and context
- `TemplateManager` - Handoff templates

### Commands

Command wrappers are in `.cursor/commands/handoff/`:
- `atomic/` - Single-responsibility commands
- `composite/` - Multi-step workflows

## Best Practices

1. **Generate handoff** after completing a tier
2. **Review handoff** before starting next tier
3. **Keep handoffs minimal** - move detailed notes to guide/log
4. **Include transition context** - where we left off, what's next
5. **Update timestamps** - keep handoffs current

## Related Documentation

- [Todo Commands](../todo/README.md) - Todo management integration
- [Status Commands](../status/README.md) - Status queries
- [Document Commands](../document/README.md) - Document operations
- [Project Manager](../../project-manager/PROJECT_MANAGER_HANDOFF.md) - Core workflow utilities
- Handoff templates in `.cursor/commands/tiers/*/templates/`

