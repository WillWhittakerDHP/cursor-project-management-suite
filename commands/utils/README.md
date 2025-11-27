# Todo Management System - Implementation Utilities

This directory contains the implementation of the Todo Management System's advanced features (Phase 2.2).

## Files

### Core Types and I/O
- **`todo-types.ts`** - TypeScript type definitions for todos, citations, rollback, scoping, and change logging
- **`todo-io.ts`** - File I/O utilities for reading/writing todo files, change logs, and rollback history

### Advanced Features
- **`todo-citations.ts`** - Citation system implementation (create, lookup, review citations)
- **`todo-lookup-triggers.ts`** - Lookup triggers implementation (detect, evaluate, activate triggers)
- **`todo-rollback.ts`** - Rollback control implementation (store states, rollback operations, conflict detection)
- **`todo-scoping.ts`** - Todo scoping implementation (scope management, creep detection, detail aggregation)
- **`todo-plain-language.ts`** - Plain language uploader implementation (parse natural language, generate todos)

## Usage Examples

### Citation System

```typescript
import { createCitation, lookupCitations } from './todo-citations';

// Create a citation
const citation = await createCitation(
  'vue-migration',
  'session-1.3-2',
  'change-002',
  'status_change',
  ['session-start'],
  'high'
);

// Lookup citations at a workflow junction
const citations = await lookupCitations(
  'vue-migration',
  'session-1.3-2',
  'session-start'
);
```

### Lookup Triggers

```typescript
import { detectTriggers, activateTrigger } from './todo-lookup-triggers';

// Detect triggers at a junction
const triggers = await detectTriggers(
  'vue-migration',
  'session-start',
  { todoId: 'session-1.3' }
);

// Activate a trigger
const result = await activateTrigger(
  'vue-migration',
  triggers[0],
  { todoId: 'session-1.3' }
);
```

### Rollback Control

```typescript
import { rollbackToState, getRollbackHistory } from './todo-rollback';

// Rollback to previous state
const rollback = await rollbackToState(
  'vue-migration',
  'session-1.3-2',
  'state-001',
  'Reverting accidental change'
);

// Get rollback history
const history = await getRollbackHistory('vue-migration', 'session-1.3-2');
```

### Todo Scoping

```typescript
import { validateScope, detectScopeCreep, aggregateDetails } from './todo-scoping';

// Validate scope
const validation = await validateScope('vue-migration', todo, parentTodo);

// Detect scope creep
const violations = detectScopeCreep(todo);

// Aggregate details from children
const aggregated = await aggregateDetails('vue-migration', parentTodo);
```

### Plain Language Uploader

```typescript
import { createTodoFromPlainLanguage } from './todo-plain-language';

// Create todo from plain language
const result = await createTodoFromPlainLanguage(
  'vue-migration',
  'Create API client layer for Vue migration. This is a session-level task under phase 1.',
  { currentPhase: 1 }
);
```

## Integration

These utilities are designed to be integrated with:
- Workflow commands (`/session-start`, `/phase-checkpoint`, etc.)
- Change logging system
- Planning document synchronization
- Conflict detection system

## Notes

- All file operations are asynchronous
- Error handling is included but may need enhancement for production use
- Some features have placeholder implementations that need completion
- Type safety is maintained throughout

## Next Steps

1. Create command interfaces for each feature
2. Integrate with workflow commands
3. Add comprehensive error handling
4. Add logging and monitoring
5. Create user-facing documentation

