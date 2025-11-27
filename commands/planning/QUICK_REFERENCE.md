# Planning Commands Quick Reference

One-page lookup table for all planning commands.

## Core Planning

| Command | Function | Parameters | Description |
|---------|----------|-----------|-------------|
| `/planning-parse-plain-language` | `parsePlainLanguage` | `description, tier, feature?, phase?, sessionId?, taskId?` | Parse natural language → structured planning |
| `/planning-validate` | `validatePlanningCommand` | `planning, tier` | Validate planning completeness |
| `/planning-apply-template` | `applyTemplateCommand` | `tier, type, planning` | Apply planning template |

## Documentation & Reuse

| Command | Function | Parameters | Description |
|---------|----------|-----------|-------------|
| `/planning-check-documentation` | `checkDocumentation` | `type` | Check documentation (component\|transformer\|pattern\|migration) |
| `/planning-check-reuse` | `checkReuse` | `description` | Check for reusable patterns |
| `/planning-check-critical-points` | `checkCriticalPoints` | `tier, description, checks[]` | Force checks at critical junctions |

## Alternatives & Decisions

| Command | Function | Parameters | Description |
|---------|----------|-----------|-------------|
| `/planning-generate-alternatives` | `generateAlternativesCommand` | `planning, type` | Generate alternatives (architecture\|technology\|pattern) |
| `/planning-analyze-alternatives` | `analyzeAlternativesCommand` | `alternatives` | Compare and analyze alternatives |
| `/planning-create-decision-gate` | `createDecisionGateCommand` | `alternatives, required` | Create decision gate |
| `/planning-enforce-decision-gate` | `enforceDecisionGateCommand` | `gateId` | Enforce decision gate |

## Composite Commands

| Command | Function | Parameters | Description |
|---------|----------|-----------|-------------|
| `/planning-plan-with-checks` | `planWithChecks` | `description, tier, feature?, phase?, sessionId?, taskId?, docCheckType?` | Parse → docs check → reuse check → validate |
| `/planning-plan-with-alternatives` | `planWithAlternatives` | `description, tier, feature?, phase?, sessionId?, taskId?, alternativeType?` | Parse → alternatives → analyze → decision gate |
| `/planning-plan-complete` | `planComplete` | `description, tier, feature?, phase?, sessionId?, taskId?, options?` | Full planning workflow with all checks |
| `/planning-plan-tier` | `planTier` | `tier, identifier, description, feature?` | Tier-agnostic planning |

## Common Types

- **PlanningTier**: `feature` | `phase` | `session` | `task`
- **DocCheckType**: `component` | `transformer` | `pattern` | `migration`
- **AlternativeType**: `architecture` | `technology` | `pattern`
- **CriticalCheckType**: `documentation` | `reuse` | `alternatives` | `decision`

## Planning Options

```typescript
{
  docCheckType?: 'component' | 'transformer' | 'pattern' | 'migration';
  requireAlternatives?: boolean;
  alternativeType?: 'architecture' | 'technology' | 'pattern';
  requireDecision?: boolean;
  criticalChecks?: ('documentation' | 'reuse' | 'alternatives' | 'decision')[];
  requireCriticalChecks?: boolean;
}
```

## Import Example

```typescript
import {
  planWithChecks,
  planComplete,
  checkDocumentation,
  generateAlternativesCommand,
  planTier
} from './cursor/commands/planning';
```

## Common Usage Patterns

### Basic Planning with Checks
```typescript
await planWithChecks(
  'Implement user authentication',
  'phase',
  'vue-migration',
  1,
  undefined,
  undefined,
  'migration'
);
```

### Complete Planning with Alternatives
```typescript
await planComplete(
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
    requireDecision: true
  }
);
```

### Tier-Agnostic Planning
```typescript
await planTier('phase', '1', 'Implement authentication', 'vue-migration');
```

## Templates

- Architecture: `.cursor/commands/planning/templates/planning-architecture.md`
- Technology: `.cursor/commands/planning/templates/planning-technology.md`
- Pattern: `.cursor/commands/planning/templates/planning-pattern.md`
- Risk: `.cursor/commands/planning/templates/planning-risk.md`

