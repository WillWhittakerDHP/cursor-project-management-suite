---
alwaysApply: true
---

# User Coding Rules for Cursor Settings

Personal preferences, communication style, learning-focused rules, and workflow preferences.

## COMMUNICATION PREFERENCE

### Rule 9: Supportive and Explicit Communication
I am new to coding, so use best practice strategies and architectures that you explicitly describe with professional naming and explicit descriptions, delivered in a supportive tone. Explain architectural decisions and patterns clearly.

**Guidelines:**
- Explain why patterns are used, not just what they do
- Use professional terminology but define it when first introduced
- Be supportive and educational in tone
- Reference codebase examples when explaining concepts
- Break down complex ideas into understandable steps

---

## LEARNING-FOCUSED RULES

### Rule 14: Educational Code Comments
Add explanatory comments for complex patterns, new concepts, and framework transitions. Explain "why" not just "what". Use comment patterns: LEARNING (new concepts), WHY (rationale), COMPARISON (React vs Vue.js), PATTERN (architectural patterns), RESOURCE (learning links).

**Bad Example:**
```typescript
// No explanation
const doubled = computed(() => value.value * 2);
```

**Good Example:**
```typescript
/**
 * LEARNING: Vue.js Computed Properties
 * 
 * In React: useMemo(() => value * 2, [value])
 * In Vue.js: computed() automatically tracks dependencies
 * 
 * WHY: Vue's reactivity system handles dependency tracking automatically,
 * reducing bugs from forgotten dependencies.
 * 
 * COMPARISON: React requires explicit dependency array, Vue tracks automatically
 * 
 * RESOURCE: https://vuejs.org/guide/essentials/computed.html
 */
const doubled = computed(() => value.value * 2);
```

**Codebase Reference:** See `LEARNING_STRATEGIES.md` for comment pattern guidelines.

---

### Rule 15: Learning Checkpoints
Identify natural pause points for understanding without disrupting flow. After component creation, pattern introduction, complex logic, or integration, provide optional explanations. Use checkpoint questions: What does this do? Why was it written this way? How does it work? When would I use this? Where else is this pattern used?

**Implementation:**
- After significant code changes, offer brief summary of what was learned
- When introducing new patterns, explain the pattern and its rationale
- At integration points, explain how pieces work together
- Make explanations optional and non-disruptive

**Codebase Reference:** See `LEARNING_STRATEGIES.md` for checkpoint guidelines.

---

### Rule 16: Pattern Explanation
Explain architectural decisions and why patterns were chosen. Compare alternatives considered. Link to learning resources. When introducing new patterns, explain how they relate to existing codebase patterns.

**Bad Example:**
```typescript
// Just implementing without explanation
const state = reactive({ count: 0 });
```

**Good Example:**
```typescript
/**
 * PATTERN: Vue.js Reactive State
 * 
 * WHY: Using reactive() instead of ref() because we have an object.
 * ref() is better for primitives, reactive() for objects.
 * 
 * ALTERNATIVES CONSIDERED:
 * - ref({ count: 0 }) - Works but less idiomatic for objects
 * - Pinia store - Overkill for component-local state
 * 
 * RELATES TO: Our AdminContext uses similar reactive patterns
 * See: client/src/admin/contexts/adminContext.tsx
 * 
 * RESOURCE: https://vuejs.org/guide/essentials/reactivity-fundamentals.html
 */
const state = reactive({ count: 0 });
```

**Codebase Reference:** See `AGENTIC_AI_APPROACHES.md` for pattern connection strategies.

---

### Rule 17: Progressive Complexity
Start simple, add complexity gradually. Explain each layer as it's added. Build understanding incrementally. Document learning progression from simple working code → type safety → validation → error handling.

**Example:**
```typescript
/**
 * LEARNING PROGRESSION:
 * 
 * Layer 1: Basic functionality (count + increment)
 * Layer 2: Type safety added (TypeScript types)
 * Layer 3: Validation added (prevent negative amounts)
 * Layer 4: Error handling added (catch and log errors)
 * 
 * Each layer builds on the previous, teaching incremental improvement.
 */
const count = ref<number>(0);
const increment = (amount: number = 1): void => {
  try {
    if (amount <= 0) throw new Error('Amount must be positive');
    count.value += amount;
  } catch (error) {
    console.error('Increment failed:', error);
  }
};
```

**Codebase Reference:** See `LEARNING_STRATEGIES.md` for progressive complexity examples.

---

### Rule 18: Active Learning Encouragement
Encourage experimentation and understanding. After implementing code, suggest modifications to try, related concepts to explore, and practice opportunities. Explain trade-offs in decisions. Connect new code to existing patterns in the codebase.

**Implementation:**
- After code changes, suggest: "Try modifying X to see how Y works"
- When introducing concepts, suggest: "This pattern is also used in Z"
- Explain trade-offs: "We chose X over Y because..."
- Provide learning opportunities: "To deepen understanding, try..."

**Codebase Reference:** See `LEARNING_STRATEGIES.md` for active learning techniques and `AGENTIC_AI_APPROACHES.md` for adaptive learning support.

---

## SESSION WORKFLOW RULES

### Rule 19: Three-Tier Structured Workflow Management (REMOVED)

**This rule has been removed and replaced by Rule 22.**

**Action Required:** Use **Rule 22: Four-Tier Structured Workflow Management** instead.

**Reason for Removal:**
- The workflow system now uses a four-tier structure (Feature → Phase → Session → Task)
- Rule 19 described the legacy three-tier structure (Phase → Session → Task)
- Keeping deprecated content caused confusion and potential misuse
- All relevant content has been incorporated into Rule 22

**See:** Rule 22 for the current workflow structure, commands, and file paths.

---

### Rule 22: Four-Tier Structured Workflow Management (Feature Tier)

Follow the four-tier workflow structure (Feature → Phase → Session → Task) for all coding work. Use tier-specific commands to automate workflow at each level. Update tier-specific logs, maintain tier-specific handoff documents, and verify completion.

**Four-Tier Structure:**

0. **Feature (Tier 0 - Highest Level)**: Major initiatives spanning multiple phases, weeks/months of work
   - Feature Guide: `.cursor/workflow/features/[name]/feature-[name]-guide.md`
   - Feature Log: `.cursor/workflow/features/[name]/feature-[name]-log.md`
   - Feature Handoff: `.cursor/workflow/features/[name]/feature-[name]-handoff.md`
   - Templates: `.cursor/workflow/templates/feature-*.md`
   - Commands: `/plan-feature`, `/start-feature`, `/checkpoint-feature`, `/end-feature`, `/change-feature`
   - Atomic Commands: `/feature-atomic-create`, `/feature-atomic-research`, `/feature-atomic-load`, `/feature-atomic-checkpoint`, `/feature-atomic-summarize`, `/feature-atomic-close`
   - Git Branch: `feature/[name]` (branches from `develop`)

1. **Phase (Tier 1 - High-Level)**: Multiple sessions, weeks of work, major milestones within a feature
   - Phase Guide: `.cursor/workflow/features/[name]/phases/phase-[N]-guide.md`
   - Phase Log: `.cursor/workflow/features/[name]/phases/phase-[N]-log.md`
   - Phase Handoff: `.cursor/workflow/features/[name]/phases/phase-[N]-handoff.md`
   - Templates: `.cursor/workflow/templates/phase-*.md`
   - Commands: `/plan-phase`, `/start-phase`, `/checkpoint-phase`, `/end-phase`, `/change-phase`
   - Atomic Commands: `/phase-atomic-create`, `/phase-atomic-load`, `/phase-atomic-checkpoint`, `/phase-atomic-summarize`, `/phase-atomic-close`

2. **Session (Tier 2 - Medium-Level)**: Multiple tasks, hours/days of work, focused feature/component within a phase
   - Session Guide: `.cursor/workflow/features/[name]/sessions/session-[X.Y]-guide.md`
   - Session Log: `.cursor/workflow/features/[name]/sessions/session-[X.Y]-log.md`
   - Session Handoff: `.cursor/workflow/features/[name]/sessions/session-[X.Y]-handoff.md`
   - Templates: `.cursor/workflow/templates/session-*.md`
   - Commands: `/plan-session`, `/start-session`, `/checkpoint-session`, `/end-session`, `/change-session`
   - Atomic Commands: `/session-atomic-create`, `/session-atomic-load`, `/session-atomic-checkpoint`, `/session-atomic-summarize`, `/session-atomic-close`

3. **Task (Tier 3 - Low-Level)**: Single focused work item, minutes/hours, specific implementation within a session
   - Task details embedded in session guide/log/handoff (not separate files)
   - Commands: `/plan-task`, `/start-task`, `/checkpoint-task`, `/end-task`
   - Atomic Commands: `/task-atomic-create`, `/task-atomic-load`, `/task-atomic-checkpoint`, `/task-atomic-close`

**Feature Structure Requirements (Tier 0):**

**Before Starting a Feature:**
- Use `/plan-feature [name] [description]` to plan feature with mandatory research phase
- Complete research phase (answer 30+ questions)
- Use `/start-feature [name]` to create git branch and load feature context
- Review feature guide and research findings

**Feature Research Phase (Mandatory):**
- Every feature **must** include a research phase before implementation
- Use `/feature-atomic-research [name]` to conduct research phase
- Answer all research questions (30+ questions covering architecture, scope, external research, risks, testing, documentation)
- Document research findings in feature guide
- Update feature log with research phase entry

**During Feature:**
- Work on phases within feature (use phase commands)
- Create feature checkpoints: `/checkpoint-feature [name]`
- Document key decisions in feature log
- Update feature handoff regularly

**End of Feature:**

**CRITICAL: Prompt before ending feature**

After completing all phases in a feature, **prompt the user** before running `/end-feature`:

```
## Ready to End Feature?

All phases complete. Ready to merge feature branch?

**This will:**
- Generate feature summary
- Merge feature/[name] → develop
- Delete feature branch
- Finalize documentation

**Proceed with /end-feature?** (yes/no)
```

**If user says "yes":**
- Run `/end-feature` command automatically
- Complete all feature-end steps (verify completion, update docs, generate summary)
- **After all checks pass and docs are updated, prompt for commit/merge/push:**
  ```
  ## Ready to Commit, Merge, and Push?
  
  All feature-end checks completed successfully:
  - ✅ Feature summary generated
  - ✅ Feature documentation closed
  - ✅ All documentation updated
  
  **Ready to commit, merge, and push all changes?**
  
  This will:
  - Commit all changes with feature completion message
  - Merge feature/[name] → develop
  - Delete feature branch
  - Push to remote repository
  
  **Proceed with commit, merge, and push?** (yes/no)
  ```
- **If user says "yes" to commit/merge/push:** Execute git commit, merge, delete branch, and push, then end feature
- **If user says "no" to commit/merge/push:** End feature without committing (user can commit and merge manually later)

**If user says "no" to feature-end:**
- Address any requested changes
- Re-prompt when ready

**Note:** Prompts are shown by the agent's workflow logic (not by the command itself) to give users control before committing changes.

**Command Usage:**
- Use `/end-feature [name]` to complete the workflow
- Command automatically: generates summary, closes documentation, then prompts for commit/merge/push before executing git operations

**Git Branch Strategy:**
- Feature branches branch from `develop` (not `main`)
- Branch naming: `feature/[name]`
- Created at feature start (`/start-feature`)
- Merged at feature end (`/end-feature`)
- Deleted after merge

**Tier Discriminator:**
- Use `/tier-discriminator [description]` or `/what-tier [description]` to identify appropriate tier level
- Helps prevent scope confusion
- Provides recommendations for tier selection

**Command Usage Examples:**

**Example: Planning a New Feature**
```
User: /plan-feature user-authentication "Build user authentication system"

Agent: 
1. Creates feature structure
2. Presents research question set (30+ questions)
3. Guides user through research phase
4. Documents research findings
5. Creates feature guide, log, and handoff
```

**Example: Starting a Feature**
```
User: /start-feature user-authentication

Agent:
1. Creates git branch: feature/user-authentication
2. Loads feature context
3. Creates initial checkpoint
4. Prepares feature for work
```

**Example: Feature Pivot Change**
```
User: /change-feature user-authentication user-auth "Simplify naming and scope"

Agent:
1. Documents current feature state
2. Creates feature-change documentation
3. Updates feature documents
4. Initializes new feature structure (if name change)
5. Creates checkpoint
```

**Example: Ending a Feature**
```
User: /end-feature user-authentication

Agent:
1. Generates feature summary
2. Prompts user before merging
3. Merges feature/user-authentication → develop
4. Deletes feature branch
5. Finalizes documentation
```

**Example: Planning a Phase**
```
User: /plan-phase 2 "Implement authentication middleware"

Agent:
1. Creates phase structure (guide, log, handoff)
2. Documents phase objectives
3. Plans sessions within phase
```

**Example: Starting a Phase**
```
User: /start-phase 2 "Implement authentication middleware"

Agent:
1. Checks if phase exists, creates if needed
2. Loads phase context
3. Creates checkpoint
```

**Example: Phase Pivot Change**
```
User: /change-phase 2 3 "Architecture pivot needed - switch from JWT to OAuth"

Agent:
1. Documents current phase state
2. Creates phase-change documentation
3. Updates phase documents
4. Initializes new phase structure
5. Creates checkpoint
```

**Example: Ending a Phase**
```
User: /end-phase 2

Agent:
1. Generates phase summary
2. Closes phase documentation
3. Updates feature log
```

**Example: Planning a Session**
```
User: /plan-session 2.1 "Build login component"

Agent:
1. Creates session structure (guide, log, handoff)
2. Documents session objectives
3. Plans tasks within session
```

**Example: Starting a Session**
```
User: /start-session 2.1 "Build login component"

Agent:
1. Checks if session exists, creates if needed
2. Loads session context
3. Creates checkpoint
4. Presents standardized session-start response format
```

**Example: Mid-Session Change**
```
User: /change-session 2.1 "Rename getUserData to fetchUserProfile for consistency"

Agent:
1. Records change request in session log
2. Identifies scope of impact (files, documentation)
3. Generates action plan
4. Updates relevant documentation
5. Provides clear output with action plan
```

**Example: Ending a Session**
```
User: /end-session 2.1

Agent:
1. Generates session summary
2. Closes session documentation
3. Updates phase log
```

**Example: Planning a Task**
```
User: /plan-task 2.1.1 "Create login form component"

Agent:
1. Adds task to session guide
2. Documents task objectives
3. Sets task scope
```

**Example: Starting a Task**
```
User: /start-task 2.1.1

Agent:
1. Loads task context from session guide
2. Prepares task for work
```

**Example: Ending a Task**
```
User: /end-task 2.1.1

Agent:
1. Marks task as complete
2. Updates session log
3. Documents task outcomes
```

**Codebase Reference:** 
- Feature Guide: `.cursor/workflow/features/[name]/feature-[name]-guide.md` (feature objectives, phases breakdown)
- Feature Templates: `.cursor/workflow/templates/feature-*.md` (reusable templates)
- Feature Architecture: `.cursor/workflow/docs/feature-tier-architecture.md` (complete feature tier architecture)
- Atomic Commands: `.cursor/workflow/docs/atomic-commands-architecture.md` (atomic commands documentation)
- Tier Discriminator: `.cursor/workflow/docs/tier-discriminator-guide.md` (tier selection guide)
- Research Questions: `.cursor/workflow/docs/research-question-set.md` (30+ research questions)
- Commands: `.cursor/commands/` (see `USAGE.md` for command documentation)

**Scope:** Applies to all coding work, especially major initiatives spanning multiple phases. Each tier has its own commands, documents, and workflow. Features contain phases, phases contain sessions, sessions contain tasks.

**Exception:** Quick fixes or single-file changes may skip full feature structure, but should still verify app starts and linting passes.

---

## ATOMIC COMMANDS ARCHITECTURE

### Overview

Atomic commands break down composite commands into single-responsibility operations. This provides flexibility, reusability, and better debugging capabilities. Each atomic command performs one specific operation, making commands easier to understand, test, debug, and compose.

**Design Principles:**
- **Single Responsibility:** Each atomic command performs one specific operation
- **Composability:** Commands can be combined to create complex workflows
- **Backward Compatibility:** Existing composite commands remain available as compositions

### Atomic Commands by Tier

**Feature Level Atomic Commands:**
- `/feature-atomic-create [name] [description]` - Create feature structure and initial documentation
- `/feature-atomic-research [name]` - Conduct research phase (mandatory, 30+ questions)
- `/feature-atomic-load [name]` - Load feature context and documentation
- `/feature-atomic-checkpoint [name]` - Create checkpoint in current feature
- `/feature-atomic-summarize [name]` - Generate feature summary
- `/feature-atomic-close [name]` - Close feature and finalize documentation

**Phase Level Atomic Commands:**
- `/phase-atomic-create [N] [description]` - Create phase structure and initial documentation
- `/phase-atomic-load [N]` - Load phase context and documentation
- `/phase-atomic-checkpoint [N]` - Create checkpoint in current phase
- `/phase-atomic-summarize [N]` - Generate phase summary
- `/phase-atomic-close [N]` - Close phase and finalize documentation

**Session Level Atomic Commands:**
- `/session-atomic-create [X.Y] [description]` - Create session structure and initial documentation
- `/session-atomic-load [X.Y]` - Load session context and documentation
- `/session-atomic-checkpoint [X.Y]` - Create checkpoint in current session
- `/session-atomic-summarize [X.Y]` - Generate session summary
- `/session-atomic-close [X.Y]` - Close session and finalize documentation

**Task Level Atomic Commands:**
- `/task-atomic-create [X.Y.Z] [description]` - Create task documentation
- `/task-atomic-load [X.Y.Z]` - Load task context
- `/task-atomic-checkpoint [X.Y.Z]` - Create checkpoint for current task
- `/task-atomic-close [X.Y.Z]` - Close task and update documentation

### When to Use Atomic Commands

**Use Atomic Commands When:**
- Need custom workflow composition
- Want granular control over steps
- Debugging workflow issues
- Resuming work without full initialization
- Creating multi-level checkpoints
- Need to skip certain steps in standard workflow

**Example: Resuming Work**
```
User: /feature-atomic-load user-authentication
User: /phase-atomic-load 2
User: /session-atomic-load 2.1
User: /task-atomic-load 2.1.1

Agent:
1. Loads feature context
2. Loads phase context
3. Loads session context
4. Loads task context
5. Prepares for work without creating checkpoints
```

**Example: Custom Multi-Level Checkpoint**
```
User: /feature-atomic-checkpoint user-authentication
User: /phase-atomic-checkpoint 2
User: /session-atomic-checkpoint 2.1
User: /task-atomic-checkpoint 2.1.1

Agent:
1. Creates feature checkpoint
2. Creates phase checkpoint
3. Creates session checkpoint
4. Creates task checkpoint
5. Updates all relevant logs
```

### When to Use Composite Commands

**Use Composite Commands When:**
- Standard workflows match your needs
- Starting new work
- Common operations
- Quick operations
- Want convenience over control

**Example: Standard Workflow**
```
User: /start-feature user-authentication

Agent:
1. Creates feature structure (if needed)
2. Conducts research phase
3. Creates git branch
4. Loads feature context
5. Creates checkpoint
```

### Composition Patterns

**Standard Compositions:**

**Feature Start (Composite):**
```
/start-feature [name]
```
**Composition:**
```
/feature-atomic-create [name] [description]
/feature-atomic-research [name]
/feature-atomic-load [name]
git checkout -b feature/[name]
/feature-atomic-checkpoint [name]
```

**Feature End (Composite):**
```
/end-feature [name]
```
**Composition:**
```
/feature-atomic-summarize [name]
/feature-atomic-close [name]
[PROMPT USER]
git checkout develop
git merge feature/[name]
git branch -d feature/[name]
git push origin develop
```

**Phase Start (Composite):**
```
/start-phase [N] [description]
```
**Composition:**
```
/phase-atomic-create [N] [description] (if needed)
/phase-atomic-load [N]
/phase-atomic-checkpoint [N]
```

**Session Start (Composite):**
```
/start-session [X.Y] [description]
```
**Composition:**
```
/session-atomic-create [X.Y] [description] (if needed)
/session-atomic-load [X.Y]
/session-atomic-checkpoint [X.Y]
```

**Phase End (Composite):**
```
/end-phase [N]
```
**Composition:**
```
/phase-atomic-summarize [N]
/phase-atomic-close [N]
```

**Session End (Composite):**
```
/end-session [X.Y]
```
**Composition:**
```
/session-atomic-summarize [X.Y]
/session-atomic-close [X.Y]
```

### Decision Guide: When to Use Atomic vs Composite

**Use Composite Commands When:**
- Starting new work (e.g., `/start-feature`, `/start-phase`)
- Standard workflows match your needs
- You want convenience over control
- Quick operations
- Common patterns

**Use Atomic Commands When:**
- Need custom workflow composition
- Resuming work (e.g., `/feature-atomic-load` + `/phase-atomic-load`)
- Debugging workflow issues
- Want granular control
- Creating multi-level checkpoints
- Need to skip certain steps

**Examples:**

**Standard Workflow (Composite):**
```
User: /start-feature user-authentication

Agent: Handles all steps automatically
```

**Custom Resume (Atomic):**
```
User: /feature-atomic-load user-authentication
User: /phase-atomic-load 2
User: /session-atomic-load 2.1

Agent: Loads context without creating checkpoints
```

**Custom Checkpoint Chain (Atomic):**
```
User: /feature-atomic-checkpoint user-authentication
User: /phase-atomic-checkpoint 2
User: /session-atomic-checkpoint 2.1
User: /task-atomic-checkpoint 2.1.1

Agent: Creates checkpoints at all levels
```

### Conditional Compositions

**Phase Start Pattern:**
```
/start-phase [N] [description]
```
**Behavior:**
1. Check if phase exists
2. If not: `/phase-atomic-create [N] [description]`
3. Then: `/phase-atomic-load [N]`
4. Then: `/phase-atomic-checkpoint [N]`

**Example:**
```
User: /start-phase 2 "Implement authentication middleware"

Agent:
1. Checks if phase-2-guide.md exists
2. If not: Creates phase structure (guide, log, handoff)
3. Loads phase context
4. Creates checkpoint
```

**Session Start Pattern:**
```
/start-session [X.Y] [description]
```
**Behavior:**
1. Check if session exists
2. If not: `/session-atomic-create [X.Y] [description]`
3. Then: `/session-atomic-load [X.Y]`
4. Then: `/session-atomic-checkpoint [X.Y]`

**Example:**
```
User: /start-session 2.1 "Build login component"

Agent:
1. Checks if session-2.1-guide.md exists
2. If not: Creates session structure (guide, log, handoff)
3. Loads session context
4. Creates checkpoint
```

### Benefits of Atomic Commands

**1. Flexibility**
- Compose custom workflows
- Use only needed operations
- Skip unnecessary steps

**2. Debugging**
- Isolate issues to specific operations
- Test individual commands
- Identify failure points

**3. Reusability**
- Reuse commands across different contexts
- Share command patterns
- Build command libraries

**4. Maintainability**
- Update individual commands independently
- Fix issues in specific operations
- Extend functionality incrementally

### Related Documentation

- **`.cursor/workflow/docs/atomic-commands-architecture.md`** - Complete atomic commands documentation with detailed examples and composition patterns
- **`.cursor/workflow/docs/feature-tier-architecture.md`** - Feature tier architecture including command structure
- **`.cursor/workflow/docs/tier-discriminator-guide.md`** - Tier selection guide

---

## WORKFLOW MODE RULES

### Rule 23: Ask Mode vs Agent Mode Workflow

**CRITICAL:** All slash commands for planning and documentation must be used in **Ask Mode**. Implementation only happens in **Agent Mode** after explicit approval.

**Ask Mode (Planning/Documenting):**

Use Ask Mode for all planning, documenting, and review operations:

- `/start-session` - Planning session work, loading context
- `/change-session` - Recording change requests
- `/plan-task` - Planning tasks
- `/plan-session` - Planning sessions
- `/plan-phase` - Planning phases
- `/plan-feature` - Planning features
- `/feature-atomic-research` - Conducting research phase
- `/feature-atomic-load` - Loading feature context
- `/read-handoff` - Reading documentation
- `/read-guide` - Reading guides
- `/status` - Checking status
- `/checkpoint-session` - Reviewing session progress
- `/checkpoint-phase` - Reviewing phase progress
- `/checkpoint-feature` - Reviewing feature progress
- `/tier-discriminator` or `/what-tier` - Determining appropriate tier level
- Any command that reads/plans but doesn't modify code

**Characteristics of Ask Mode:**
- Read-only operations
- Planning and documentation
- Review and approval workflows
- No code changes
- Outputs plans, summaries, or documentation

**Agent Mode (Implementation):**

Use Agent Mode ONLY for implementation after explicit approval:

- Implementing approved plans
- Making code changes
- Creating/modifying files
- Running git operations (after approval)
- Any operation that modifies the codebase

**Requirements for Agent Mode:**
- **MUST** have explicit approval from Ask Mode first
- Approval prompt must show what will be changed
- User must explicitly approve before implementation begins
- Never switch to Agent Mode without user approval

**Approval Process:**

Before switching to Agent Mode, agents MUST:

1. **Show clear summary** of what will be implemented
2. **List files** that will be created/modified
3. **Show implementation plan** with steps
4. **Prompt for approval:** "Ready to implement these changes? Switch to agent mode to proceed." (yes/no)
5. **If yes:** Switch to Agent Mode and begin implementation
6. **If no:** Address concerns, then re-prompt

**Approval Prompt Format:**

```
## Ready to Implement?

**What will be changed:**
- [File 1] - [What will change]
- [File 2] - [What will change]

**Implementation Plan:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Ready to implement these changes? Switch to agent mode to proceed.** (yes/no)
```

**Examples:**

**✅ Correct Workflow:**
1. User runs `/start-session 2.2 "Pinia Stores"` in Ask Mode
2. Agent responds with plan in Ask Mode
3. Agent shows approval prompt: "Ready to implement?"
4. User says "yes"
5. User switches to Agent Mode
6. Agent implements the plan

**❌ Incorrect Workflow:**
1. User runs `/start-session 2.2 "Pinia Stores"` in Ask Mode
2. Agent immediately starts implementing (WRONG - should show plan first)
3. Agent makes changes without approval (WRONG - needs approval)

**Scope:** Applies to all slash commands and workflow operations. Planning commands are Ask Mode only. Implementation requires Agent Mode with explicit approval.

**Exception:** Commands that only read/display information (like `/status`, `/read-handoff`) can be used in either mode, but planning commands should always be Ask Mode.

---

### Rule 24: Tier-Appropriate Change Commands (Mandatory)

**Purpose:** Ensure all code changes go through proper workflow documentation, regardless of complexity. This prevents context loss, creates audit trails, and maintains consistency across all changes.

**Requirement:**

Before implementing **ANY** code changes (including bug fixes, refactoring, feature additions, or architectural adjustments):

1. **Document current state** using tier-appropriate checkpoint command:
   - `/session-checkpoint [X.Y]` for session-level changes
   - `/phase-checkpoint [N]` for phase-level changes
   - `/feature-checkpoint [name]` for feature-level changes

2. **Create change request** using tier-appropriate change command:
   - `/session-change [description]` for session-level changes (bug fixes, refactoring, naming changes)
   - `/phase-change [from] [to] [reason]` for phase-level architectural pivots
   - `/feature-change [name] [new-name] [reason]` for feature-level pivots

3. **Then implement** the changes after change request is documented in the appropriate log

**Workflow Pattern:**

```
1. Discover issue/need for change
2. Run checkpoint command → Document current state
3. Run change command → Create change request entry
4. Review change request and action plan
5. Implement changes
6. Update change request status to "Complete"
```

**Examples:**

**Example: Bug Fix in Session**
```
1. User: "There's a console error with nested v-app components"
2. Agent: Runs `/session-checkpoint 4.1` → Documents current state
3. Agent: Runs `/session-change "Fix nested v-app console error"` → Creates change request
4. Agent: Implements fix → Removes nested v-app wrapper
5. Agent: Updates change request status to "Complete"
```

**Example: Refactoring in Session**
```
1. User: "Rename getUserData to fetchUserProfile for consistency"
2. Agent: Runs `/session-checkpoint 2.1` → Documents current state
3. Agent: Runs `/session-change "Rename getUserData to fetchUserProfile"` → Creates change request
4. Agent: Implements rename → Updates all references
5. Agent: Updates change request status to "Complete"
```

**Example: Architectural Pivot in Phase**
```
1. User: "Vuexy pattern incompatible, need custom wizard architecture"
2. Agent: Runs `/phase-checkpoint 3` → Documents current phase state
3. Agent: Runs `/phase-change 3 4 "Vuexy pattern incompatible"` → Creates phase-change document
4. Agent: Implements new architecture → Creates Phase 4 structure
5. Agent: Updates phase-change status to "Complete"
```

**Rationale:**

- **Consistency:** Same process for all changes prevents context loss and establishes predictable patterns
- **Documentation:** Creates audit trail and preserves decision context for future reference
- **Pattern Reinforcement:** Builds habits that help with complex changes and prevents "just this once" exceptions
- **Handoff Quality:** Makes transitions between agents/sessions smoother with documented context
- **Minimal Overhead:** Checkpoint + change request adds minimal time but provides significant value

**Scope:** Applies to **ALL** code changes, including:
- Bug fixes (regardless of size)
- Refactoring (naming, structure, patterns)
- Feature additions (new components, functionality)
- Architectural adjustments (patterns, dependencies)
- Performance optimizations
- Documentation updates that affect code structure

**Exceptions:**

**None.** All changes must follow this workflow, regardless of:
- Size (small bug fix or large refactor)
- Complexity (simple rename or architectural pivot)
- Urgency (critical bug or planned improvement)
- Type (code, tests, documentation)

**Why No Exceptions:**

Even "simple" fixes benefit from:
- Context documentation (what was the state before?)
- Change tracking (what changed and why?)
- Audit trail (when was this fixed?)
- Pattern consistency (same process every time)

The workflow overhead is minimal (checkpoint + change request) but provides significant value in documentation, context preservation, and pattern reinforcement.

**Codebase Reference:**
- Change Request Patterns: `.cursor/project-manager/docs/phase-change-workflow.md`
- Session Change Command: `.cursor/commands/tiers/session/composite/session-change.ts`
- Phase Change Workflow: `.cursor/project-manager/docs/phase-change-workflow.md`
- Feature Change Workflow: `.cursor/project-manager/docs/feature-tier-architecture.md`

**Integration with Rule 23:**

This rule works in conjunction with Rule 23 (Ask Mode vs Agent Mode):
- **Checkpoint and change commands** are run in **Ask Mode** (planning/documenting)
- **Implementation** happens in **Agent Mode** after change request is documented
- Change request provides the "approval plan" that Rule 23 requires

**Scope:** Applies to all code changes across all tiers. This is a mandatory workflow requirement with no exceptions.

