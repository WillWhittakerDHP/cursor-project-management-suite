# Template Usage Guide

**Purpose:** Guide for when and how to use workflow templates  
**Date Created:** 2025-11-16  
**Location:** `.cursor/commands/templates/`

---

## Overview

The workflow system includes 14 templates that provide consistent structure for documentation across all tiers (Feature → Phase → Session → Task). Templates ensure proper documentation patterns, reduce errors, and maintain consistency.

**Template Location:** `.cursor/commands/templates/`

---

## Template Categories

### Tier-Specific Templates (Guide/Log/Handoff Pattern)

Each tier follows a three-document pattern:
- **Guide:** Planning, architecture, objectives, implementation plan
- **Log:** Progress tracking, checkpoints, decisions, completion status
- **Handoff:** Transition context, current state, next steps, dependencies

### Special Templates

Templates for specific workflow operations:
- Approval prompts
- Phase changes
- Research questions
- Session-start responses

---

## Feature Templates

### When to Use

Use feature templates when:
- Starting a new major initiative spanning multiple phases
- Planning work that requires architectural decisions
- Creating work that needs a new git branch (`feature/[name]`)
- Work duration is weeks to months
- Work requires a mandatory research phase

### Templates

#### `feature-guide.md`
**Purpose:** Feature-level planning and architecture documentation

**When to Use:**
- Planning a new feature (`/plan-feature`)
- Documenting feature objectives and phases
- Recording research findings
- Defining success criteria

**Key Sections:**
- Feature Overview (name, description, status, duration)
- Research Phase (findings, decisions, technology choices, risks)
- Feature Objectives
- Phases Breakdown (with checkboxes for tracking)
- Dependencies
- Success Criteria
- Git Branch Strategy
- End of Feature Workflow

**Example Usage:**
```
/plan-feature user-authentication "Build user authentication system"
```
Creates: `.cursor/project-manager/features/user-authentication/feature-user-authentication-guide.md`

**Customization:**
- Add feature-specific sections as needed
- Expand research findings with detailed notes
- Add custom success criteria
- Include feature-specific dependencies

**Reference Example:**
See `.cursor/project-manager/features/vue-migration/feature-vue-migration-guide.md` for a filled-out example.

---

#### `feature-log.md`
**Purpose:** Feature-level progress tracking and decision log

**When to Use:**
- Tracking feature progress
- Recording major decisions
- Documenting checkpoints
- Logging phase completions

**Key Sections:**
- Feature Progress (overall status)
- Phase Completions (checkboxes)
- Major Decisions (with rationale)
- Checkpoints (dates and summaries)
- Blockers and Resolutions
- Completion Summary

**Example Usage:**
After completing a phase, update the feature log:
```markdown
### Phase 2: Authentication Middleware ✅
**Completed:** 2025-11-16
**Summary:** Implemented JWT-based authentication middleware
**Key Decisions:** Chose JWT over session-based auth for scalability
```

**Customization:**
- Add feature-specific tracking sections
- Include metrics or KPIs if relevant
- Document external dependencies or blockers

---

#### `feature-handoff.md`
**Purpose:** Transition context for feature handoff

**When to Use:**
- Handing off feature to another agent
- Documenting current state
- Recording next steps
- Listing dependencies

**Key Sections:**
- Current State (what's done, what's remaining)
- Next Steps (immediate actions)
- Dependencies (blockers, prerequisites)
- Context (important decisions, patterns)
- Questions/Concerns

**Example Usage:**
```markdown
## Current State
- Phase 1: Complete ✅
- Phase 2: In Progress (60% complete)
- Phase 3: Not Started

## Next Steps
1. Complete Phase 2 middleware implementation
2. Begin Phase 3 frontend integration
3. Update documentation

## Dependencies
- Waiting on API endpoint completion (blocked)
- Requires database migration (prerequisite)
```

**Customization:**
- Add feature-specific context sections
- Include architecture diagrams if helpful
- Document known issues or workarounds

---

## Phase Templates

### When to Use

Use phase templates when:
- Planning a major milestone within a feature
- Breaking down feature work into phases
- Work spans multiple sessions
- Work duration is weeks
- Significant scope requiring planning

### Templates

#### `phase-guide.md`
**Purpose:** Phase-level planning and objectives

**When to Use:**
- Planning a new phase (`/plan-phase`)
- Documenting phase objectives
- Breaking down sessions
- Defining phase success criteria

**Key Sections:**
- Phase Overview (number, name, description, duration, status)
- Phase Objectives
- Sessions Breakdown (with checkboxes)
- Dependencies
- Success Criteria
- End of Phase Workflow

**Example Usage:**
```
/plan-phase 2 "Implement authentication middleware"
```
Creates: `.cursor/project-manager/features/[name]/phases/phase-2-guide.md`

**Customization:**
- Add phase-specific architecture notes
- Include phase-specific dependencies
- Add custom success criteria
- Document phase-specific patterns

**Reference Example:**
See `.cursor/project-manager/features/vue-migration/phases/phase-1-guide.md` for a filled-out example.

---

#### `phase-log.md`
**Purpose:** Phase-level progress tracking

**When to Use:**
- Tracking phase progress
- Recording session completions
- Documenting phase decisions
- Logging checkpoints

**Key Sections:**
- Phase Progress (overall status)
- Session Completions (checkboxes)
- Decisions (with rationale)
- Checkpoints (dates and summaries)
- Blockers

**Example Usage:**
After completing a session, update the phase log:
```markdown
### Session 2.1: JWT Implementation ✅
**Completed:** 2025-11-16
**Summary:** Implemented JWT token generation and validation
**Key Decisions:** Used jsonwebtoken library for token handling
```

**Customization:**
- Add phase-specific metrics
- Include phase-specific blockers
- Document phase-specific patterns

---

#### `phase-handoff.md`
**Purpose:** Transition context for phase handoff

**When to Use:**
- Handing off phase to another agent
- Documenting phase completion
- Recording next phase steps

**Key Sections:**
- Current State
- Next Steps
- Dependencies
- Context

**Example Usage:**
```markdown
## Current State
- Session 2.1: Complete ✅
- Session 2.2: In Progress
- Session 2.3: Not Started

## Next Steps
1. Complete Session 2.2 (middleware integration)
2. Begin Session 2.3 (testing)
```

**Customization:**
- Add phase-specific context
- Include phase-specific dependencies

---

## Session Templates

### When to Use

Use session templates when:
- Planning focused work within a phase
- Breaking down phase work into sessions
- Work spans multiple tasks
- Work duration is hours to days
- Specific component/feature work

### Templates

#### `session-guide.md`
**Purpose:** Session-level planning with task breakdown

**When to Use:**
- Planning a new session (`/plan-session`)
- Documenting session objectives
- Breaking down tasks
- Setting learning goals

**Key Sections:**
- Quick Start (overview, learning goals, tasks)
- Session Workflow (before/during/after)
- Session Structure (labeling, task format)
- Learning Checkpoints
- Task Template
- Reference

**Example Usage:**
```
/plan-session 2.1 "Build login component"
```
Creates: `.cursor/project-manager/features/[name]/sessions/session-2.1-guide.md`

**Customization:**
- Add session-specific learning goals
- Customize task structure for session needs
- Add session-specific workflow steps
- Include session-specific patterns

**Reference Example:**
See `.cursor/project-manager/features/vue-migration/sessions/session-2.1-guide.md` for a filled-out example.

---

#### `session-log.md`
**Purpose:** Session-level progress tracking

**When to Use:**
- Tracking session progress
- Recording task completions
- Documenting learning checkpoints
- Logging decisions

**Key Sections:**
- Session Progress
- Task Entries (with learning notes)
- Concepts Learned
- Key Methods/Functions
- Architecture Notes
- Learning Checkpoints
- Questions Answered

**Example Usage:**
After completing a task, add to session log:
```markdown
### Task 2.1.1: Login Form Component ✅
**Completed:** 2025-11-16
**Goal:** Create Vue.js login form component

**Files Created:**
- `client-vue/src/components/auth/LoginForm.vue` - Login form component

**Concepts Learned:**
- **Vue 3 Composition API**: Using setup() function for component logic
- **Vuetify Forms**: Using VTextField and VBtn components

**Key Methods/Functions:**
- `handleSubmit()` - Form submission handler
- `validateForm()` - Form validation logic
```

**Customization:**
- Add session-specific learning sections
- Include session-specific patterns
- Document session-specific decisions

---

#### `session-handoff.md`
**Purpose:** Transition context for session handoff

**When to Use:**
- Handing off session to another agent
- Documenting session completion
- Recording next session steps

**Key Sections:**
- Current State
- Next Action (immediate next step)
- Files Modified
- Context
- Dependencies

**Example Usage:**
```markdown
## Current State
- Task 2.1.1: Complete ✅
- Task 2.1.2: Complete ✅
- Task 2.1.3: In Progress

## Next Action
Complete Task 2.1.3: Add form validation

## Files Modified
- `client-vue/src/components/auth/LoginForm.vue` - Added login form
```

**Customization:**
- Add session-specific context
- Include session-specific dependencies

---

## Special Templates

### `approval-prompt-template.md`
**Purpose:** Standardized approval prompt format

**When to Use:**
- Before ending a feature (`/end-feature`)
- Before critical operations
- When user approval is required

**Key Sections:**
- Ready to [Action]?
- What will happen
- Proceed? (yes/no)

**Example Usage:**
```markdown
## Ready to End Feature?

All phases complete. Ready to merge feature branch?

**This will:**
- Generate feature summary
- Merge feature/[name] → develop
- Delete feature branch
- Finalize documentation

**Proceed with /end-feature?** (yes/no)
```

**Customization:**
- Adjust prompt text for specific operations
- Add operation-specific details

---

### `phase-change-template.md`
**Purpose:** Document phase changes/pivots

**When to Use:**
- Handling phase pivots (`/change-phase`)
- Documenting architecture changes
- Recording scope changes

**Key Sections:**
- Change Summary
- Reason for Change
- Impact Assessment
- Updated Plan

**Example Usage:**
```markdown
## Phase Change: Phase 2 → Phase 3

**Reason:** Architecture pivot needed - switch from JWT to OAuth

**Impact:**
- Affects Sessions 2.1, 2.2, 2.3
- Requires new OAuth implementation
- Updates authentication flow

**Updated Plan:**
- New Phase 3: OAuth Implementation
- Sessions renumbered accordingly
```

**Customization:**
- Add change-specific sections
- Include impact analysis

---

### `research-question-template.md`
**Purpose:** Research phase question documentation

**When to Use:**
- During feature research phase (`/feature-atomic-research`)
- Documenting research findings
- Answering research questions

**Key Sections:**
- Question
- Answer
- Rationale
- References

**Example Usage:**
```markdown
### Architecture & Design - Question 1
**Question:** What architecture pattern should we use?

**Answer:** Three-layer architecture (Data, State, Presentation)

**Rationale:** Maintains separation of concerns, aligns with Vue.js patterns

**References:**
- Vue.js Composition API guide
- Pinia state management docs
```

**Customization:**
- Add research-specific sections
- Include additional references

---

### `session-start-response-template.md`
**Purpose:** Standardized session-start response format

**When to Use:**
- When agents respond to `/session-start` commands
- Providing consistent session initialization
- Setting clear expectations

**Key Sections:**
- Current State (done ✅ vs missing ❌)
- Phase X.Y Objectives
- Files to Work With
- Implementation Plan
- Key Differences (if applicable)
- Learning Checkpoints
- Explicit approval request

**Example Usage:**
```markdown
## Session 2.1: Build Login Component

### Current State
- ✅ Phase 2 guide created
- ✅ Session 2.1 planned
- ❌ Login component not started

### Phase 2.1 Objectives
1. Create Vue.js login form component
2. Implement form validation
3. Add authentication integration

### Files to Work With
- Source: `client/src/components/auth/LoginForm.tsx`
- Target: `client-vue/src/components/auth/LoginForm.vue`

### Implementation Plan
1. Create LoginForm.vue component
2. Port form logic from React version
3. Add Vuetify form components
4. Implement validation

### Key Differences: React vs Vue
- React: useState hooks → Vue: ref() or reactive()
- React: JSX → Vue: Template syntax
- React: PropTypes → Vue: TypeScript props

### Learning Checkpoints
- Understanding Vue 3 Composition API
- Vuetify form component usage
- Vue form validation patterns

**Should I proceed with implementing these changes, or do you want to review the plan first?**
```

**Customization:**
- Adjust sections for specific session needs
- Add session-specific learning goals

---

## Template Customization Guidelines

### What Can Be Customized

**Safe to Customize:**
- Section content (fill in template placeholders)
- Add feature/phase/session-specific sections
- Expand examples and explanations
- Add custom success criteria
- Include project-specific patterns

**Should Remain Standard:**
- Core structure (Guide/Log/Handoff pattern)
- Standard sections (Overview, Objectives, etc.)
- Checkbox formats for tracking
- File naming conventions
- Document location patterns

### Customization Examples

#### Example 1: Adding Feature-Specific Section
```markdown
## Feature Overview
[Standard template content]

## Custom: Performance Requirements
**Target Metrics:**
- Page load time: < 2 seconds
- API response time: < 500ms
- Bundle size: < 500KB
```

#### Example 2: Expanding Session Learning Goals
```markdown
### Learning Goals
- [Standard learning goal]
- [Standard learning goal]

### Advanced Learning Goals (Optional)
- [Advanced concept 1]
- [Advanced concept 2]
```

#### Example 3: Custom Task Format
```markdown
#### Task 2.1.1: [Task Name]
**Goal:** [Standard goal]

**Custom: Acceptance Criteria**
- [Criterion 1]
- [Criterion 2]

**Custom: Testing Requirements**
- [Test requirement 1]
- [Test requirement 2]
```

---

## Template Usage Workflow

### Creating New Documents

1. **Choose appropriate template** based on tier and purpose
2. **Copy template** to correct location:
   - Feature: `.cursor/project-manager/features/[name]/feature-[name]-[type].md`
   - Phase: `.cursor/project-manager/features/[name]/phases/phase-[N]-[type].md`
   - Session: `.cursor/project-manager/features/[name]/sessions/session-[X.Y]-[type].md`
3. **Fill in placeholders** with actual content
4. **Customize as needed** (add sections, expand content)
5. **Maintain standard structure** (keep core sections)

### Updating Existing Documents

1. **Follow template structure** when adding new sections
2. **Maintain consistency** with existing document style
3. **Update checkboxes** as work progresses
4. **Keep handoff documents current** (update regularly)

### Best Practices

1. **Use templates consistently** - Don't skip template sections
2. **Fill in all placeholders** - Complete template content
3. **Customize thoughtfully** - Add value, don't remove structure
4. **Keep templates updated** - Sync with workflow changes
5. **Reference examples** - Look at filled-out templates for guidance

---

## Template Reference

### Quick Reference Table

| Template | Tier | Purpose | When to Use |
|----------|------|---------|-------------|
| `feature-guide.md` | Feature | Planning | `/plan-feature` |
| `feature-log.md` | Feature | Tracking | Feature progress |
| `feature-handoff.md` | Feature | Transition | Feature handoff |
| `phase-guide.md` | Phase | Planning | `/plan-phase` |
| `phase-log.md` | Phase | Tracking | Phase progress |
| `phase-handoff.md` | Phase | Transition | Phase handoff |
| `session-guide.md` | Session | Planning | `/plan-session` |
| `session-log.md` | Session | Tracking | Session progress |
| `session-handoff.md` | Session | Transition | Session handoff |
| `approval-prompt-template.md` | All | Approval | Before critical ops |
| `phase-change-template.md` | Phase | Change | `/change-phase` |
| `research-question-template.md` | Feature | Research | Research phase |
| `session-start-response-template.md` | Session | Response | `/session-start` |

---

## Examples of Filled-Out Templates

### Feature Guide Example
See: `.cursor/project-manager/features/vue-migration/feature-vue-migration-guide.md`

**Key Features:**
- Complete research phase documentation
- Detailed phases breakdown
- Success criteria
- Git branch strategy

### Phase Guide Example
See: `.cursor/project-manager/features/vue-migration/phases/phase-1-guide.md`

**Key Features:**
- Phase objectives
- Sessions breakdown with checkboxes
- Dependencies
- Success criteria

### Session Guide Example
See: `.cursor/project-manager/features/vue-migration/sessions/session-2.1-guide.md`

**Key Features:**
- Learning goals
- Task breakdown
- Session workflow
- Learning checkpoints

---

## Troubleshooting

### Common Issues

**Issue:** Template placeholders not filled
**Solution:** Ensure all `[PLACEHOLDER]` text is replaced with actual content

**Issue:** Missing sections
**Solution:** Check template for required sections and add any missing ones

**Issue:** Inconsistent structure
**Solution:** Follow template structure exactly, customize only content

**Issue:** Checkboxes not updating
**Solution:** Update checkboxes (`- [ ]` → `- [x]`) as work progresses

---

## Related Documentation

- **Feature Tier Architecture:** `.cursor/project-manager/docs/feature-tier-architecture.md`
- **Workflow Manager Handoff:** `.cursor/project-manager/WORKFLOW_MANAGER_HANDOFF.md`
- **Template Files:** `.cursor/commands/templates/`

---

**End of Template Usage Guide**

*This guide should be updated when templates are modified or new templates are added.*

