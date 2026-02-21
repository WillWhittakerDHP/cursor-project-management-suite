# Session [SESSION_ID] Guide: [DESCRIPTION]

**Purpose:** Session-level guide with task breakdown and learning goals

**Tier:** Session (Tier 2 - Medium-Level)

---

## Guide Structure

This template defines the standard structure for session guides. Session-specific guides should include all standard sections, which can be customized or reference this template.

### Standard Sections (Required)

These sections are extracted by workflow commands and should be included in all session guides:

- **Session Structure** - Session labeling format, task structure, session organization
- **Learning Checkpoints** - Learning-focused checkpoint process and format
- **Task Template** - Task planning and entry templates

**Note:** Session-specific guides can customize these sections or reference this template. If sections are missing, extraction will fall back to this template.

### Session-Specific Sections

These sections contain session-specific content:

- **Quick Start** - Session overview, learning goals, tasks (session-specific)
- **Session Workflow** - Workflow instructions (can customize for session needs)
- **Reference** - Links to templates and examples
- **Notes** - Session-specific notes and decisions

---

## Quick Start

### Session Overview

**Session ID:** [SESSION_ID]
**Session Name:** [DESCRIPTION]
**Description:** [Brief description of session objectives]

**Duration:** [Estimated hours/days]
**Status:** [Not Started / In Progress / Complete]

### Learning Goals

- [Learning goal 1]
- [Learning goal 2]
- [Learning goal 3]

### Tasks

- [ ] #### Task [SESSION_ID].1: [Task Name]
**Goal:** [Task goal]
**Files:** 
- [Files to work with]
**Approach:** [Approach to take]
**Checkpoint:** [What needs to be verified]

- [ ] #### Task [SESSION_ID].2: [Task Name]
**Goal:** [Task goal]
**Files:** 
- [Files to work with]
**Approach:** [Approach to take]
**Checkpoint:** [What needs to be verified]

---

## Session Workflow

### Before Starting a Session

**Recommended:** Use `/session-start [SESSION_ID] [description]` to automatically:
- Load key sections from session handoff document
- Load relevant sections from session guide
- Generate formatted session label with date/status
- Display compact prompt format for reference
- Trigger task planning (fill out task embeds in session guide)
- Set learning goals based on session
- Identify files to work with based on handoff "Next Action"

**IMPORTANT: Agent Response Format**

When agents respond to `/session-start` commands, they must follow the standardized response format defined in `.cursor/commands/tiers/session/templates/session-start-response-template.md`. The response should be concise, focused, and include:

- Current State (what's done ✅ vs missing ❌)
- Phase X.Y Objectives (numbered, actionable)
- Files to Work With (source and target)
- Implementation Plan (high-level steps)
- Key Differences: React vs Vue (brief)
- Learning Checkpoints
- Explicit approval request: "Should I proceed with implementing these changes, or do you want to review the plan first?"

See the template file for complete format, examples, and guidelines.

**Example:**
```
/session-start 1.3 "API Clients"
```

**Manual Alternative:**
1. **Label the session** with format below
2. **Review previous session notes** (if any)
3. **Set learning goals** for this session
4. **Identify files to work with**

### Session Labeling Format

Each session should start with:
```
## Session: [SESSION_ID] - [Brief Description]
**Date:** [Date]
**Duration:** [Estimated/Actual]
**Status:** [In Progress / Completed / Blocked]
**Agent:** [Current/New]
```

### During Session

1. **Work on one task at a time**
2. **Document decisions** inline in code
3. **Ask questions** as they arise

### After Each Task - Unified Checkpoint

**CRITICAL: Automatically pause and present checkpoint summary after each task.**

**Checkpoint Type:** Choose based on task complexity:
- **Simple tasks** (trivial changes, single file): Quick checkpoint (quality only)
- **Complex tasks** (new features, multiple files, architectural changes): Full checkpoint (quality + learning + optional feedback)

#### Quick Checkpoint Format (Simple Tasks)

```
## Checkpoint: Task [X.Y.Z]

**Completed:** [What was accomplished]
**Quality:** [Status from /checkpoint command]
**Next:** Task [X.Y.Z+1]: [Description]

[Wait for user review before continuing]
```

#### Full Checkpoint Format (Complex Tasks)

```
## Checkpoint: Task [X.Y.Z]

/**
 * WHY: *Learning:** (Optional - for complex tasks)
 */
- [Key concepts/patterns learned]
- [React → Vue differences if applicable]
- [Questions answered]

**Workflow Feedback:** (Optional - only if issues encountered)
- [Any problems managing this task workflow or issues with results?]

[Wait for user review before continuing]
```

#### Checkpoint Process

1. **Automatically pause** - After completing each task, stop and present checkpoint
2. **Run quality checks** - Use `/task-checkpoint [X.Y.Z]` command (or `/checkpoint` alias) to verify code compiles and passes checks
3. **Update progress** - Mark checkpoints in session log
4. **Wait for user review** - Do NOT continue to next task until:
   - User explicitly approves continuation, OR
   - User asks questions (answer them), OR
   - User requests changes (make them), OR
   - User ends the session

### End of Session

**CRITICAL: Prompt before ending session**

After completing the last task in a session, **prompt the user** before running `/session-end`:

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

**If user says "yes":**
- Run `/session-end` command automatically
- Complete all end-of-session steps (verify app, lint, build, update docs)
- **Workflow order:**
  1. Verify app starts
  2. Run lint/typecheck
  3. **Commit feature work** (before audits)
  4. Run code quality audit
  5. Update docs (session log, handoff, guide)
  6. **Commit audit fixes** (if any, separately from feature work)
  7. **After all commits are done, prompt for push:**
  ```
  ## Ready to Push?
  
  All session-end checks completed successfully:
  - ✅ App starts
  - ✅ Linting passed
  - ✅ Feature work committed
  - ✅ Audit fixes committed (if any)
  - ✅ Session log updated
  - ✅ Handoff document updated
  - ✅ Session guide updated
  
  **Ready to push all commits to remote?**
  
  This will:
  - Push feature work commit
  - Push audit fixes commit (if any)
  - Push to remote repository
  
  **Proceed with push?** (yes/no)
  ```
- **If user says "yes" to push:** Execute git push, then end session
- **If user says "no" to push:** End session without pushing (user can push manually later)
- **Agent:** After session-end returns, use the command result's `outcome.nextAction` for the exact next step (do not infer from step text).

**If user says "no" to session-end:**
- Address any requested changes
- Re-prompt when ready

**Recommended:** Use `/session-end [session-id] [description] [next-session]` to automatically complete all steps below.

**Manual Alternative (5 Steps):**

1. **Verify** - App starts (`/verify-app` or `npm run start:dev`) and quality checks pass (`/verify vue`)
2. **Document** - Update session log and handoff document (use `/log-task` and `/update-handoff-minimal` or manual)
3. **Commit** - Git commit and push (`/git-commit [message]` and `/git-push` or manual)
4. **Handoff** - Create compact prompt for next session:
   ```
   @.cursor/project-manager/features/vue-migration/handoff.md Continue Vue migration - start Session [X.Y] ([Description])
   ```
5. **Feedback** - Optional workflow feedback (only if issues encountered):
   - Were there any problems managing this session workflow or issues with results?
   - Note any sticking points or inefficiencies for future improvement

**Command Chaining Example:**
```
/verify-app && /verify vue && /log-task 1.3.1 "Base API Client Setup" && /update-handoff && /git-commit "Session 1.3" && /git-push
```

---

## Session Structure

### Session Labeling Format

Each session should start with:
```
## Session: [SESSION_ID] - [Brief Description]
**Date:** [Date]
**Duration:** [Estimated/Actual]
**Status:** [In Progress / Completed / Blocked]
**Agent:** [Current/New]
```

### Task Structure

Break each session into focused tasks. Each task should have:

- **Goal:** Clear objective for the task
- **Files:** Source and target files (if porting/migrating)
- **Approach:** How to accomplish the goal
- **Checkpoint:** What needs to be verified upon completion

**Task Format:**
```
#### Task [SESSION_ID].N: [Task Name]
**Goal:** [Task goal]
**Files:** 
- [Files to work with]
**Approach:** [Approach to take]
**Checkpoint:** [What needs to be verified]
```

### Session Organization

- **Quick Start:** Session overview, learning goals, tasks
- **Session Workflow:** Before/during/after session process
- **Reference:** Templates, examples, related documents
- **Notes:** Session-specific notes and decisions

---

## Learning Checkpoints

### Purpose

Learning checkpoints ensure understanding before moving forward. They're integrated into the unified checkpoint system.

### When to Use Learning Checkpoints

- **Complex tasks:** New concepts, architectural changes, framework transitions
- **Simple tasks:** Quick checkpoint (quality only) - learning optional

### Learning Checkpoint Process

After completing a task (especially complex ones), pause to:

1. **Review What Was Learned**
   - What patterns were used?
   - How does this differ from previous approaches?
   - What concepts need clarification?

2. **Verify Understanding**
   - Can you explain what was accomplished?
   - Do you understand the implementation?
   - Are there questions before continuing?

3. **Document Decisions**
   - Why was this approach chosen?
   - What alternatives were considered?
   - What might change later?

### Learning Checkpoint Format

Included in full checkpoint format:
```
**Learning:** (Optional - for complex tasks)
- [Key concepts/patterns learned]
- [Framework differences if applicable]
- [Questions answered]
```

---

## Task Template

### Task Planning Template

When planning a new task, use this structure:

```markdown
- [ ] #### Task [SESSION_ID].N: [Task Name]

**Goal:** [Clear, specific objective]

**Files:** 
- Source: `[source-path]` (if porting/migrating)
- Target: `[target-path]` (if creating new)

**Approach:** 
- [Step 1]
- [Step 2]
- [Step 3]

**Checkpoint:** 
- [What needs to be verified]
- [Quality criteria]
- [Learning goals if complex task]

**Learning Focus:** (Optional - for complex tasks)
- [Concept 1 to understand]
- [Concept 2 to understand]

**Dependencies:**
- [Prerequisite tasks or files]
```

### Task Entry Template (For Session Log)

When logging a completed task:

```markdown
### Task [X.Y.Z]: [Name] ✅
**Completed:** [Date]
**Goal:** [What was accomplished]

**Files Created:**
- `[path]` - [Description]

**Files Modified:**
- `[path]` - [Description]

**Concepts Learned:**
- **[Concept]**: [Explanation]

**Key Methods/Functions:**
- `methodName()` - [Description]

**Architecture Notes:**
- **[Pattern]**: [Explanation]

**Learning Checkpoint:**
- [x] [Checkpoint] ✅

**Questions Answered:**
- **[Question]** - [Answer]

**Next Task:**
- [X.Y.Z+1]: [Next task]
```

---

## Reference

### Document Responsibilities

- **Session Guide** (this file): Instructions for how to work (workflow, checkpoints, end-of-session)
- **Session Log**: Historical record of what happened (task entries, concepts learned, progress)
- **Session Handoff**: Transition context for next session (where we left off, what's next)

### Documentation Templates

**See `.cursor/commands/tiers/session/templates/session-log.md` for complete documentation templates.**

Templates include:
- Task entry format for session log
- Handoff document format
- Learning-focused task template

### Task Structure Examples

Break each session into focused tasks:

#### Example: Session 1.1 - Type Definitions
```
### Task 1.1.1: Core Entity Types
**Goal:** Port GlobalEntity types
**Files:** 
- frontend-root/src/global/types/globalEntityTypes.ts → frontend-root/src/types/entities.ts
**Learning Focus:** Understanding generic type patterns
**Checkpoint:** Types compile without errors

### Task 1.1.2: Primitive Types  
**Goal:** Port primitive type system
**Files:**
- frontend-root/src/global/types/globalPrimitiveTypes.ts → frontend-root/src/types/properties.ts
**Learning Focus:** Dynamic primitive system architecture
**Checkpoint:** Primitive types match React version
```

### Recommendations

1. **Start each session** using `/session-start [X.Y]` for consistent initialization
2. **Plan tasks** using `/plan-task [X.Y.Z]` to fill out task details in session guide
3. **Complete one task** before moving to the next
4. **Use `/verify vue`** frequently during development to catch errors early
5. **Choose checkpoint type** based on task complexity (quick vs full)
6. **Document as you go** - use `/log-task [X.Y.Z]` after each task
7. **End sessions** using `/session-end [X.Y] [description] [next-session]` for complete automation
8. **Review previous sessions** before starting new ones

**See `.cursor/commands/USAGE.md` for complete slash command documentation and examples.**

---

## Related Documents

- **Session Log:** `.cursor/project-manager/features/vue-migration/sessions/session-[X.Y]-log.md` (templates and historical record)
- **Session Handoff:** `.cursor/project-manager/features/vue-migration/sessions/session-[X.Y]-handoff.md` (transition context)
- **Phase Guide:** `.cursor/project-manager/features/vue-migration/phases/phase-[X]-guide.md` (phase-level context)

---

## Notes

[Session-specific notes, patterns, architectural decisions]
