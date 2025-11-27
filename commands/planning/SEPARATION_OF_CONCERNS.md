# Planning vs Todo: Separation of Concerns

**Purpose:** Document the separation of concerns between planning and todo systems, explaining responsibilities, interactions, and shared utilities.

## Overview

Planning and todo systems are related but serve different purposes:
- **Planning**: Structures and documents work before execution
- **Todos**: Track work items and their status during execution

Both systems interact but maintain clear boundaries through command-based interfaces.

## Responsibilities

### Planning System Responsibilities

**What Planning Does:**
- Parse natural language descriptions into structured planning data
- Extract objectives, scope, dependencies, risks, constraints
- Generate alternative strategies/approaches
- Enforce decision gates for major decisions
- Validate planning completeness
- Check documentation and patterns before planning
- Apply planning templates (architecture, technology, pattern, risk)

**What Planning Does NOT Do:**
- Track work status (that's todos)
- Manage citations (that's todos)
- Handle rollbacks (that's todos)
- Manage scope violations (that's todos)

### Todo System Responsibilities

**What Todos Do:**
- Track work items (features, phases, sessions, tasks)
- Manage work status (pending, in_progress, completed, etc.)
- Create citations for changes
- Handle rollbacks to previous states
- Manage scope and detect scope violations
- Track dependencies between todos
- Aggregate child todo details

**What Todos Do NOT Do:**
- Parse planning descriptions (planning does this)
- Generate alternatives (planning does this)
- Enforce decision gates (planning does this)
- Apply planning templates (planning does this)

## How They Interact

### Planning Creates Todos

Planning commands create todos as part of their workflow:

```typescript
// In plan-phase.ts
const todoResult = await createFromPlainLanguageProgrammatic(
  feature,
  `Phase ${phase}: ${description}`,
  { currentPhase: phaseNum }
);
```

**Key Points:**
- Planning uses todo **commands**, not utilities
- Planning uses **programmatic API** (structured data), not CLI API (formatted string)
- Planning doesn't know about todo internals
- Todo creation is a side effect of planning, not planning's primary purpose

### Shared Parsing Utilities

Both systems use shared parsing utilities from `natural-language-parser.ts`:

**Shared Functions:**
- `tokenize()` - Text tokenization
- `extractPriority()` - Priority extraction
- `extractTags()` - Tag extraction
- `extractDependencies()` - Dependency extraction
- `hasExplicitField()` / `extractExplicitField()` - Explicit field extraction

**Why Shared:**
- Eliminates code duplication
- Ensures consistent parsing behavior
- Single source of truth for common patterns
- Easier maintenance

**Why Separate Parsers:**
- Different domain models (planning vs todo)
- Different extraction needs (objectives/scope vs title/tier/status)
- Different validation rules
- Different output structures

## Architecture Boundaries

### Command Layer Abstraction

```
┌─────────────────┐         ┌─────────────────┐
│ Planning        │         │ Todo            │
│ Commands        │────────▶│ Commands        │
└─────────────────┘         └─────────────────┘
         │                           │
         │                           │
         ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│ Planning        │         │ Todo             │
│ Utilities       │         │ Utilities        │
└─────────────────┘         └─────────────────┘
         │                           │
         └───────────┬───────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │ Shared Parsing Utilities  │
         │ (natural-language-parser)  │
         └───────────────────────────┘
```

### Rules

1. **Planning → Todo**: Planning can call todo commands (programmatic API)
2. **Todo → Planning**: Todos should NOT call planning commands (planning is pre-execution)
3. **Shared Utilities**: Both can use shared parsing utilities
4. **No Direct Utility Calls**: Planning should not call todo utilities directly
5. **Command Layer**: All cross-system communication goes through command layer

## Data Flow

### Planning Creates Todo Flow

```
1. User runs planning command (e.g., /plan-phase)
   ↓
2. Planning command parses input (planning-parser.ts)
   ↓
3. Planning command validates planning (planning-validation.ts)
   ↓
4. Planning command creates todo (todo command programmatic API)
   ↓
5. Todo command parses input (todo-plain-language.ts)
   ↓
6. Todo command validates todo (todo validation)
   ↓
7. Todo command saves todo (todo-io.ts)
   ↓
8. Planning command returns planning output + todo creation status
```

### Shared Parsing Flow

```
Both systems use shared utilities:

Planning Parser:
  Input → tokenize() → extractPriority() → extractTags() → ...
  → Planning-specific extraction (objectives, scope, risks)
  → PlanningOutput

Todo Parser:
  Input → tokenize() → extractPriority() → extractTags() → ...
  → Todo-specific extraction (title, tier, status)
  → ParsedTodoComponents
```

## Examples

### Correct: Planning Uses Todo Command

```typescript
// ✅ CORRECT: Planning uses todo command
import { createFromPlainLanguageProgrammatic } from '../todo/composite/create-from-plain-language';

const todoResult = await createFromPlainLanguageProgrammatic(feature, input, context);
```

### Incorrect: Planning Uses Todo Utility

```typescript
// ❌ WRONG: Planning bypasses command layer
import { createTodoFromPlainLanguage } from '../../utils/todo-plain-language';

const todoResult = await createTodoFromPlainLanguage(feature, input, context);
```

### Correct: Both Use Shared Utilities

```typescript
// ✅ CORRECT: Both use shared utilities
import { tokenize, extractPriority } from './natural-language-parser';

// In planning-parser.ts
const tokens = tokenize(input.description);
const priority = extractPriority(tokens);

// In todo-plain-language.ts
const tokens = tokenize(input);
const priority = extractPriority(tokens);
```

## Benefits of Separation

1. **Maintainability**: Changes to one system don't break the other
2. **Testability**: Each system can be tested independently
3. **Clarity**: Clear boundaries make code easier to understand
4. **Flexibility**: Systems can evolve independently
5. **Reusability**: Shared utilities eliminate duplication

## Migration Notes

### Historical Context

Previously, planning commands called todo utilities directly:
- ❌ `createTodoFromPlainLanguage()` from `todo-plain-language.ts`
- ❌ Bypassed command layer abstraction
- ❌ Mixed concerns

Now, planning commands use todo commands:
- ✅ `createFromPlainLanguageProgrammatic()` from `create-from-plain-language.ts`
- ✅ Proper abstraction layer
- ✅ Clear separation of concerns

### Shared Utilities Migration

Previously, both parsers had duplicate logic:
- ❌ Duplicate `tokenize()` functions
- ❌ Duplicate `extractPriority()` functions
- ❌ Duplicate `extractTags()` functions
- ❌ Duplicate `extractDependencies()` functions

Now, both parsers use shared utilities:
- ✅ Single `tokenize()` in `natural-language-parser.ts`
- ✅ Single `extractPriority()` in `natural-language-parser.ts`
- ✅ Single `extractTags()` in `natural-language-parser.ts`
- ✅ Single `extractDependencies()` in `natural-language-parser.ts`

## Related Documentation

- [Planning README](./README.md) - Planning system overview
- [Todo README](../todo/README.md) - Todo system overview
- [Natural Language Parser](../../project-manager/utils/natural-language-parser.ts) - Shared parsing utilities

