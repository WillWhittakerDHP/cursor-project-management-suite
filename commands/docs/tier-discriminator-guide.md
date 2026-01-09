# Tier Discriminator Guide

## Overview

The tier discriminator helps identify the appropriate tier level for any request, preventing scope confusion and ensuring work is organized at the right level.

## Command

### `/tier-discriminator [description]` or `/what-tier [description]`

**Purpose:** Analyze request and determine appropriate tier level

**Usage:**
```
/tier-discriminator migrate admin components to Vue.js
/what-tier add user authentication
```

**Output Format:**
```
## Tier Analysis

**Recommended Tier:** [Feature/Phase/Session/Task]

**Reasoning:**
- [Reason 1]
- [Reason 2]
- [Reason 3]

**Suggested Command:**
[/command-name [parameters]]

**Scope Assessment:**
- Duration: [estimate]
- Complexity: [level]
- Dependencies: [list]
- Research Needed: [yes/no]
```

## Tier Criteria

### Feature Level (Tier 0 - Highest Level)

**Characteristics:**
- Major initiative spanning multiple phases
- Requires architectural decisions
- Needs new git branch (`feature/[name]`)
- Duration: Weeks to months
- External research required
- Multiple phases planned
- Significant impact on codebase

**Examples:**
- "Migrate entire application from React to Vue.js"
- "Build property management system"
- "Implement new authentication system"
- "Refactor entire data layer"

**Indicators:**
- Words: "migrate", "build", "implement", "refactor" (large scope)
- Multiple technologies/frameworks mentioned
- Architectural decisions needed
- Long-term initiative

**Suggested Command:**
```
/plan-feature [name] [description]
```

### Phase Level (Tier 1 - High-Level)

**Characteristics:**
- Major milestone within a feature
- Multiple sessions planned
- Duration: Weeks
- Significant scope
- Dependencies on other phases
- Part of larger feature

**Examples:**
- "Phase 1: Type definitions and core architecture"
- "Phase 2: Component migration"
- "Phase 3: State management migration"
- "Phase 4: Testing and validation"

**Indicators:**
- Part of larger initiative
- Multiple components/areas affected
- Clear milestone/deliverable
- Dependencies mentioned

**Suggested Command:**
```
/plan-phase [N] [description]
```

### Session Level (Tier 2 - Medium-Level)

**Characteristics:**
- Focused work within a phase
- Multiple tasks planned
- Duration: Hours to days
- Specific component/feature
- Clear objectives
- Part of phase

**Examples:**
- "Session 1.1: Port type definitions"
- "Session 2.3: Migrate Pinia stores"
- "Session 3.2: Build wizard components"
- "Session 4.1: Write integration tests"

**Indicators:**
- Specific component/feature mentioned
- Focused scope
- Clear deliverable
- Part of phase

**Suggested Command:**
```
/plan-session [X.Y] [description]
```

### Task Level (Tier 3 - Low-Level)

**Characteristics:**
- Single focused work item
- Duration: Minutes to hours
- Specific implementation
- Clear deliverable
- Part of session

**Examples:**
- "Task 1.1.1: Port GlobalEntity types"
- "Task 2.3.2: Create Pinia store for admin"
- "Task 3.2.1: Build form step component"
- "Task 4.1.3: Write test for fee calculation"

**Indicators:**
- Single file/function/component
- Very specific scope
- Quick implementation
- Part of session

**Suggested Command:**
```
/plan-task [X.Y.Z] [description]
```

## Decision Tree

### Step 1: Check Duration

**Weeks to months?** → Feature
**Weeks?** → Phase
**Hours to days?** → Session
**Minutes to hours?** → Task

### Step 2: Check Scope

**Multiple phases?** → Feature
**Multiple sessions?** → Phase
**Multiple tasks?** → Session
**Single work item?** → Task

### Step 3: Check Complexity

**Architectural decisions?** → Feature
**Significant scope?** → Phase
**Focused component?** → Session
**Specific implementation?** → Task

### Step 4: Check Dependencies

**New git branch needed?** → Feature
**Dependencies on other phases?** → Phase
**Dependencies on other sessions?** → Session
**Dependencies on other tasks?** → Task

### Step 5: Check Research Needs

**External research required?** → Feature
**Technology choices needed?** → Feature or Phase
**Pattern decisions needed?** → Phase or Session
**Implementation only?** → Task

## Examples

### Example 1: Feature Level

**Request:**
```
Migrate entire application from React to Vue.js
```

**Analysis:**
- Duration: Months
- Scope: Entire application
- Complexity: High (architectural decisions)
- Dependencies: Multiple phases
- Research: Yes (Vue.js patterns, migration strategies)

**Recommended Tier:** Feature

**Suggested Command:**
```
/plan-feature vue-migration "Migrate application from React to Vue.js"
```

### Example 2: Phase Level

**Request:**
```
Phase 2: Migrate admin components to Vue.js
```

**Analysis:**
- Duration: Weeks
- Scope: Admin components (multiple sessions)
- Complexity: Medium-High
- Dependencies: Depends on Phase 1 (types)
- Research: Some (component patterns)

**Recommended Tier:** Phase

**Suggested Command:**
```
/plan-phase 2 "Migrate admin components to Vue.js"
```

### Example 3: Session Level

**Request:**
```
Session 2.3: Migrate Pinia stores for admin
```

**Analysis:**
- Duration: Days
- Scope: Pinia stores (multiple tasks)
- Complexity: Medium
- Dependencies: Depends on Phase 2 sessions
- Research: Minimal (Pinia patterns)

**Recommended Tier:** Session

**Suggested Command:**
```
/plan-session 2.3 "Migrate Pinia stores for admin"
```

### Example 4: Task Level

**Request:**
```
Task 2.3.1: Create Pinia store for block types
```

**Analysis:**
- Duration: Hours
- Scope: Single store
- Complexity: Low-Medium
- Dependencies: Depends on session setup
- Research: None (implementation only)

**Recommended Tier:** Task

**Suggested Command:**
```
/plan-task 2.3.1 "Create Pinia store for block types"
```

## Edge Cases

### Case 1: Unclear Scope

**Request:**
```
Add user authentication
```

**Analysis:**
- Could be Feature (entire auth system)
- Could be Phase (auth within feature)
- Could be Session (auth component)

**Recommendation:**
- Ask clarifying questions:
  - "Is this a new feature or part of existing feature?"
  - "What's the scope? (entire system vs component)"
  - "How long will this take?"
- Use tier discriminator interactively
- Start with higher tier if uncertain (can break down later)

### Case 2: Multiple Tiers

**Request:**
```
Build property management system with admin interface, booking system, and reporting
```

**Analysis:**
- This is clearly a Feature (major initiative)
- Contains multiple phases (admin, booking, reporting)
- Each phase contains multiple sessions
- Each session contains multiple tasks

**Recommendation:**
- Start with Feature tier
- Break down into phases during planning
- Use tier discriminator for each phase

### Case 3: Refactoring

**Request:**
```
Refactor data transformation layer
```

**Analysis:**
- Could be Feature (entire layer)
- Could be Phase (within feature)
- Depends on scope

**Recommendation:**
- Assess scope first:
  - Entire layer? → Feature
  - Part of layer? → Phase or Session
- Use tier discriminator with more context

## Interactive Usage

### Prompt Pattern

When starting new work, use tier discriminator interactively:

```
User: "I want to add user authentication"

Agent: "Let me help determine the appropriate tier level. Can you clarify:
1. Is this a new feature or part of an existing feature?
2. What's the scope? (entire auth system vs single component)
3. How long do you estimate this will take?
4. Are there architectural decisions needed?"

User: "It's a new feature, entire auth system, weeks of work, needs research"

Agent: "Based on your answers, this is a Feature-level initiative. 
Recommended: /plan-feature user-authentication 'Build user authentication system'
Should I proceed with planning this feature?"
```

### When to Use

**Use tier discriminator when:**
- Starting new work
- Unsure which tier to use
- Scope is unclear
- Need to verify tier selection
- Planning complex work

**Don't use tier discriminator when:**
- Tier is clearly obvious
- Continuing existing work
- Working within established tier

## Best Practices

### 1. Use Early
- Run tier discriminator at the start of planning
- Verify tier selection before creating structure
- Adjust scope if tier seems wrong

### 2. Ask Questions
- If scope is unclear, ask clarifying questions
- Use tier discriminator interactively
- Gather context before deciding

### 3. Start High, Break Down
- If uncertain, start with higher tier
- Break down during planning phase
- Better to have too much structure than too little

### 4. Review Regularly
- Re-evaluate tier as work progresses
- Adjust if scope changes
- Use tier discriminator for mid-work changes

### 5. Document Decisions
- Record tier selection reasoning
- Update if tier changes
- Reference in planning documents

## Related Documents

- `.cursor/project-manager/docs/feature-tier-architecture.md` - Feature tier architecture
- `.cursor/commands/docs/atomic-commands-architecture.md` - Atomic commands
- `.cursor/rules/CODING_RULES_FOR_SETTINGS.md` - Workflow rules

