# Atomic Commands Architecture

## Overview

The atomic commands architecture breaks down monolithic workflow commands into smaller, composable operations. This provides flexibility, reusability, and better debugging capabilities.

## Design Principles

### 1. Single Responsibility
Each atomic command performs one specific operation. This makes commands:
- Easier to understand
- Easier to test
- Easier to debug
- Easier to compose

### 2. Composability
Atomic commands can be combined to create complex workflows:
- Common workflows use composite commands (backward compatible)
- Custom workflows compose atomic commands as needed
- Each command is independent and can be used alone

### 3. Backward Compatibility
Existing monolithic commands remain available as compositions:
- `/feature-start` = `/feature-create` + `/feature-research` + `/feature-load` + git branch + `/feature-checkpoint`
- `/phase-start` = `/phase-load` + `/phase-checkpoint`
- `/session-start` = `/session-load` + `/session-checkpoint`
- `/feature-end` = `/feature-summarize` + `/feature-close` + git merge
- `/phase-end` = `/phase-summarize` + `/phase-close`
- `/session-end` = `/session-summarize` + `/session-close`

## Command Hierarchy

### Feature Level Commands

#### `/feature-create [name] [description]`
**Purpose:** Create feature structure and initial documentation

**Actions:**
- Create feature guide document
- Create feature log document
- Create feature handoff document
- Initialize feature directory structure (phases/, sessions/)

**Files Created:**
- `.cursor/project-manager/features/[name]/feature-[name]-guide.md`
- `.cursor/project-manager/features/[name]/feature-[name]-log.md`
- `.cursor/project-manager/features/[name]/feature-[name]-handoff.md`
- `.cursor/project-manager/features/[name]/phases/` (directory)
- `.cursor/project-manager/features/[name]/sessions/` (directory)

**When to Use:**
- Planning a new feature
- Setting up feature structure before starting work

#### `/feature-research [name]`
**Purpose:** Conduct external documentation research (mandatory, includes question set)

**Actions:**
- Present research question set (30+ questions)
- Guide user through research phase
- Document research findings
- Update feature guide with research results

**Research Questions:**
- Architecture & Design (5 questions)
- Scope & Phases (5 questions)
- External Research (5 questions)
- Risk & Mitigation (5 questions)
- Testing & Quality (5 questions)
- Documentation & Communication (5 questions)

**Files Updated:**
- `.cursor/project-manager/features/[name]/feature-[name]-guide.md`
- `.cursor/project-manager/features/[name]/feature-[name]-log.md`

**When to Use:**
- Mandatory before feature implementation
- Need to research architecture/technology choices
- Planning external dependencies

#### `/feature-load [name]`
**Purpose:** Load feature context and documentation

**Actions:**
- Read feature guide, log, and handoff documents
- Load feature objectives and scope
- Load feature status and progress
- Prepare feature context for agent

**Files Read:**
- `.cursor/project-manager/features/[name]/feature-[name]-guide.md`
- `.cursor/project-manager/features/[name]/feature-[name]-log.md`
- `.cursor/project-manager/features/[name]/feature-[name]-handoff.md`

**When to Use:**
- Resuming work on a feature
- Getting feature context without creating checkpoint
- Reviewing feature status

#### `/feature-checkpoint [name]`
**Purpose:** Create checkpoint in current feature

**Actions:**
- Record current feature state
- Document progress across phases
- Capture current phase/session/task state
- Update feature log with checkpoint entry
- Create git commit (optional)

**Files Updated:**
- `.cursor/project-manager/features/[name]/feature-[name]-log.md`

**When to Use:**
- Saving progress mid-feature
- Creating milestone markers
- Before significant changes
- After completing a phase

#### `/feature-summarize [name]`
**Purpose:** Generate feature summary

**Actions:**
- Analyze feature log and phases
- Generate accomplishments summary
- Identify key decisions
- Create completion summary

**Files Updated:**
- `.cursor/project-manager/features/[name]/feature-[name]-log.md`
- `.cursor/project-manager/features/[name]/feature-[name]-handoff.md`

**When to Use:**
- Before closing a feature
- Creating feature reports
- Preparing for feature transition

#### `/feature-close [name]`
**Purpose:** Close feature and finalize documentation

**Actions:**
- Finalize feature log
- Update feature handoff with final status
- Mark feature as complete
- Prepare transition documentation

**Files Updated:**
- `.cursor/project-manager/features/[name]/feature-[name]-log.md`
- `.cursor/project-manager/features/[name]/feature-[name]-handoff.md`

**When to Use:**
- Completing a feature
- Finalizing feature documentation
- Preparing for next feature

### Phase Level Commands

#### `/phase-create [N] [description]`
**Purpose:** Create phase structure and initial documentation

**Actions:**
- Create phase guide document
- Create phase log document
- Create phase handoff document
- Initialize phase structure

**Files Created:**
- `.cursor/project-manager/vue-migration/phases/phase-[N]-guide.md`
- `.cursor/project-manager/vue-migration/phases/phase-[N]-log.md`
- `.cursor/project-manager/vue-migration/phases/phase-[N]-handoff.md`

**When to Use:**
- Planning a new phase
- Setting up phase structure before starting work

#### `/phase-load [N]`
**Purpose:** Load phase context and documentation

**Actions:**
- Read phase guide, log, and handoff documents
- Load phase objectives and scope
- Load phase status and progress
- Prepare phase context for agent

**Files Read:**
- `.cursor/project-manager/vue-migration/phases/phase-[N]-guide.md`
- `.cursor/project-manager/vue-migration/phases/phase-[N]-log.md`
- `.cursor/project-manager/vue-migration/phases/phase-[N]-handoff.md`

**When to Use:**
- Resuming work on a phase
- Getting phase context without creating checkpoint
- Reviewing phase status

#### `/phase-checkpoint [N]`
**Purpose:** Create checkpoint in current phase

**Actions:**
- Record current phase state
- Document progress
- Capture current session/task state
- Update phase log with checkpoint entry

**Files Updated:**
- `.cursor/project-manager/vue-migration/phases/phase-[N]-log.md`

**When to Use:**
- Saving progress mid-phase
- Creating milestone markers
- Before significant changes

#### `/phase-summarize [N]`
**Purpose:** Generate phase summary

**Actions:**
- Analyze phase log and sessions
- Generate accomplishments summary
- Identify key decisions
- Create completion summary

**Files Updated:**
- `.cursor/project-manager/vue-migration/phases/phase-[N]-log.md`
- `.cursor/project-manager/vue-migration/phases/phase-[N]-handoff.md`

**When to Use:**
- Before closing a phase
- Creating phase reports
- Preparing for phase transition

#### `/phase-close [N]`
**Purpose:** Close phase and finalize documentation

**Actions:**
- Finalize phase log
- Update phase handoff with final status
- Mark phase as complete
- Prepare transition to next phase

**Files Updated:**
- `.cursor/project-manager/vue-migration/phases/phase-[N]-log.md`
- `.cursor/project-manager/vue-migration/phases/phase-[N]-handoff.md`

**When to Use:**
- Completing a phase
- Finalizing phase documentation
- Preparing for next phase

### Session Level Commands

#### `/session-create [X.Y] [description]`
**Purpose:** Create session structure and initial documentation

**Actions:**
- Create session guide document
- Create session log document
- Create session handoff document
- Initialize session structure

**Files Created:**
- `.cursor/project-manager/vue-migration/sessions/session-[X.Y]-guide.md`
- `.cursor/project-manager/vue-migration/sessions/session-[X.Y]-log.md`
- `.cursor/project-manager/vue-migration/sessions/session-[X.Y]-handoff.md`

**When to Use:**
- Planning a new session
- Setting up session structure before starting work

#### `/session-load [X.Y]`
**Purpose:** Load session context and documentation

**Actions:**
- Read session guide, log, and handoff documents
- Load session objectives and tasks
- Load session status and progress
- Prepare session context for agent

**Files Read:**
- `.cursor/project-manager/vue-migration/sessions/session-[X.Y]-guide.md`
- `.cursor/project-manager/vue-migration/sessions/session-[X.Y]-log.md`
- `.cursor/project-manager/vue-migration/sessions/session-[X.Y]-handoff.md`

**When to Use:**
- Resuming work on a session
- Getting session context without creating checkpoint
- Reviewing session status

#### `/session-checkpoint [X.Y]`
**Purpose:** Create checkpoint in current session

**Actions:**
- Record current session state
- Document progress
- Capture current task state
- Update session log with checkpoint entry

**Files Updated:**
- `.cursor/project-manager/vue-migration/sessions/session-[X.Y]-log.md`

**When to Use:**
- Saving progress mid-session
- Creating milestone markers
- Before significant changes

#### `/session-summarize [X.Y]`
**Purpose:** Generate session summary

**Actions:**
- Analyze session log and tasks
- Generate accomplishments summary
- Identify key decisions
- Create completion summary

**Files Updated:**
- `.cursor/project-manager/vue-migration/sessions/session-[X.Y]-log.md`
- `.cursor/project-manager/vue-migration/sessions/session-[X.Y]-handoff.md`

**When to Use:**
- Before closing a session
- Creating session reports
- Preparing for session transition

#### `/session-close [X.Y]`
**Purpose:** Close session and finalize documentation

**Actions:**
- Finalize session log
- Update session handoff with final status
- Mark session as complete
- Update phase log with session completion

**Files Updated:**
- `.cursor/project-manager/vue-migration/sessions/session-[X.Y]-log.md`
- `.cursor/project-manager/vue-migration/sessions/session-[X.Y]-handoff.md`
- `.cursor/project-manager/vue-migration/phases/phase-[X]-log.md`

**When to Use:**
- Completing a session
- Finalizing session documentation
- Preparing for next session

### Task Level Commands

#### `/task-create [X.Y.Z] [description]`
**Purpose:** Create task documentation

**Actions:**
- Create task entry in session guide
- Initialize task tracking
- Set task objectives

**Files Updated:**
- `.cursor/project-manager/vue-migration/sessions/session-[X.Y]-guide.md`

**When to Use:**
- Planning a new task
- Adding task to session

#### `/task-load [X.Y.Z]`
**Purpose:** Load task context

**Actions:**
- Read task description from session guide
- Load task objectives
- Prepare task context for agent

**Files Read:**
- `.cursor/project-manager/vue-migration/sessions/session-[X.Y]-guide.md`

**When to Use:**
- Starting work on a task
- Reviewing task requirements

#### `/task-checkpoint [X.Y.Z]`
**Purpose:** Create checkpoint for current task

**Actions:**
- Record task progress
- Document current state
- Update session log with task checkpoint

**Files Updated:**
- `.cursor/project-manager/vue-migration/sessions/session-[X.Y]-log.md`

**When to Use:**
- Saving progress mid-task
- Before significant changes

#### `/task-close [X.Y.Z]`
**Purpose:** Close task and update documentation

**Actions:**
- Mark task as complete
- Update session log with task completion
- Document task outcomes

**Files Updated:**
- `.cursor/project-manager/vue-migration/sessions/session-[X.Y]-log.md`
- `.cursor/project-manager/vue-migration/sessions/session-[X.Y]-guide.md`

**When to Use:**
- Completing a task
- Moving to next task

## Composition Patterns

### Standard Compositions

#### Feature Start (Composite)
```
/feature-start [name]
```
**Composition:**
```
/feature-create [name] [description]
/feature-research [name]
/feature-load [name]
git checkout -b feature/[name]
/feature-checkpoint [name]
```

#### Feature End (Composite)
```
/feature-end [name]
```
**Composition:**
```
/feature-summarize [name]
/feature-close [name]
[PROMPT USER]
git checkout develop
git merge feature/[name]
git branch -d feature/[name]
```

#### Phase Start (Composite)
```
/phase-start [N] [description]
```
**Composition:**
```
/phase-load [N]
/phase-checkpoint [N]
```

#### Session Start (Composite)
```
/session-start [X.Y] [description]
```
**Composition:**
```
/session-load [X.Y]
/session-checkpoint [X.Y]
```

#### Phase End (Composite)
```
/phase-end [N]
```
**Composition:**
```
/phase-summarize [N]
/phase-close [N]
```

#### Session End (Composite)
```
/session-end [X.Y]
```
**Composition:**
```
/session-summarize [X.Y]
/session-close [X.Y]
```

### Custom Compositions

#### Resume Phase Work
```
/phase-load [N]
/session-load [X.Y]
/task-load [X.Y.Z]
```

#### Create Checkpoint Chain
```
/phase-checkpoint [N]
/session-checkpoint [X.Y]
/task-checkpoint [X.Y.Z]
```

#### Quick Status Check
```
/phase-load [N]
/session-load [X.Y]
```

## Usage Examples

### Example 1: Starting a New Phase

**Standard Approach:**
```
/phase-start 4 "Implement custom wizard architecture"
```

**Atomic Approach:**
```
/phase-create 4 "Implement custom wizard architecture"
/phase-load 4
/phase-checkpoint 4
```

**When to Use Atomic:**
- Need to review phase structure before starting
- Want to customize initialization
- Need to add additional setup steps

### Example 2: Resuming Work

**Standard Approach:**
```
/session-start 4.1 "Build wizard components"
```

**Atomic Approach:**
```
/session-load 4.1
/task-load 4.1.1
```

**When to Use Atomic:**
- Already have session structure
- Just need to load context
- Don't need checkpoint

### Example 3: Creating Checkpoint

**Standard Approach:**
```
/session-checkpoint 4.1
```

**Atomic Approach:**
```
/phase-checkpoint 4
/session-checkpoint 4.1
/task-checkpoint 4.1.1
```

**When to Use Atomic:**
- Need multi-level checkpoint
- Want granular control
- Need to checkpoint at multiple levels

### Example 4: Closing Phase

**Standard Approach:**
```
/phase-end 4
```

**Atomic Approach:**
```
/phase-summarize 4
/session-summarize 4.1
/session-summarize 4.2
/phase-close 4
```

**When to Use Atomic:**
- Need to summarize sessions individually
- Want custom closing process
- Need additional documentation steps

## Benefits of Atomic Commands

### 1. Flexibility
- Compose custom workflows
- Use only needed operations
- Skip unnecessary steps

### 2. Debugging
- Isolate issues to specific operations
- Test individual commands
- Identify failure points

### 3. Reusability
- Reuse commands across different contexts
- Share command patterns
- Build command libraries

### 4. Maintainability
- Update individual commands independently
- Fix issues in specific operations
- Extend functionality incrementally

## Migration Strategy

### Phase 1: Add Atomic Commands
- Implement atomic commands alongside existing commands
- Document atomic command usage
- Provide examples

### Phase 2: Document Compositions
- Document how existing commands compose atomic commands
- Provide migration guide
- Create composition examples

### Phase 3: Encourage Atomic Usage
- Recommend atomic commands for custom workflows
- Provide best practices
- Share success stories

### Phase 4: Optional Deprecation
- Consider deprecating monolithic commands (optional)
- Provide clear migration path
- Maintain backward compatibility

## Best Practices

### 1. Use Standard Compositions for Common Workflows
- Use `/phase-start` for starting phases
- Use `/session-start` for starting sessions
- Use `/phase-end` for ending phases
- Use `/session-end` for ending sessions

### 2. Use Atomic Commands for Custom Workflows
- Compose atomic commands for unique needs
- Create custom command sequences
- Document custom compositions

### 3. Document Custom Compositions
- Document why atomic commands were used
- Share useful compositions
- Create composition templates

### 4. Test Atomic Commands
- Verify individual commands work
- Test compositions
- Validate workflows

## Related Documents

- `.cursor/project-manager/docs/session-end-prompt-discussion-summary.md` - Discussion summary
- `.cursor/project-manager/docs/phase-change-workflow.md` - Phase-change workflow
- `.cursor/commands/templates/atomic-command-template.md` - Command template
- `.cursor/rules/CODING_RULES_FOR_SETTINGS.md` - Workflow rules

