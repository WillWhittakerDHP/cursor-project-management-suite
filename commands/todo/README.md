# Todo Management Commands

This directory contains slash commands for managing todos in the workflow system. These commands wrap the todo management utilities and provide a consistent, discoverable interface for todo operations.

## Overview

Todo commands are organized into **atomic** (single-responsibility) and **composite** (multi-step workflows) operations. All commands follow the existing command pattern and can be called programmatically or via slash commands.

## Quick Reference

See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for a one-page lookup table.

## Command Categories

### Atomic Commands

#### Core I/O Operations
- `findTodo(feature, todoId)` - Find a todo by ID
- `saveTodoCommand(feature, todo)` - Save a todo
- `getAllTodosCommand(feature)` - Get all todos for a feature

#### Citation Management
- `createCitationCommand(feature, todoId, changeLogId, type, context, priority, metadata?)` - Create a citation
- `createCitationFromChangeCommand(feature, todoId, changeLogId, context)` - Auto-create citation from change log
- `lookupCitationsCommand(feature, todoId, context)` - Lookup citations for a todo
- `reviewCitationCommand(feature, todoId, citationId)` - Mark citation as reviewed
- `dismissCitationCommand(feature, todoId, citationId)` - Dismiss a citation
- `queryCitationsCommand(feature, filters)` - Query citations with filters

#### Rollback Operations
- `storeState(feature, todo, changeLogId, reason?)` - Store todo state snapshot
- `getStates(feature, todoId)` - Get available rollback states
- `rollback(feature, todoId, stateId, reason?)` - Rollback todo to previous state
- `rollbackFieldsCommand(feature, todoId, stateId, fields, reason?)` - Selective field rollback
- `getRollbackHistoryCommand(feature, todoId?)` - Get rollback history

#### Scope Management
- `validateScopeCommand(feature, todo, parentTodo?)` - Validate todo scope
- `detectScopeCreepCommand(todo)` - Detect scope violations
- `assignScopeCommand(feature, todo, parentTodo?)` - Assign scope to todo
- `enforceScopeCommand(feature, todo, parentTodo, mode)` - Enforce scope with mode

#### Trigger Management
- `detectTriggersCommand(feature, junction, context)` - Detect triggers for junction
- `activateTriggerCommand(feature, trigger, context)` - Activate trigger and get citations
- `suppressTriggerCommand(feature, triggerId, durationHours)` - Suppress trigger temporarily

### Composite Commands

- `createFromPlainLanguage(feature, input, context?)` - Parse natural language → validate → create → enforce scope
- `createCitationsForChange(feature, changeLogId, affectedTodoIds, context)` - Create citations for multiple todos
- `rollbackWithConflictCheck(feature, todoId, stateId, reason?)` - Detect conflicts → rollback → log
- `aggregateDetailsCommand(feature, parentTodo)` - Aggregate child details and generate summary

## Usage Examples

### Programmatic Usage

```typescript
import { findTodo, createCitation, rollback } from './cursor/commands';

// Find a todo
const todoInfo = await findTodo('vue-migration', 'session-1.3');

// Create a citation
const citationResult = await createCitationCommand(
  'vue-migration',
  'session-1.3',
  'change-001',
  'status_change',
  ['session-start'],
  'high'
);

// Rollback a todo
const rollbackResult = await rollback('vue-migration', 'session-1.3', 'state-001', 'Reverting accidental change');
```

### Slash Command Usage

Commands can be invoked via slash commands (if configured in your environment):
- `/todo-find vue-migration session-1.3`
- `/todo-create-citation vue-migration session-1.3 change-001 status_change session-start high`
- `/todo-rollback vue-migration session-1.3 state-001`

## Integration with Workflow Commands

Todo commands are designed to be called from workflow manager commands:

```typescript
import { findTodo, lookupCitations } from './cursor/commands';

// In a workflow command
export async function sessionStart(sessionId: string, description: string): Promise<string> {
  // Lookup citations for this session
  const citations = await lookupCitationsCommand('vue-migration', `session-${sessionId}`, 'session-start');
  
  // Use citations in workflow...
}
```

## Integration with Planning System

Planning commands create todos as part of their workflow. The todo command provides both CLI and programmatic APIs:

### CLI API (Returns Formatted String)

For human-readable output in command-line interfaces:

```typescript
import { createFromPlainLanguage } from './todo/composite/create-from-plain-language';

const output = await createFromPlainLanguage(feature, input, context);
// Returns formatted markdown string
```

### Programmatic API (Returns Structured Data)

For programmatic use from other commands (e.g., planning commands):

```typescript
import { createFromPlainLanguageProgrammatic } from './todo/composite/create-from-plain-language';

const result = await createFromPlainLanguageProgrammatic(feature, input, context);
// Returns: { success: boolean; todo?: Todo; errors?: ParsingError[]; suggestions?: string[] }
```

### Why Two APIs?

- **CLI API**: Returns formatted strings for display to users
- **Programmatic API**: Returns structured data for programmatic use
- **Same Logic**: Both call the same utility, just format output differently
- **Separation**: Planning commands use programmatic API, maintaining abstraction

### Shared Parsing Utilities

Both planning and todo systems use shared parsing utilities from `natural-language-parser.ts`:
- `tokenize()` - Text tokenization
- `extractPriority()` - Priority extraction
- `extractTags()` - Tag extraction
- `extractDependencies()` - Dependency extraction
- `hasExplicitField()` / `extractExplicitField()` - Explicit field extraction

This ensures consistent parsing behavior while maintaining separation of concerns.

## Type Reference

All commands use types from `.cursor/workflow/utils/todo-types.ts`:
- `Todo` - Core todo type
- `Citation` - Citation type
- `CitationType` - Citation type enum
- `CitationContext` - Citation context enum
- `CitationPriority` - Citation priority enum
- `PreviousState` - Rollback state type
- `Rollback` - Rollback operation type
- `Scope` - Scope type
- `ScopeViolation` - Scope violation type
- `TriggerDefinition` - Trigger definition type

## Error Handling

All commands catch errors and return user-friendly messages. Commands return formatted strings rather than throwing exceptions, making them safe to use in workflow contexts.

## File Structure

```
todo/
├── atomic/
│   ├── find.ts
│   ├── save.ts
│   ├── get-all.ts
│   ├── create-citation.ts
│   ├── create-citation-from-change.ts
│   ├── lookup-citations.ts
│   ├── review-citation.ts
│   ├── dismiss-citation.ts
│   ├── query-citations.ts
│   ├── store-state.ts
│   ├── get-states.ts
│   ├── rollback.ts
│   ├── rollback-fields.ts
│   ├── get-rollback-history.ts
│   ├── validate-scope.ts
│   ├── detect-scope-creep.ts
│   ├── assign-scope.ts
│   ├── enforce-scope.ts
│   ├── detect-triggers.ts
│   ├── activate-trigger.ts
│   └── suppress-trigger.ts
└── composite/
    ├── create-from-plain-language.ts
    ├── create-citations-for-change.ts
    ├── rollback-with-conflict-check.ts
    └── aggregate-details.ts
```

## Related Documentation

- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - One-page command reference
- `.cursor/workflow/utils/README.md` - Utility functions documentation
- `.cursor/workflow/utils/todo-types.ts` - Type definitions

