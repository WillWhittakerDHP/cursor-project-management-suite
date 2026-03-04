# Session [SESSION_ID] Log: [DESCRIPTION]

**Purpose:** Track task completion and progress

**Tier:** Session (Tier 2 - Medium-Level)

**Note:** This template is the single source of truth for documentation templates. Session guides reference these templates rather than duplicating them.

---

## Session Status

**Session:** [SESSION_ID]
**Status:** [In Progress / Complete]
**Started:** [Date]
**Completed:** [Date] (if complete)

---

## Completed Tasks

### Task [SESSION_ID].1: [Task Name] ✅
**Completed:** [Date]
**Goal:** [What was accomplished]

**Files Created:**
- `frontend-root/src/[path]` - [Description]

**Files Modified:**
- `frontend-root/src/[path]` - [Description]

**Vue.js Concepts Learned:**
- **[Concept]**: [Explanation]

**React → Vue Differences:** (Optional - only during migration)
- React: [How React does it]
- Vue: [How Vue does it]
- Why: [Why the difference]

**Key Methods/Functions Ported:**
- `methodName()` - [Description]

**Architecture Notes:**
- **[Pattern]**: [Explanation]

**Checkpoint:**
- [x] [Checkpoint] ✅

**Questions Answered:**
- **[Question]** - [Answer]

**Next Task:**
- [SESSION_ID].2: [Next task]

**Workflow Feedback:** (Optional - only document if issues encountered)
- **User feedback:** [Any problems managing task workflow or issues with results]
- **AI observations:** [Sticking points, inefficiencies, or workflow friction encountered]
- **Improvements needed:** [Workflow improvements for future tasks]

---

## In Progress Tasks

### Task [SESSION_ID].Z: [Task Name] 🔄
**Started:** [Date]
**Current Status:** [What's being worked on]

---

## Change Requests

**Purpose:** Track mid-session change requests (naming changes, refactoring, architectural decisions) that affect code and documentation.

### Change Request [DATE]: [Brief Description]
**Type:** [Naming/Refactoring/Architectural/Other]
**Session:** [SESSION_ID]
**Date:** [Date]
**Status:** [Pending/In Progress/Complete]

**Directive:**
[Concise, actionable directive]

**Scope:**
**Files Affected:**
- [List of files or "Files will be identified during implementation"]

**Documentation Affected:**
- [List of documentation files]

**Tiers Affected:**
- [x] Session-level docs
- [ ] Phase-level docs
- [ ] Task-level docs

**Action Plan:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Implementation Notes:**
[Any important notes about the change]

---

## Session Summary

**Tasks Completed:** [X] of [Y]
**Key Decisions:** [List key decisions]
**Blockers:** [Any blockers encountered]
**Next Session:** [NEXT_SESSION]

**Workflow Feedback:** (Optional - only document if issues encountered)
- **User feedback:** [Any problems managing session workflow or issues with results]
- **AI observations:** [Sticking points, inefficiencies, or workflow friction encountered during session]
- **Improvements needed:** [Workflow improvements for future sessions]
- **Template updates:** [Any template improvements suggested]

---

## Documentation Templates

### Task Entry Template (For Session Log)

**Recommended:** Use `/log-task [X.Y.Z]` to automatically format and append entry.

**Manual Template:**
```markdown
### Task [X.Y.Z]: [Name] ✅
**Completed:** [Date]
**Goal:** [What we accomplished]

**Files Created:**
- `frontend-root/src/[path]` - [Description]

**Files Modified:**
- `frontend-root/src/[path]` - [Description]

**Vue.js Concepts Learned:**
- **[Concept]**: [Explanation]

**React → Vue Differences:** (Optional - only during migration)
- React: [How React does it]
- Vue: [How Vue does it]
- Why: [Why the difference]

**Key Methods/Functions Ported:**
- `methodName()` - [Description]

**Architecture Notes:**
- **[Pattern]**: [Explanation]

**Checkpoint:**
- [x] [Checkpoint] ✅

**Questions Answered:**
- **[Question]** - [Answer]

**Next Task:**
- [X.Y.Z+1]: [Next task]

**Workflow Feedback:** (Optional - only if issues encountered)
- [Any problems managing task workflow or issues with results?]
```

### Handoff Document Template (For Session Handoff)

```markdown
### Task [X.Y.Z]: [Name] ✅

**Goal:** [Goal]

**Source Files:**
- `frontend-root/src/[path]`

**Target Files:**
- `frontend-root/src/[path]` ✅

**Key Features:**
- **[Feature]**: [Description]

**Important Notes:**
- ✅ **Completed**: [What was completed]

**Architecture Notes:**
- **[Pattern]**: [Explanation]

**Vue.js Notes:**
- [Vue-specific notes]

**Completion Summary:**
- ✅ [Summary item]
```

### Task Planning Template

```markdown
### Task [X.Y.Z]: [Name]

**Goal:** [What we're accomplishing]

**Files:**
- Source: `frontend-root/src/[path]`
- Target: `frontend-root/src/[path]`

**Vue.js Concepts:**
- [Concept 1]: [Explanation]
- [Concept 2]: [Explanation]

**React → Vue Differences:**
- React: [How React does it]
- Vue: [How Vue does it]
- Why: [Why the difference]

**Checkpoint:**
- [ ] Code compiles
- [ ] Types are correct
- [ ] [Concept] verified
- [ ] [Pattern] verified

**Questions to Answer:**
- [Question 1]
- [Question 2]

**Next Steps:**
- [What comes next]
```

---

## Related Documents

- Session Guide: `.cursor/project-manager/features/vue-migration/sessions/session-[SESSION_ID]-guide.md`
- Session Handoff: `.cursor/project-manager/features/vue-migration/sessions/session-[SESSION_ID]-handoff.md`

---

## Quick Reference

### Session Status Legend
- ✅ Completed - Session finished successfully
- 🔄 In Progress - Currently working on this
- ⏸️ Paused - Temporarily stopped
- ❌ Blocked - Waiting on something
- 📋 Review - Focused on understanding concepts

### Checkpoint Status
- ✅ Verified - Concept/pattern verified
- ⚠️ Partial - Need more clarification
- ❌ Blocked - Need to revisit

---

## Notes

- Each session should be logged immediately after completion
- Checkpoints should be honest - it's okay to need clarification
- Questions are valuable - document them for future sessions
- Blockers should be addressed before moving forward

