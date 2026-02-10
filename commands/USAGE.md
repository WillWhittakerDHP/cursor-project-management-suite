# Slash Commands Usage Guide

## Overview

These slash commands automate repetitive tasks in the Vue migration workflow. They are designed to be composable - atomic commands can be used standalone or combined into composite workflows.

## IMPORTANT: Ask Mode vs Agent Mode

**CRITICAL:** All planning and documentation commands must be used in **Ask Mode**. Implementation only happens in **Agent Mode** after explicit approval.

**Ask Mode Commands (Planning/Documenting):**
- `/session-start` - Planning session work
- `/session-change` - Recording change requests
- `/plan-task`, `/plan-session`, `/plan-phase` - Planning operations
- `/read-handoff`, `/read-guide` - Reading documentation
- `/status` - Checking status
- `/session-checkpoint`, `/phase-checkpoint` - Reviewing progress

**Agent Mode (Implementation):**
- Implementation happens in Agent Mode after explicit approval
- Must show approval prompt before switching to Agent Mode
- See Rule 23 in `.cursor/rules/USER_CODING_RULES.md` for complete guidelines

## Quick Start

### Starting a Session

**Mode:** Ask Mode (planning/documenting)

Use `/session-start` to initialize a new session with all necessary context:

```
/session-start 1.3.2 "Entity API Composables"
```

**Note:** This command is for planning and should be used in Ask Mode. It outputs a plan, not an implementation. Implementation requires switching to Agent Mode after approval.

This will:
- Load key sections from the handoff document
- Load relevant sections from the session guide
- Generate a formatted session label
- Display documentation check reminder (Rule 22)
- Display the compact prompt format for reference
- Output a plan for review (not implementation)

### Running Quality Checks

Use `/verify` to run linting and type checking:

```
/verify vue
```

Or with tests:

```
/verify vue --test
```

### Ending a Session

**IMPORTANT: Prompt Before Execution**

The agent workflow should prompt the user for confirmation before running `/session-end`. After completing the last task in a session, the agent should show:

```
## Ready to End Session?

All tasks complete. Ready to run end-of-session workflow?

**This will:**
- Verify app starts
- Run quality checks
- Update session log
- Update handoff document
- Mark session complete (update checkboxes in phase guide)
- Git commit/push

**Proceed with /session-end?** (yes/no)
```

If user says "yes", execute `/session-end` automatically. If "no", address concerns and re-prompt.

**Command Usage:**

Use `/session-end` to complete the full end-of-session checklist:

```
/session-end 1.4.10
```

**Note:** Only the session ID is required. Description and next session are optional and will be automatically derived from session log/guide if not provided.

This will:
1. Verify the app starts
2. Run quality checks (lint + type-check)
3. Run tests (if `runTests` parameter is true)
4. Check for test strategy or justification documentation
5. Update session log with task entries
6. Update the handoff document (minimal transition context)
7. Update session guide (if guide updates provided)
8. Mark session complete in phase guide
9. Check if this is the last session in phase (prompts for phase-end if so)
10. Commit and push changes (optional)

**Test Documentation Check:**
The `/session-end` command now automatically checks for test strategy or justification:
- Checks session guide for test strategy section
- Logs test status if no test documentation found
- Provides recommendations for documenting test requirements

**Auto-Trigger to Phase-End:**
When the last session in a phase completes, `/session-end` will:
- Detect that all sessions in the phase are complete
- Prompt user to run `/phase-end` to complete the phase
- Provide clear instructions on what phase-end will do

**Note:** Prompts are shown by the agent's workflow logic, not by the command itself. See `.cursor/rules/USER_CODING_RULES.md` (Rule 19) for complete workflow details.

### Ending a Phase

**IMPORTANT: Prompt Before Execution**

The agent workflow should prompt the user for confirmation before running `/phase-end`. After completing all sessions in a phase, the agent should show:

```
## Ready to Complete Phase?

All sessions complete. Ready to run phase-completion workflow?

**This will:**
- Mark phase complete (update checkboxes and status)
- Update phase log with completion summary
- Update main handoff document
- Git commit/push

**Proceed with /phase-end?** (yes/no)
```

If user says "yes", execute `/phase-end` automatically. If "no", address concerns and re-prompt.

**Command Usage:**

Use `/phase-end` to complete the phase workflow:

```
/phase-end 1
```

or

```
/phase-end 1
```

This will:
1. Mark phase complete in phase guide (update checkboxes and status)
2. Update phase log with completion summary
3. Verify test strategy or justification exists (warns if missing)
4. Update main handoff document
5. Run tests (if `runTests` parameter is true)
6. Create new branch (if requested)
7. Commit and push changes

**Test Verification:**
The `/phase-end` command now automatically verifies that test strategy or justification is documented:
- Checks phase guide for test strategy section
- Checks session guides for test documentation
- Warns if no test strategy or justification is found
- Provides recommendations for documenting test requirements

**Note:** Prompts are shown by the agent's workflow logic, not by the command itself. See `.cursor/rules/USER_CODING_RULES.md` (Rule 19) for complete workflow details.

## Feature Tier Commands (Tier 0 - Highest Level)

### Planning a Feature

**Mode:** Ask Mode (planning/documenting)

Use `/plan-feature` to plan a new feature with mandatory research phase:

```
/plan-feature vue-migration "Migrate application to Vue.js"
```

This will:
1. Create feature structure and documentation
2. Initialize research phase with 30+ questions
3. Create feature guide, log, and handoff documents
4. Set up feature directory structure

**Note:** This command is for planning and should be used in Ask Mode. It outputs a plan, not an implementation.

### Starting a Feature

**Mode:** Ask Mode (planning/documenting)

Use `/feature-start` to start a feature (create branch, load context):

```
/feature-start vue-migration
```

This will:
1. Create git branch from `develop`: `feature/[name]`
2. Load feature context and documentation
3. Create initial checkpoint
4. Prepare feature for work

**Git Operations:**
- `git checkout develop`
- `git pull origin develop`
- `git checkout -b feature/[name]`

**Note:** This command is for planning and should be used in Ask Mode. It outputs a plan, not an implementation.

### Feature Research Phase

**Mode:** Ask Mode (planning/documenting)

**MANDATORY:** Every feature must include a research phase before implementation.

Use `/feature-research` to conduct research phase:

```
/feature-research vue-migration
```

This will:
1. Present research question set (30+ questions)
2. Guide user through research phase
3. Document research findings
4. Update feature guide with research results

**Research Questions Cover:**
- Architecture & Design (5 questions)
- Scope & Phases (5 questions)
- External Research (5 questions)
- Risk & Mitigation (5 questions)
- Testing & Quality (5 questions)
- Documentation & Communication (5 questions)

See `.cursor/commands/docs/research-question-set.md` for complete question set.

### Feature Checkpoint

**Mode:** Ask Mode (planning/documenting)

Use `/feature-checkpoint` to create checkpoint in current feature:

```
/feature-checkpoint vue-migration
```

This will:
1. Record current feature state
2. Document progress across phases
3. Capture current phase/session/task state
4. Update feature log with checkpoint entry

### Ending a Feature

**IMPORTANT: Prompt Before Execution**

The agent workflow should prompt the user for confirmation before running `/feature-end`. After completing all phases in a feature, the agent should show:

```
## Ready to End Feature?

All phases complete. Ready to merge feature branch?

**This will:**
- Generate feature summary
- Merge feature/[name] → develop
- Delete feature branch
- Finalize documentation

**Proceed with /feature-end?** (yes/no)
```

If user says "yes", execute `/feature-end` automatically. If "no", address concerns and re-prompt.

**Command Usage:**

Use `/feature-end` to complete the feature workflow:

```
/feature-end vue-migration
```

This will:
1. Generate feature summary
2. Close feature documentation
3. Commit changes
4. Checkout develop
5. Merge feature branch to develop
6. Delete feature branch
7. Push to remote

**Git Operations:**
- `git commit -m "Feature [name] complete"`
- `git checkout develop`
- `git merge feature/[name]`
- `git branch -d feature/[name]`
- `git push origin develop`

**Note:** Prompts are shown by the agent's workflow logic, not by the command itself. See `.cursor/rules/USER_CODING_RULES.md` (Rule 22) for complete workflow details.

### Feature Change

**Mode:** Ask Mode (planning/documenting)

Use `/feature-change` to handle feature pivots:

```
/feature-change vue-migration vue-migration-v2 architectural pivot needed
```

This will:
1. Document current feature state
2. Create feature-change documentation
3. Update current feature documents
4. Create checkpoint

**Note:** This command is for planning and should be used in Ask Mode. It outputs a plan, not an implementation.

### Mid-Session Change Requests

**IMPORTANT: Use for tracking changes mid-session**

**Mode:** Ask Mode (planning/documenting)

When users request changes during a session (e.g., naming convention changes, refactoring, architectural decisions), use `/session-change` to ensure the change is properly recorded and tracked across all relevant documentation.

**Note:** This command is for planning and should be used in Ask Mode. It records the change request and generates an action plan. Implementation requires switching to Agent Mode after approval.

**Command Usage:**

```
/session-change rename getChildrenOf to getGlobalRelationship throughout client for parallelism and better naming
```

or

```
/mid-session-change [description]
```

**What This Command Does:**

1. Parses conversational description into structured format
2. Identifies change type (naming, refactoring, architectural, other)
3. Extracts key information (old name → new name, files affected, etc.)
4. Generates concise directive
5. Identifies scope of impact (files, documentation, tiers)
6. Updates session log with change request entry
7. Generates action plan for implementation

**Output Format:**

```
## Change Request: Rename getChildrenOf to getGlobalRelationship

**Type:** Naming
**Session:** 2.2
**Date:** 2025-01-XX

### Directive
Rename `getChildrenOf` to `getGlobalRelationship` throughout the codebase for consistency and better naming clarity.

### Scope
**Files Affected:**
- `client-vue/src/stores/globalStore.ts`
- [Other files containing getChildrenOf]

**Documentation Affected:**
- Session Log: 2.2
- Session Handoff: 2.2
- Phase Guide: 2 (if applicable)

**Tiers Affected:**
- [x] Session-level docs
- [ ] Phase-level docs
- [ ] Task-level docs

### Action Plan
1. Search codebase for all occurrences of `getChildrenOf`
2. Update function/method names to `getGlobalRelationship`
3. Update all imports and usages
4. Update session log with change request entry
5. Verify no breaking changes

### Implementation Notes
This is a naming convention change for consistency and better clarity.
- Update all references, not just definitions
- Maintain backward compatibility during migration if needed
- Verify no breaking changes

**Status:** Pending
```

**When to Use:**

- Naming convention changes (e.g., "rename X to Y")
- Refactoring requests (e.g., "restructure component hierarchy")
- Architectural decisions (e.g., "change state management pattern")
- Any change that affects code AND documentation across tiers

**Note:** Change requests are automatically logged in the session log's "Change Requests" section. The command provides a clear action plan for implementation.

## Command Reference

**Three-Tier Structure:** Commands are organized by tier (Phase → Session → Task)

### Tier 1: Phase Commands (High-Level)

#### Phase Planning & Workflow
- `/plan-phase [N] [description]` - Phase planning with documentation checks (Tier 1)
- `/phase-start [N]` - Load phase guide and handoff, trigger session planning (Tier 1)
- `/phase-checkpoint [N]` - Mid-phase review after completing sessions (Tier 1)
- `/phase-end [N]` - Complete phase, update phase log/handoff (Tier 1)

**Note:** `/phase-end` should be called AFTER the agent workflow prompts the user for confirmation. See "Ending a Phase" section below.

### Tier 2: Session Commands (Medium-Level)

#### Session Planning & Workflow
- `/plan-session [X.Y] [description]` - Session planning, create session guide with task breakdown (Tier 2)
- `/session-start [X.Y] [description]` - Load session guide/handoff, trigger task planning (Tier 2)
- `/session-checkpoint [X.Y]` - Mid-session review after completing tasks (Tier 2)
- `/session-end [X.Y] [description] [next-session]` - Complete session, update session log/handoff/guide (Tier 2)
- `/session-change [description]` - Record mid-session change request (naming, refactoring, architectural) (Tier 2)
- `/mid-session-change [description]` - Alias for `/session-change` (Tier 2)
- `/change-request [description]` - Legacy alias for `/session-change` (deprecated, use /session-change instead) (Tier 2)

**Note:** `/session-end` should be called AFTER the agent workflow prompts the user for confirmation. See "Ending a Session" section above.

### Tier 3: Task Commands (Low-Level)

#### Task Planning & Workflow
- `/plan-task [X.Y.Z] [description]` - Task planning, fill out task embeds in session guide (Tier 3)
- `/task-start [X.Y.Z]` - Load task context from session guide (Tier 3)
- `/task-checkpoint [X.Y.Z] [notes]` - Task completion checkpoint (Tier 3)
- `/checkpoint [X.Y.Z] [notes]` - Alias for `/task-checkpoint` (backward compatibility)
- `/task-end [X.Y.Z]` - Complete task, update task log embedded in session log (Tier 3)

### Atomic Commands

#### Documentation Reading
- `/read-handoff` - Display transition context from session handoff document (minimal context only)
- `/read-guide` - Display relevant sections from session guide
- `/check-before-implement [type] [description]` - Consolidated documentation and pattern reuse check (combines check-docs and check-reuse)
- `/check-docs [type]` - Check documentation before implementing (component/transformer/pattern/migration) - Enforces Rule 21
- `/check-reuse [description]` - Check for reusable patterns before duplicating code - Enforces Rule 22

#### Quality Checks
- `/lint [target]` - Run linting (vue/server/all, default: all)
- `/type-check` - Run type checking for Vue app
- `/test [target] [--watch]` - Run tests (vue/server/all, default: vue)
- `/verify-app` - Verify app starts on port 3002

#### Task Management (Tier 3)
- `/create-session-label [X.Y] [description]` - Generate session label
- `/format-task-entry [X.Y.Z]` - Format task log entry (Tier 3)
- `/append-log [content]` - Append formatted entry to session log
- `/status` - Quick overview of current position (phase, next action, branch, last commit)
- `/mark-complete [X.Y.Z]` - Mark task complete in session handoff (Tier 3)
- `/add-task-section [X.Y.Z]` - Add formatted task section to session handoff (Tier 3)

#### Handoff Management (Tier 2)
- `/update-handoff-minimal` - Update session handoff with minimal transition context only (where we left off, what's next)
- `/update-guide` - Update session guide with instructions, patterns, or architectural notes
- `/update-next-action [action]` - Update "Next Action" in handoff
- `/update-timestamp` - Update "Last Updated" timestamp

#### Git Operations
- `/git-commit [message]` - Stage and commit (prompts with suggested message)
- `/git-push` - Push to current branch
- `/create-branch [name]` - Create new git branch

#### Utilities
- `/generate-prompt [X.Y] [description]` - Generate next session prompt (Tier 2)
- `/log-task [X.Y.Z]` - Add task entry to session log (Tier 3)
- `/scope-and-summarize [description]` - Analyze conversation context, determine tier, generate summary for change requests
  - Automatically reads conversation history from stdin, environment variable (`CURSOR_CONVERSATION_CONTEXT`), file, or parameter
  - Applies tier discriminator logic to determine appropriate tier (Feature/Phase/Session/Task)
  - Outputs formatted summary ready for `/session-change` or other change request commands
- `/scope-and-change [description]` - Analyze conversation context, determine tier, auto-execute change request for safe changes
  - Same context reading as `/scope-and-summarize`
  - Auto-executes change request if ALL criteria met: HIGH confidence, Session/Task tier, LOW complexity, ≤3 files, no dependencies, no research
  - Shows analysis and requires manual execution if criteria not met
  - Extracts current session/task/phase from context automatically

### Composite Commands

#### Quality Verification
- `/verify [target] [--test]` - Run all quality checks

#### Legacy/Backward Compatibility
- `/update-handoff` - Update handoff document with current progress (legacy - use update-handoff-minimal for new workflow)
- `/new-agent` - Prepare handoff for agent switch

## Command Chaining

Commands can be chained with `&&`:

```
/verify vue && /log-task 1.3.1 "Base API Client Setup" && /update-handoff
```

Each command returns a success/failure status. Failed commands stop chain execution.

## Examples

### Example 1: Quick Quality Check
```
/verify vue
```
Runs lint + type-check for Vue app

### Example 2: Full Quality Check with Tests
```
/verify vue --test
```
Runs lint + type-check + tests for Vue app

### Example 3: Three-Tier Workflow

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

### Example 4: Start Session with Context
```
/session-start 1.3 "API Clients"
```
Automatically loads session handoff + guide + creates session label, triggers task planning

### Example 5: Complete a Phase
```
/phase-end 1
```
Completes phase 1, updates phase log/handoff, prepares for next phase

### Example 6: Check Before Implementing
```
/check-before-implement component "field rendering"
```
Consolidated check: shows documentation and pattern reuse suggestions

### Example 7: Phase-Level Planning
```
/plan-phase 2 "State Management"
```
Use before large-scale, phase-level planning. Includes documentation checks.

### Example 8: Quick Status Check
```
/status
```
Quick overview: current phase, next action, git branch, last commit

### Example 9: Task Checkpoint
```
/task-checkpoint 1.3.1 "Completed API client setup"
```
Task-level quality check and log update without full end-of-session overhead

### Example 10: Scope and Summarize
```
/scope-and-summarize rename getChildrenOf to getGlobalRelationship throughout client
```
Analyzes the description, determines tier (likely Session), and generates formatted summary ready for change request.

Or pipe conversation context:
```
echo "We need to rename getChildrenOf to getGlobalRelationship" | /scope-and-summarize
```

Or use environment variable:
```
CURSOR_CONVERSATION_CONTEXT="..." /scope-and-summarize
```

### Example 11: Scope and Change (Auto-Execute)
```
/scope-and-change rename getChildrenOf to getGlobalRelationship
```
Analyzes the description, determines tier, and **automatically executes** the change request if safe (HIGH confidence, LOW complexity, ≤3 files, Session/Task tier).

**Small change (auto-executes):**
```
/scope-and-change rename getChildrenOf to getGlobalRelationship
## ✅ Auto-Executed: /session-change
[Shows executed change request]
```

**Large change (requires review):**
```
/scope-and-change migrate admin components to Vue.js
## ⚠️ Requires Review Before Execution
[Shows full analysis, requires manual execution]
```

Or pipe conversation context:
```
echo "We need to rename getChildrenOf" | /scope-and-change
```

### Example 12: Command Aliases (Recommended)
For faster typing, use these aliases:
- `/ss` → `/session-start`
- `/se` → `/session-end`
- `/v` → `/verify`
- `/s` → `/status`
- `/tc` → `/task-checkpoint` (or `/checkpoint`)
- `/sas` → `/scope-and-summarize`
- `/sac` → `/scope-and-change`

## Programmatic Usage

Commands can also be imported and used programmatically:

```typescript
import { sessionStart, verify, sessionEnd } from './cursor/commands';

// Start a session
const output = await sessionStart('1.3.2', 'Entity API Composables');
console.log(output);

// Run verification
const result = await verify('vue', false);
console.log(result.success ? 'All checks passed' : 'Checks failed');

// End a session
const endResult = await sessionEnd({
  taskId: '1.3.1',
  description: 'Base API Client Setup',
  // ... other params
});
```

## Error Handling

- Quality check failures stop execution (fail-fast)
- Git operations provide clear error messages
- File operations preserve existing content structure
- Commands return success/failure status for chaining

## File Paths

Commands operate on these files:
- Session logs: `.cursor/project-manager/features/vue-migration/sessions/session-[X.Y]-log.md` (session-specific)
- Handoff: `.cursor/project-manager/features/vue-migration/handoff.md`
- Session guides: `.cursor/project-manager/features/vue-migration/sessions/session-[X.Y]-guide.md` (session-specific)
- Phase guides: `.cursor/project-manager/features/vue-migration/phases/phase-[N]-guide.md` (phase-specific)

**Note:** Session logs are now session-specific (one log file per session). The old monolithic log file `.cursor/project-manager/features/vue-migration/log.md` is deprecated.

All paths are relative to the project root.

## Test Workflow Integration

### Test Strategy Documentation

All phases and sessions should document their test strategy:

**In Phase Guides:**
- Add a "Test Strategy" section documenting test requirements
- If tests are deferred, document why and when they will be added
- Include test coverage goals and test types (unit, integration, e2e)

**In Session Guides:**
- Document test requirements for the session
- If tests are deferred, document justification
- Link to test files or test todos

### Test Verification

**Session-End:**
- Automatically checks for test strategy or justification in session guide
- Logs test status if no documentation found
- Non-blocking (warns but doesn't fail)

**Phase-End:**
- Verifies test strategy exists in phase guide
- Checks all session guides for test documentation
- Warns if no test strategy or justification found
- Provides recommendations for documenting test requirements

### Test Creation

Tests can be created:
- During implementation (recommended)
- At session-end (if `runTests` parameter is true)
- At phase-end (if `runTests` parameter is true)
- Manually using `/test-template` command

If tests are deferred, document:
- Why tests are deferred
- When tests will be added (which phase/session)
- Test requirements for future implementation

## Troubleshooting

### Missing Todos

**Problem:** Phase or session todos are missing after planning.

**Solution:**
1. Check if planning commands were called (`/plan-phase`, `/plan-session`)
2. Todos are now created automatically (blocking) during planning
3. For retroactive fixes, use the todo creation utility:
   ```typescript
   import { createRetroactiveTodos } from './commands/todo/composite/create-retroactive-todos';
   await createRetroactiveTodos({ feature: 'vue-migration', phase: 3 });
   ```

### Missing Test Documentation

**Problem:** Phase-end warns about missing test strategy.

**Solution:**
1. Add "Test Strategy" section to phase guide
2. Document test requirements or justification for deferring tests
3. If tests are deferred, document when they will be added
4. Re-run `/phase-end` to verify

### Phase-End Not Triggered

**Problem:** Last session completed but phase-end wasn't triggered.

**Solution:**
1. Check if session-end detected it was the last session (check output)
2. Manually run `/phase-end [phase]` to complete the phase
3. Verify all sessions are marked complete in phase guide

### Session-End Doesn't Detect Last Session

**Problem:** Session-end doesn't prompt for phase-end when last session completes.

**Solution:**
1. Verify phase guide has all sessions listed
2. Check session ID format matches phase guide format
3. Manually check if all sessions are complete
4. Run `/phase-end` manually if needed

### Test Verification Fails

**Problem:** Phase-end test verification fails or warns.

**Solution:**
1. Add test strategy section to phase guide
2. Document test requirements or justification
3. Check session guides for test documentation
4. Re-run `/phase-end` to verify

