# Workflow Command Chain Guide

**Purpose:** Complete guide to the workflow command chain, including planning, execution, completion, and change request workflows.

---

## Overview

The workflow manager uses a three-tier structure:
- **Phase** (Tier 1) - High-level milestones
- **Session** (Tier 2) - Medium-level work sessions
- **Task** (Tier 3) - Low-level implementation tasks

Each tier has planning, execution, and completion commands that integrate with todos, tests, and documentation.

---

## Complete Command Chain

### Planning Phase

```
/plan-phase [N] [description]
  ↓
  Creates phase guide
  ↓
  Creates phase todo (BLOCKING)
  ↓
  Verifies todo exists
  ↓
  Documents test strategy
```

**Output:**
- Phase guide created
- Phase todo created and verified
- Test strategy section added

### Planning Session

```
/plan-session [X.Y] [description]
  ↓
  Creates session guide
  ↓
  Creates session todo (BLOCKING)
  ↓
  Verifies todo exists
  ↓
  Extracts tasks from guide
  ↓
  Creates task todos (BLOCKING)
  ↓
  Verifies task todos exist
  ↓
  Documents test strategy
```

**Output:**
- Session guide created
- Session todo created and verified
- Task todos created and verified
- Test strategy section added

### Execution Workflow

```
/session-start [X.Y] [description]
  ↓
  Loads session guide
  ↓
  Loads handoff document
  ↓
  Verifies todos exist
  ↓
  Creates session label
  ↓
  Triggers task planning
```

**Output:**
- Session context loaded
- Todos verified
- Ready for task work

### Completion Workflow

#### Session-End

```
/session-end [X.Y] [description] [next-session]
  ↓
  Verify app starts
  ↓
  Run quality checks (lint + type-check)
  ↓
  Run tests (if requested)
  ↓
  Check test strategy/justification
  ↓
  Update session log
  ↓
  Update handoff document
  ↓
  Update session guide (if needed)
  ↓
  Mark session complete in phase guide
  ↓
  Check if last session in phase
  ↓
  If last session: Prompt for /phase-end
  ↓
  Commit and push (optional)
```

**Output:**
- Session log updated
- Handoff updated
- Session marked complete
- Phase-end prompt (if last session)

#### Phase-End

```
/phase-end [N]
  ↓
  Mark phase complete in phase guide
  ↓
  Update phase log
  ↓
  Verify test strategy/justification
  ↓
  Update handoff document
  ↓
  Run tests (if requested)
  ↓
  Security audit (optional)
  ↓
  Commit and push
```

**Output:**
- Phase log updated
- Test verification completed
- Phase marked complete
- Handoff updated

---

## Change Request Workflow

### Session Change

```
/session-change [description]
  ↓
  Parse change description
  ↓
  Identify change type (naming/refactoring/architectural)
  ↓
  Extract scope (files, documentation, tiers)
  ↓
  Update session log with change request
  ↓
  Generate action plan
  ↓
  [If scope change significant:]
  ↓
  Call /plan-session (re-plan)
  ↓
  Create/update todos
  ↓
  Update logs
```

**Output:**
- Change request logged
- Action plan generated
- Todos updated (if re-planning needed)

### Phase Change

```
/phase-change [N] [description]
  ↓
  Parse change description
  ↓
  Assess scope change
  ↓
  Update phase log
  ↓
  [If scope change significant:]
  ↓
  Call /plan-phase (re-plan)
  ↓
  Create/update todos
  ↓
  Update logs
```

**Output:**
- Change request logged
- Phase re-planned (if needed)
- Todos updated

---

## Todo Integration

### Todo Creation Flow

**Planning Commands:**
- `/plan-phase` → Creates phase todo (BLOCKING)
- `/plan-session` → Creates session todo + task todos (BLOCKING)
- `/plan-task` → Creates task todo (BLOCKING)

**Verification:**
- Todos are verified after creation
- Planning fails if todo creation fails
- Todos linked to planning documents

**Retroactive Creation:**
- Use `createRetroactiveTodos()` utility for phases created manually
- Extracts todos from planning documents
- Creates todos for phase, sessions, and tasks

### Todo Update Flow

**Change Requests:**
- Minor changes → Update todos directly
- Significant changes → Re-plan (creates new todos)
- Scope changes → Propagate to child todos

**Completion:**
- Session-end → Updates todo status
- Phase-end → Updates todo status
- Todos marked complete when work done

---

## Test Integration

### Test Strategy Documentation

**Planning:**
- Phase guides include "Test Strategy" section
- Session guides include test requirements
- Test todos created if tests required

**Execution:**
- Tests created during implementation (recommended)
- Tests created at session-end (if requested)
- Tests created at phase-end (if requested)

**Verification:**
- Session-end checks for test strategy/justification
- Phase-end verifies test strategy exists
- Warns if no test documentation found

### Test Justification

If tests are deferred, document:
- Why tests are deferred
- When tests will be added (which phase/session)
- Test requirements for future implementation

---

## Auto-Trigger Flow

### Session-End → Phase-End

```
Session-end completes
  ↓
  Check if last session in phase
  ↓
  If yes:
    - Detect all sessions complete
    - Prompt user to run /phase-end
    - Provide clear instructions
  ↓
  If no:
    - Continue to next session
```

**Detection:**
- Reads phase guide to find all sessions
- Checks if current session is last in sorted list
- Verifies all sessions marked complete

---

## Command Integration Points

### Planning Commands Should:
1. ✅ Create todos (BLOCKING)
2. ✅ Verify todos exist after creation
3. ✅ Document test strategy
4. ✅ Create test todos if tests required
5. ✅ Link todos to planning documents

### Execution Commands Should:
1. ✅ Verify todos exist before starting
2. ✅ Create missing todos if planning was manual
3. ✅ Load planning documents

### Completion Commands Should:
1. ✅ Update logs (session/phase/feature)
2. ✅ Update todo status
3. ✅ Create tests (if required) or document justification
4. ✅ Verify tests exist or justification documented
5. ✅ Update handoff documents
6. ✅ Trigger parent tier completion if appropriate

### Change Request Commands Should:
1. ✅ Assess scope change (significant vs minor)
2. ✅ Call planning commands if scope change significant (re-plan)
3. ✅ Update todos directly if scope change minor
4. ✅ Update logs
5. ✅ Create new todos if scope changes add tasks
6. ✅ Propagate changes to child todos
7. ✅ Trigger end commands if change completes work

---

## Decision Trees

### When to Call Planning Commands

```
New phase/session?
  ↓ Yes
  → Call /plan-phase or /plan-session
  ↓
  Todos created automatically
  ↓
  Test strategy documented
```

### When to Re-Plan

```
Change request received?
  ↓ Yes
  → Assess scope change
  ↓
  Significant change?
    ↓ Yes
    → Call planning command (re-plan)
    → Create/update todos
    ↓ No
    → Update todos directly
    → Update logs
```

### When to Trigger Phase-End

```
Session-end completes?
  ↓ Yes
  → Check if last session in phase
  ↓
  Last session?
    ↓ Yes
    → Prompt for /phase-end
    ↓ No
    → Continue to next session
```

---

## Examples

### Complete Phase Workflow

```
1. /plan-phase 3 "Property System Refactor"
   → Creates phase guide + phase todo

2. /plan-session 3.1 "SchemaProp System Simplification"
   → Creates session guide + session todo + task todos

3. /session-start 3.1 "SchemaProp System Simplification"
   → Loads context, verifies todos

4. [Work on tasks...]

5. /session-end 3.1 "SchemaProp System Simplification" 4.1
   → Updates logs, checks test docs, detects last session
   → Prompts for /phase-end

6. /phase-end 3
   → Verifies test strategy, updates phase log
   → Marks phase complete
```

### Change Request Workflow

```
1. User requests change mid-session

2. /session-change "Rename X to Y"
   → Logs change request
   → Assesses scope
   ↓
   Minor change?
     → Updates todos directly
     → Updates logs
   ↓
   Significant change?
     → Calls /plan-session (re-plan)
     → Creates new todos
     → Updates logs
```

---

## Troubleshooting

### Missing Todos
- Check if planning commands were called
- Use retroactive todo creation utility
- Verify todos exist after planning

### Missing Test Documentation
- Add test strategy section to guides
- Document test requirements or justification
- Re-run phase-end to verify

### Phase-End Not Triggered
- Check session-end output for last session detection
- Manually run /phase-end if needed
- Verify all sessions complete

---

## Related Documents

- **USAGE.md** - Command reference and usage examples
- **plan.plan.md** - Workflow manager integration plan
- **Planning Templates** - `.cursor/commands/tiers/*/templates/`

