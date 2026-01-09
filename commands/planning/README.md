# Planning Commands

This directory contains slash commands for planning functionality in the workflow system. These commands abstract planning concerns from workflow execution, enable reusable planning logic across all tiers, and provide enhanced features like forced alternatives, decision gates, and critical checks.

## Overview

Planning commands are organized into **atomic** (single-responsibility) and **composite** (multi-step workflows) operations. All commands follow the existing command pattern and can be called programmatically or via slash commands.

The planning abstraction mirrors the successful todo abstraction pattern for consistency and maintainability.

## Quick Reference

See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for a one-page lookup table.

## Command Categories

### Atomic Commands

#### Core Planning Operations
- `parsePlainLanguage(description, tier, feature?, phase?, sessionId?, taskId?)` - Parse natural language → structured planning
- `validatePlanningCommand(planning, tier)` - Validate planning completeness
- `applyTemplateCommand(tier, type, planning)` - Apply planning templates

#### Documentation and Reuse Checks
- `checkDocumentation(type)` - Check documentation before planning
- `checkReuse(description)` - Check for reusable patterns before planning
- `checkCriticalPoints(tier, description, checks)` - Force checks at critical junctions

#### Alternatives and Decision Gates
- `generateAlternativesCommand(planning, type)` - Generate alternative strategies/approaches
- `analyzeAlternativesCommand(alternatives)` - Compare and analyze alternatives
- `createDecisionGateCommand(alternatives, required)` - Create decision gate
- `enforceDecisionGateCommand(gateId)` - Enforce decision gate (cannot proceed without decision)

### Composite Commands

- `planWithChecks(description, tier, feature?, phase?, sessionId?, taskId?, docCheckType?)` - Parse → docs check → reuse check → validate
- `planWithAlternatives(description, tier, feature?, phase?, sessionId?, taskId?, alternativeType?)` - Parse → generate alternatives → analyze → decision gate
- `planComplete(description, tier, feature?, phase?, sessionId?, taskId?, options?)` - Full planning workflow with all checks and features
- `planTier(tier, identifier, description, feature?)` - Tier-agnostic planning (feature/phase/session/task)

## Usage Examples

### Programmatic Usage

```typescript
import { 
  planWithChecks, 
  planComplete, 
  checkDocumentation,
  generateAlternativesCommand 
} from './cursor/commands/planning';

// Plan with checks
const planningOutput = await planWithChecks(
  'Implement user authentication',
  'phase',
  'vue-migration',
  1,
  undefined,
  undefined,
  'migration'
);

// Complete planning workflow
const completePlanning = await planComplete(
  'Refactor state management',
  'session',
  'vue-migration',
  2,
  '2.1',
  undefined,
  {
    docCheckType: 'component',
    requireAlternatives: true,
    alternativeType: 'pattern',
    requireDecision: true,
    criticalChecks: ['documentation', 'reuse']
  }
);

// Check documentation
const docCheck = await checkDocumentation('component');

// Generate alternatives
const alternatives = await generateAlternativesCommand(
  planningData,
  'architecture'
);
```

### Slash Command Usage

Commands can be invoked via slash commands (if configured in your environment):
- `/planning-plan-with-checks "Implement feature X" phase vue-migration 1`
- `/planning-check-documentation component`
- `/planning-generate-alternatives architecture`
- `/planning-plan-complete "Refactor state" session vue-migration 2 2.1`

## Integration with Workflow Commands

Planning commands are designed to be called from tier-specific plan commands:

```typescript
import { planWithChecks } from './cursor/commands/planning';

// In plan-phase.ts
export async function planPhase(phase: string, description?: string): Promise<string> {
  if (description) {
    const planningOutput = await planWithChecks(
      description,
      'phase',
      featureName,
      parseInt(phase),
      undefined,
      undefined,
      'migration'
    );
    // Use planning output...
  }
}
```

## Planning Tiers

Planning commands support all workflow tiers:

- **Feature** (Tier 0) - Highest level planning
- **Phase** (Tier 1) - High-level planning
- **Session** (Tier 2) - Medium-level planning
- **Task** (Tier 3) - Low-level planning

## Planning Templates

Planning templates are available for different decision types:

- **Architecture** - `.cursor/commands/planning/templates/planning-architecture.md`
- **Technology** - `.cursor/commands/planning/templates/planning-technology.md`
- **Pattern** - `.cursor/commands/planning/templates/planning-pattern.md`
- **Risk** - `.cursor/commands/planning/templates/planning-risk.md`

Templates can be applied using `applyTemplateCommand()`.

## Enhanced Features

### Forced Alternatives

When `requireAlternatives: true` is set, the planning system will:
1. Generate alternative strategies/approaches
2. Analyze pros/cons of each alternative
3. Require explicit decision before proceeding

### Decision Gates

Decision gates enforce explicit decisions:
- Cannot proceed without selecting an alternative
- Tracks decisions and rationale
- Stores rejected alternatives for future reference

### Critical Checks

Critical checks force documentation and best practice reviews at key points:
- Prevents progression without checks
- Documents check results
- Configurable check types

## Architecture

### Utilities

Core planning logic is in `.cursor/commands/utils/`:
- `planning-types.ts` - Type definitions
- `planning-parser.ts` - Natural language parsing
- `alternatives-generator.ts` - Alternative generation and analysis
- `decision-gate.ts` - Decision gate enforcement
- `planning-validation.ts` - Planning completeness validation

### Commands

Command wrappers are in `.cursor/commands/planning/`:
- `atomic/` - Single-responsibility commands
- `composite/` - Multi-step workflows

## Migration from Old Utils

Old utility functions have been migrated to planning commands:

**Deprecated:**
- `checkDocs()` from `.cursor/commands/utils/check-docs.ts`
- `checkReuse()` from `.cursor/commands/utils/check-reuse.ts`

**New:**
- `checkDocumentation()` from `.cursor/commands/planning/atomic/check-documentation.ts`
- `checkReuse()` from `.cursor/commands/planning/atomic/check-reuse.ts`
- `planWithChecks()` for comprehensive planning

Old functions are kept for backward compatibility but marked as deprecated.

## Best Practices

1. **Use composite commands** for common workflows (`planWithChecks`, `planComplete`)
2. **Use atomic commands** for specific operations (documentation checks, alternatives)
3. **Apply templates** for structured decision documentation
4. **Require alternatives** for major architectural decisions
5. **Enforce decision gates** when multiple valid options exist
6. **Run critical checks** at key junctions

## Integration with Todo System

Planning commands create todos as part of their workflow. Planning should use todo **commands**, not utilities, to maintain proper abstraction layers.

### Programmatic API

When planning commands need to create todos, they use the programmatic API:

```typescript
import { createFromPlainLanguageProgrammatic } from '../todo/composite/create-from-plain-language';

// In planning command
const todoResult = await createFromPlainLanguageProgrammatic(
  feature,
  `Phase ${phase}: ${description}`,
  { currentPhase: phaseNum }
);

if (todoResult.success && todoResult.todo) {
  // Use todo data
} else {
  // Handle errors
}
```

### Why Use Commands, Not Utilities?

- **Abstraction**: Planning shouldn't know about todo internals
- **Consistency**: All todo operations go through command layer
- **Tracking**: Easier to track todo creation from planning
- **Evolution**: Todo commands can evolve without breaking planning

### Shared Parsing Utilities

Both planning and todo systems use shared parsing utilities from `natural-language-parser.ts`:
- `tokenize()` - Text tokenization
- `extractPriority()` - Priority extraction
- `extractTags()` - Tag extraction
- `extractDependencies()` - Dependency extraction
- `hasExplicitField()` / `extractExplicitField()` - Explicit field extraction

This ensures consistent parsing behavior across both systems while maintaining separation of concerns.

## Implementation Status

✅ **COMPLETE** - All planning abstraction phases completed. See [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) for detailed status (temporary file, will be consolidated).

## Related Documentation

- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - One-page command lookup
- [Todo Commands](../todo/README.md) - Similar abstraction pattern
- [Separation of Concerns](./SEPARATION_OF_CONCERNS.md) - Detailed separation documentation
- [Project Manager](../../project-manager/PROJECT_MANAGER_HANDOFF.md) - Core workflow utilities
- Planning templates in `.cursor/commands/planning/templates/planning-*.md`

