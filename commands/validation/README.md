# Validation/Verification Commands

This directory contains slash commands for validating workflow state and verifying completeness. These commands ensure workflow integrity across all tiers.

## Overview

Validation commands are organized into **atomic** (single-responsibility) and **composite** (multi-step workflows) operations. All commands follow the existing command pattern and can be called programmatically or via slash commands.

The validation abstraction uses `WorkflowCommandContext` for paths (no hardcoding), validates todo state, checks document existence, and verifies required sections.

## Quick Reference

See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for a one-page lookup table.

## Command Categories

### Atomic Commands

#### Validation Operations
- `validateWorkflow(params)` - Validate workflow state
- `validateWorkflowProgrammatic(params)` - Validate workflow (programmatic API)
- `verifyCompleteness(params)` - Verify required docs/entries exist

#### Audit Operations
- `auditPatterns()` - Check pattern consistency across tiers
- `auditDependencies()` - Check dependency usage
- `auditExports()` - Check export usage
- `auditSignatures()` - Check signature consistency
- `auditDocumentation()` - Check documentation completeness
- `auditRegistry()` - Check registry drift
- `auditFallback()` - Scan session-tier commands for defaults, silent fallbacks, and legacy/backwards compatibility patterns

### Composite Commands

- `validateComplete(tier, identifier?, featureName?)` - Complete validation workflow (validate + verify)
- `auditCommands()` - Complete commands workflow audit (runs all audit checks)

## Usage Examples

### Programmatic Usage

```typescript
import { validateWorkflow, verifyCompleteness, validateComplete } from './cursor/commands/validation';

// Validate workflow state
const validateOutput = await validateWorkflow({
  tier: 'session',
  identifier: '2.1',
  featureName: 'vue-migration'
});

// Verify completeness
const completenessOutput = await verifyCompleteness({
  tier: 'session',
  identifier: '2.1',
  featureName: 'vue-migration'
});

// Complete validation
const completeOutput = await validateComplete(
  'session',
  '2.1',
  'vue-migration'
);
```

### Slash Command Usage

Commands can be invoked via slash commands (if configured in your environment):
- `/validate-workflow session 2.1 vue-migration`
- `/validate-completeness session 2.1 vue-migration`
- `/validate-complete session 2.1 vue-migration`

## Validation Checks

### Workflow State Validation
- Todo exists and has valid status
- Documents exist (guide, log, handoff)
- Required sections present in handoff
- Todo consistency (parent/child status alignment)

### Completeness Verification
- All required documents exist
- All required sections present
- Todos exist for tier

### Command Audit Checks
- **Pattern Consistency** - Commands follow expected patterns across tiers
- **Dependencies** - Dependency usage is correct
- **Exports** - Export usage is consistent
- **Signatures** - Function signatures are consistent
- **Documentation** - Documentation is complete
- **Registry** - Registry doesn't drift from actual commands
- **Fallback** - Session-tier commands don't use defaults, silent fallbacks, or legacy/backwards compatibility patterns

## Validation Tiers

Commands support all workflow tiers:
- **Feature** (Tier 0) - Feature-level validation
- **Phase** (Tier 1) - Phase-level validation (requires identifier)
- **Session** (Tier 2) - Session-level validation (requires identifier in X.Y format)
- **Task** (Tier 3) - Task-level validation (requires identifier in X.Y.Z format)

## Architecture

### Utilities

Core validation logic uses utilities from `workflow-manager/utils/`:
- `getAllTodos()` - Get all todos for feature
- `getStatus()` - Get tier status
- `MarkdownUtils` - Section extraction
- `WorkflowCommandContext` - Path resolution and context

### Commands

Command wrappers are in `.cursor/commands/validation/`:
- `atomic/` - Single-responsibility commands
- `composite/` - Multi-step workflows

## Best Practices

1. **Validate before major transitions** (phase/session end)
2. **Verify completeness** before starting new tier
3. **Fix errors immediately** - don't proceed with validation errors
4. **Review warnings** - they may indicate issues
5. **Use complete validation** for comprehensive checks

## Related Documentation

- [Todo Commands](../todo/README.md) - Todo management integration
- [Status Commands](../status/README.md) - Status queries
- [Document Commands](../document/README.md) - Document operations
- [Workflow Manager](../../workflow-manager/README.md) - Core workflow utilities

