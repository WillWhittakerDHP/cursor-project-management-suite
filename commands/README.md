# Slash Commands for Vue Migration Workflow

This directory contains composable slash commands to automate repetitive tasks in the Vue migration workflow.

## Architecture

Commands are organized by tier (Feature → Phase → Session → Task) with atomic/composite distinction within each tier:
- **Atomic commands**: Single-responsibility building blocks
- **Composite commands**: High-level workflows that combine atomic commands

## Four-Tier Structure

Commands operate at four hierarchical levels:

0. **Feature (Tier 0 - Highest Level)**: Multiple phases, weeks/months of work, major features
   - Commands: `/plan-feature`, `/feature-start`, `/feature-checkpoint`, `/feature-end`, `/feature-change`
   - Documents: `.cursor/project-manager/features/[name]/feature-[name]-guide.md`, `.cursor/project-manager/features/[name]/feature-[name]-log.md`, `.cursor/project-manager/features/[name]/feature-[name]-handoff.md`
   - Templates: `.cursor/commands/tiers/feature/templates/feature-guide.md`, `.cursor/commands/tiers/feature/templates/feature-log.md`, `.cursor/commands/tiers/feature/templates/feature-handoff.md`

1. **Phase (Tier 1 - High-Level)**: Multiple sessions, weeks of work, major milestones
   - Commands: `/plan-phase`, `/phase-start`, `/phase-checkpoint`, `/phase-end`
   - Documents: `.cursor/project-manager/features/vue-migration/phases/phase-[N]-guide.md`, `.cursor/project-manager/features/vue-migration/phases/phase-[N]-log.md`, `.cursor/project-manager/features/vue-migration/phases/phase-[N]-handoff.md`
   - Templates: `.cursor/commands/tiers/phase/templates/phase-guide.md`, `.cursor/commands/tiers/phase/templates/phase-log.md`, `.cursor/commands/tiers/phase/templates/phase-handoff.md`

2. **Session (Tier 2 - Medium-Level)**: Multiple tasks, hours/days of work, focused feature/component
   - Commands: `/plan-session`, `/session-start`, `/session-checkpoint`, `/session-end`, `/session-change`
   - Documents: `.cursor/project-manager/features/vue-migration/sessions/session-[X.Y]-guide.md`, `.cursor/project-manager/features/vue-migration/sessions/session-[X.Y]-log.md`, `.cursor/project-manager/features/vue-migration/sessions/session-[X.Y]-handoff.md`
   - Templates: `.cursor/commands/tiers/session/templates/session-guide.md`, `.cursor/commands/tiers/session/templates/session-log.md`, `.cursor/commands/tiers/session/templates/session-handoff.md`

3. **Task (Tier 3 - Low-Level)**: Single focused work item, minutes/hours, specific implementation
   - Commands: `/plan-task`, `/task-start`, `/task-checkpoint`, `/task-end`
   - Details embedded in session documents (not separate files)

## Usage

### Feature Tier Commands (Tier 0)

#### Atomic Commands
- `/feature-create [name] [description]` - Create feature structure and documentation
- `/feature-research [name]` - Initialize research phase with questions
- `/feature-load [name]` - Load feature context and documentation
- `/feature-checkpoint [name]` - Create feature checkpoint
- `/feature-summarize [name]` - Generate feature summary
- `/feature-close [name]` - Finalize feature documentation

#### Composite Commands
- `/plan-feature [name] [description]` - Plan a new feature with mandatory research phase
- `/feature-start [name]` - Start a feature (create branch, initialize structure, load context)
- `/feature-end [name]` - End a feature (prompt, then merge branch, finalize documentation)
- `/feature-change [name] [new-name] [reason]` - Handle feature pivots

### Phase Tier Commands (Tier 1)

#### Composite Commands
- `/plan-phase [N] [description]` - Phase planning with documentation checks
- `/phase-start [N]` - Load phase guide and handoff, trigger session planning
- `/phase-checkpoint [N]` - Mid-phase review after completing sessions
- `/phase-end [N]` - Complete phase, update phase log/handoff
- `/mark-phase-complete [N]` - Mark phase complete in phase guide

### Session Tier Commands (Tier 2)

#### Atomic Commands
- `/create-session-label [X.Y] [description]` - Generate session label

#### Composite Commands
- `/plan-session [X.Y] [description]` - Session planning, create session guide with task breakdown
- `/session-start [X.Y] [description]` - Load session guide/handoff, trigger task planning
- `/session-checkpoint [X.Y]` - Mid-session review after completing tasks
- `/session-end [X.Y] [description] [next-session]` - Complete session, update session log/handoff/guide
- `/session-change [description]` - Handle mid-session change requests
- `/mark-session-complete [X.Y]` - Mark session complete in phase guide
- `/update-handoff` - Update session handoff document with current progress
- `/new-agent` - Prepare handoff for agent switch

### Task Tier Commands (Tier 3)

#### Atomic Commands
- `/format-task-entry [X.Y.Z]` - Format task log entry
- `/add-task-section [X.Y.Z]` - Add formatted task section to session handoff
- `/mark-complete [X.Y.Z]` - Mark task complete in session handoff
- `/task-checkpoint [X.Y.Z] [notes]` - Task-level quality check
- `/checkpoint [X.Y.Z] [notes]` - Alias for `/task-checkpoint` (backward compatibility)

#### Composite Commands
- `/plan-task [X.Y.Z] [description]` - Task planning, fill out task embeds in session guide
- `/task-start [X.Y.Z]` - Load task context from session guide
- `/task-end [X.Y.Z]` - Complete task, update task log embedded in session log
- `/log-task [X.Y.Z]` - Add task entry to session log
- `/mark-task-complete [X.Y.Z]` - Mark task complete in session guide

### Utility Commands (Cross-Tier)

#### Atomic Commands
- `/read-handoff` - Read and display key sections from handoff document
- `/read-guide` - Read and display relevant sections from session guide
- `/lint [target]` - Run linting (vue/server/all)
- `/type-check` - Run type checking for Vue app
- `/test [target] [--watch]` - Run tests (vue/server/all)
- `/verify-app` - Verify app starts on port 3002
- `/append-log [content]` - Append formatted entry to session log (uses session-specific log if sessionId provided)
- `/update-next-action [action]` - Update "Next Action" in handoff
- `/update-timestamp` - Update "Last Updated" timestamp in handoff
- `/git-commit [message]` - Stage and commit (prompts with suggested message)
- `/git-push` - Push to current branch
- `/generate-prompt [X.Y] [description]` - Generate next session prompt
- `/create-branch [name]` - Create new git branch
- `/check-docs [type]` - Check documentation before implementing (component/transformer/pattern/migration) - Enforces Rule 21
- `/check-reuse [description]` - Check for reusable patterns before duplicating code - Enforces Rule 22
- `/update-guide` - Update session guide with instructions, patterns, or architectural notes
- `/update-handoff-minimal` - Minimal handoff update (transition context only)
- `/status` - Quick overview of current position (phase, next action, branch, last commit)
- `/scope-and-summarize [description]` - Analyze conversation context, determine tier, generate summary for change requests
- `/scope-and-change [description]` - Analyze conversation context, determine tier, auto-execute change request for safe changes, or show analysis for review

#### Composite Commands
- `/verify [target] [--test]` - Run all quality checks
- `/check-before-implement [type] [description]` - Consolidated documentation and pattern reuse check

### Testing Commands (Cross-Tier Utilities)

Comprehensive test command structure with atomic/composite patterns, test immutability protection, templates, and workflow integration.

#### Atomic Commands
- `/test-run [target]` - Execute test suite (vue/server/all)
- `/test-watch [target]` - Run tests in watch mode
- `/test-coverage [target]` - Generate coverage reports
- `/test-validate [file-path]` - Validate test file structure and compliance
- `/test-check-immutable [file-path] [reason]` - Check if test file is immutable
- `/test-lint [target]` - Lint test files specifically
- `/test-template [type] [file-path] [component-name]` - Generate test file from template

#### Composite Commands
- `/test-workflow [target] [--coverage]` - Full test workflow (validate → lint → run → coverage)
- `/test-before-commit [target]` - Pre-commit test suite
- `/test-on-change [file-paths...]` - Run tests when files change
- `/test-end-workflow [tier] [id] [target]` - End-of-workflow test suite

**Workflow Integration:**
- `/session-end [X.Y] [--test]` - Run tests before ending session
- `/task-end [X.Y.Z] [--test]` - Run tests before ending task
- `/phase-end [N] [--test]` - Run full test suite before ending phase
- `/feature-end [name] [--test]` - Run all tests + coverage before ending feature

See `.cursor/commands/testing/README.md` for comprehensive documentation and `.cursor/commands/testing/QUICK_REFERENCE.md` for quick lookup.

### Todo Commands (Cross-Tier Utilities)

Todo management commands for creating, managing, and querying todos. See [todo/README.md](./todo/README.md) for comprehensive documentation and [todo/QUICK_REFERENCE.md](./todo/QUICK_REFERENCE.md) for quick lookup.

#### Core I/O Commands
- `/todo-find [feature] [todo-id]` - Find todo by ID
- `/todo-save [feature] [todo]` - Save a todo
- `/todo-get-all [feature]` - Get all todos for a feature

#### Citation Commands
- `/todo-create-citation [feature] [todo-id] [change-log-id] [type] [context] [priority]` - Create citation
- `/todo-create-citation-from-change [feature] [todo-id] [change-log-id] [context]` - Auto-create from change log
- `/todo-lookup-citations [feature] [todo-id] [context]` - Lookup citations for todo
- `/todo-review-citation [feature] [todo-id] [citation-id]` - Mark citation as reviewed
- `/todo-dismiss-citation [feature] [todo-id] [citation-id]` - Dismiss citation
- `/todo-query-citations [feature] [filters]` - Query citations with filters

#### Rollback Commands
- `/todo-store-state [feature] [todo] [change-log-id] [reason]` - Store state snapshot
- `/todo-get-states [feature] [todo-id]` - Get available rollback states
- `/todo-rollback [feature] [todo-id] [state-id] [reason]` - Rollback to previous state
- `/todo-rollback-fields [feature] [todo-id] [state-id] [fields] [reason]` - Selective field rollback
- `/todo-get-rollback-history [feature] [todo-id]` - Get rollback history

#### Scoping Commands
- `/todo-validate-scope [feature] [todo] [parent-todo]` - Validate todo scope
- `/todo-detect-scope-creep [todo]` - Detect scope violations
- `/todo-assign-scope [feature] [todo] [parent-todo]` - Assign scope to todo
- `/todo-enforce-scope [feature] [todo] [parent-todo] [mode]` - Enforce scope

#### Trigger Commands
- `/todo-detect-triggers [feature] [junction] [context]` - Detect triggers for junction
- `/todo-activate-trigger [feature] [trigger] [context]` - Activate trigger
- `/todo-suppress-trigger [feature] [trigger-id] [duration-hours]` - Suppress trigger

#### Composite Todo Commands
- `/todo-create-from-plain-language [feature] [input] [context]` - Parse → validate → create → enforce scope
- `/todo-create-citations-for-change [feature] [change-log-id] [affected-todo-ids] [context]` - Create multiple citations
- `/todo-rollback-with-conflict-check [feature] [todo-id] [state-id] [reason]` - Detect conflicts → rollback → log
- `/todo-aggregate-details [feature] [parent-todo]` - Aggregate child details for parent

## Command Chaining

Commands can be chained with `&&`:

```
/verify vue && /log-task 1.3.1 "Base API Client Setup" && /update-handoff
```

## Examples

### Four-Tier Workflow

**Feature Level:**
```
/plan-feature vue-migration "Migrate application to Vue.js"
/feature-start vue-migration
[Work through phases...]
/feature-checkpoint vue-migration
/feature-end vue-migration
```

**Phase Level:**
```
/plan-phase 1 "Data Layer Foundation"
/phase-start 1
[Work through sessions...]
/phase-checkpoint 1
/phase-end 1
```

**Session Level:**
```
/plan-session 1.3 "API Clients"
/session-start 1.3 "API Clients"
[Work through tasks...]
/session-checkpoint 1.3
/session-end 1.3 "API Clients" 1.4
```

**Task Level:**
```
/plan-task 1.3.1 "Base API Client Setup"
/task-start 1.3.1
[Work on task...]
/task-checkpoint 1.3.1
/task-end 1.3.1
```

### Start a Session
```
/session-start 1.3 "API Clients"
```

### Quick Quality Check
```
/verify vue
```

### Full Quality Check with Tests
```
/verify vue --test
```

### End a Session
```
/session-end 1.3 "API Clients" 1.4
```

## Implementation

All commands are implemented in TypeScript and can be imported and used programmatically:

```typescript
import { sessionStart, verify, sessionEnd, taskCheckpoint } from './cursor/commands';
import { findTodo, createCitationCommand, rollback } from './cursor/commands';

// Use workflow commands
const output = await sessionStart('1.3', 'API Clients');
const result = await verify('vue', false);
const checkpoint = await taskCheckpoint('1.3.1', 'Completed API client setup');

// Use todo commands
const todo = await findTodo('vue-migration', 'session-1.3');
const citation = await createCitationCommand('vue-migration', 'session-1.3', 'change-001', 'status_change', ['session-start'], 'high');
const rollbackResult = await rollback('vue-migration', 'session-1.3', 'state-001', 'Reverting change');
```

## Quick Reference

See [USAGE.md](./USAGE.md) for detailed usage guide, workflow examples, and Ask Mode vs Agent Mode guidelines.

## Related Documentation

- [USAGE.md](./USAGE.md) - Detailed usage guide with workflow examples
- [README Management](../readme/README.md) - README management commands

## File Structure

```
.cursor/commands/
├── feature/                    # Feature tier (Tier 0)
│   ├── atomic/
│   │   ├── feature-create.ts
│   │   ├── feature-research.ts
│   │   ├── feature-load.ts
│   │   ├── feature-checkpoint.ts
│   │   ├── feature-summarize.ts
│   │   └── feature-close.ts
│   └── composite/
│       ├── plan-feature.ts
│       ├── feature-start.ts
│       ├── feature-end.ts
│       └── feature-change.ts
├── phase/                      # Phase tier (Tier 1)
│   └── composite/
│       ├── plan-phase.ts
│       ├── phase-start.ts
│       ├── phase-checkpoint.ts
│       ├── phase-end.ts
│       └── mark-phase-complete.ts
├── session/                     # Session tier (Tier 2)
│   ├── atomic/
│   │   └── create-session-label.ts
│   └── composite/
│       ├── plan-session.ts
│       ├── session-start.ts
│       ├── session-checkpoint.ts
│       ├── session-end.ts
│       ├── session-change.ts
│       ├── mark-session-complete.ts
│       ├── update-handoff.ts
│       └── new-agent.ts
├── task/                        # Task tier (Tier 3)
│   ├── atomic/
│   │   ├── format-task-entry.ts
│   │   ├── add-task-section.ts
│   │   ├── mark-complete.ts
│   │   ├── checkpoint.ts (exports taskCheckpoint)
│   │   ├── format-subsession-entry.ts (deprecated - use format-task-entry.ts)
│   │   └── add-subsession-section.ts (deprecated - use add-task-section.ts)
│   └── composite/
│       ├── plan-task.ts
│       ├── task-start.ts
│       ├── task-end.ts
│       ├── log-task.ts
│       ├── mark-task-complete.ts
│       └── log-subsession.ts (deprecated - use log-task.ts)
├── utils/                       # Cross-tier utilities
│   ├── read-handoff.ts
│   ├── read-guide.ts
│   ├── lint.ts
│   ├── type-check.ts
│   ├── test.ts
│   ├── verify-app.ts
│   ├── append-log.ts
│   ├── update-next-action.ts
│   ├── update-timestamp.ts
│   ├── git-commit.ts
│   ├── git-push.ts
│   ├── generate-prompt.ts
│   ├── create-branch.ts
│   ├── check-docs.ts
│   ├── check-reuse.ts
│   ├── update-guide.ts
│   ├── update-handoff-minimal.ts
│   ├── status.ts
│   ├── verify.ts
│   ├── check-before-implement.ts
│   └── utils.ts                 # Shared utilities
├── todo/                        # Todo management commands
│   ├── atomic/                  # Single-responsibility operations
│   │   ├── find.ts
│   │   ├── save.ts
│   │   ├── get-all.ts
│   │   ├── create-citation.ts
│   │   ├── create-citation-from-change.ts
│   │   ├── lookup-citations.ts
│   │   ├── review-citation.ts
│   │   ├── dismiss-citation.ts
│   │   ├── query-citations.ts
│   │   ├── store-state.ts
│   │   ├── get-states.ts
│   │   ├── rollback.ts
│   │   ├── rollback-fields.ts
│   │   ├── get-rollback-history.ts
│   │   ├── validate-scope.ts
│   │   ├── detect-scope-creep.ts
│   │   ├── assign-scope.ts
│   │   ├── enforce-scope.ts
│   │   ├── detect-triggers.ts
│   │   ├── activate-trigger.ts
│   │   └── suppress-trigger.ts
│   ├── composite/               # Multi-step workflows
│   │   ├── create-from-plain-language.ts
│   │   ├── create-citations-for-change.ts
│   │   ├── rollback-with-conflict-check.ts
│   │   └── aggregate-details.ts
│   ├── README.md                # Comprehensive documentation
│   └── QUICK_REFERENCE.md       # One-page lookup table
├── index.ts                     # Main exports
├── README.md                     # This file
└── USAGE.md                      # Detailed usage guide
```

## Implementation Notes

### Architecture

All commands follow a composable architecture:
- **Atomic commands**: Single-responsibility building blocks
- **Composite commands**: High-level workflows combining atomic commands
- Commands can be chained and composed for flexible workflows

### Status

✅ All commands implemented and functional
✅ Commands are TypeScript and type-safe
✅ Commands use Node.js built-in modules (fs, child_process, net)
✅ No external dependencies required (except npm commands)
✅ Commands preserve existing file formatting and structure
✅ Git operations detect current branch automatically
