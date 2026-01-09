# Todo Commands Quick Reference

One-page lookup table for all todo management commands.

## Core I/O

| Command | Function | Parameters | Description |
|---------|----------|-----------|-------------|
| `/todo-find` | `findTodo` | `feature, todoId` | Find todo by ID |
| `/todo-save` | `saveTodoCommand` | `feature, todo` | Save a todo |
| `/todo-get-all` | `getAllTodosCommand` | `feature` | Get all todos for feature |

## Citations

| Command | Function | Parameters | Description |
|---------|----------|-----------|-------------|
| `/todo-create-citation` | `createCitationCommand` | `feature, todoId, changeLogId, type, context[], priority, metadata?` | Create citation |
| `/todo-create-citation-from-change` | `createCitationFromChangeCommand` | `feature, todoId, changeLogId, context[]` | Auto-create from change log |
| `/todo-lookup-citations` | `lookupCitationsCommand` | `feature, todoId, context` | Lookup citations |
| `/todo-review-citation` | `reviewCitationCommand` | `feature, todoId, citationId` | Mark as reviewed |
| `/todo-dismiss-citation` | `dismissCitationCommand` | `feature, todoId, citationId` | Dismiss citation |
| `/todo-query-citations` | `queryCitationsCommand` | `feature, filters` | Query with filters |

## Rollback

| Command | Function | Parameters | Description |
|---------|----------|-----------|-------------|
| `/todo-store-state` | `storeState` | `feature, todo, changeLogId, reason?` | Store state snapshot |
| `/todo-get-states` | `getStates` | `feature, todoId` | Get available states |
| `/todo-rollback` | `rollback` | `feature, todoId, stateId, reason?` | Rollback to state |
| `/todo-rollback-fields` | `rollbackFieldsCommand` | `feature, todoId, stateId, fields[], reason?` | Selective rollback |
| `/todo-get-rollback-history` | `getRollbackHistoryCommand` | `feature, todoId?` | Get rollback history |

## Scoping

| Command | Function | Parameters | Description |
|---------|----------|-----------|-------------|
| `/todo-validate-scope` | `validateScopeCommand` | `feature, todo, parentTodo?` | Validate scope |
| `/todo-detect-scope-creep` | `detectScopeCreepCommand` | `todo` | Detect violations |
| `/todo-assign-scope` | `assignScopeCommand` | `feature, todo, parentTodo?` | Assign scope |
| `/todo-enforce-scope` | `enforceScopeCommand` | `feature, todo, parentTodo, mode` | Enforce scope |

## Triggers

| Command | Function | Parameters | Description |
|---------|----------|-----------|-------------|
| `/todo-detect-triggers` | `detectTriggersCommand` | `feature, junction, context` | Detect triggers |
| `/todo-activate-trigger` | `activateTriggerCommand` | `feature, trigger, context` | Activate trigger |
| `/todo-suppress-trigger` | `suppressTriggerCommand` | `feature, triggerId, durationHours` | Suppress trigger |

## Composite

| Command | Function | Parameters | Description |
|---------|----------|-----------|-------------|
| `/todo-create-from-plain-language` | `createFromPlainLanguage` | `feature, input, context?` | Parse → validate → create |
| `/todo-create-citations-for-change` | `createCitationsForChange` | `feature, changeLogId, affectedTodoIds[], context[]` | Create multiple citations |
| `/todo-rollback-with-conflict-check` | `rollbackWithConflictCheck` | `feature, todoId, stateId, reason?` | Detect → rollback → log |
| `/todo-aggregate-details` | `aggregateDetailsCommand` | `feature, parentTodo` | Aggregate child details |

## Common Types

- `CitationType`: `status_change` | `description_change` | `parent_change` | `planning_doc_change` | `propagation_change` | `conflict_detected` | `rollback_applied`
- `CitationContext`: `session-start` | `session-checkpoint` | `session-end` | `phase-start` | `phase-checkpoint` | `phase-end` | `task-start` | `task-checkpoint` | `conflict-detection` | `planning-doc-update`
- `CitationPriority`: `low` | `medium` | `high` | `critical`
- `Scope Mode`: `strict` | `warn` | `auto`

## Import Example

```typescript
import {
  findTodo,
  createCitationCommand,
  rollback,
  validateScopeCommand,
  detectTriggersCommand,
  createFromPlainLanguage
} from './cursor/commands';
```

