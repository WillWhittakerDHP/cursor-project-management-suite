# Cursor Project Management Suite

Complete suite of coding rules, slash commands, and project management tools for AI-assisted development in Cursor.

## Installation

### Option 1: Git Submodule (Recommended)

Use this repository as a git submodule in your project for version-controlled updates:

```bash
# In your project root
git submodule add https://github.com/WillWhittakerDHP/cursor-project-management-suite.git .cursor
git commit -m "Add Cursor development environment as submodule"
```

**To update the submodule later:**
```bash
git submodule update --remote .cursor
```

### Option 2: Manual Copy

If you prefer a standalone copy (not version-controlled):

```bash
# Clone the repository
git clone https://github.com/WillWhittakerDHP/cursor-project-management-suite.git temp-cursor
# Copy to your project
cp -r temp-cursor/* /path/to/your/project/.cursor/
# Clean up
rm -rf temp-cursor
```

**Note:** With manual copy, you'll need to manually update files when new versions are released.

## Repository

**Repository URL:** `https://github.com/WillWhittakerDHP/cursor-project-management-suite.git`

## Structure

```
.cursor/
├── commands/          # Slash commands for workflow automation
├── rules/            # Coding rules and standards
└── project-manager/  # Project management documentation
```

---

## Table of Contents

1. [Coding Rules](#coding-rules)
2. [Slash Commands](#slash-commands)
3. [Project Management](#project-management)
4. [Getting Started](#getting-started)
5. [Architecture](#architecture)
6. [Usage in Projects](#usage-in-projects)

---

## Coding Rules

### Overview

Rules are split into two categories:
- **Project Rules** (`rules/PROJECT_CODING_RULES.md`) - Technical standards and code quality
- **User Rules** (`rules/USER_CODING_RULES.md`) - Personal preferences and learning-focused guidelines

Both files are automatically loaded by Cursor (marked with `alwaysApply: true`).

### Project Rules (Technical Standards)

#### Critical Project Rules

**Rule 1: No Unnecessary Additions During Refactors**
- Don't add fallbacks, filters, or new types during refactors
- Use existing property names and types as-is
- Exception: Test files may use fallbacks for setup

**Rule 2: Generic Patterns with Runtime Configurations**
- Prefer `EntityBase<GlobalEntityKey>` with runtime `ENTITY_CONFIGS`
- Avoid specific interfaces like `BlockTypeEntity`, `PartTypeEntity`
- Use generic bases that specialize at runtime

**Rule 3: Clear Transformation Functions Over Prop-Drilling**
- Create typed, documented transformation functions
- Avoid complex nested transformations
- See: `client/src/admin/dataTransformation/`

#### Type Safety Rules

**Rule 4: Type Safety - Avoid Assertions**
- Use explicit return types: `function DoAThing(): ReturnType<Generic>`
- Avoid type assertions (`as any`, `as unknown`)
- Prefer type guards: `value is Type`

**Rule 5: Descriptive Generic Type Names**
- Use `GlobalEntityKey` instead of `K`
- Use `GlobalPropertyKey` instead of `P`
- See: `client/src/global/types/globalEntityTypes.ts`

#### Code Quality Rules

**Rule 6: Strategic Memoization**
- Memoize components with object/array props that change reference frequently
- Use Vue.js `computed()` and `v-memo` strategically
- Only optimize when profiling shows performance issues

**Rule 7: Functional Approaches Over Mutations**
- Use `map`, `reduce`, `filter` over mutations
- Avoid `forEach` for transformations (use `map` instead)
- Use `for...of` only for early returns or side effects

**Rule 8: Explicit Error Handling**
- Log errors explicitly
- Don't create silent fallbacks that hide errors
- Let errors propagate appropriately

#### Testing Rules

**Rule 10: Test File Documentation**
- Every test file must begin with descriptive header comment
- Explain: what it covers, how it works, what it validates, dependencies
- See: `client/src/admin/tests/activePartsStateCalculator.test.ts`

**Rule 11: Test File Immutability**
- Tests are immutable once they pass, lint, and function correctly
- Only modify when feature changes, test has bug, or refactoring requires updates
- Never modify tests to make failing code pass - fix the code instead

**Rule 12: Testing Strategy - Hybrid Approach**
- Fine-grained unit tests for pure functions, utilities, business logic
- Integration tests for context coordination, component integration, user workflows
- See: `client/src/booking/__tests__/utils/feeCalculation.test.ts` (unit)
- See: `client/src/admin/tests/integration/contextIntegration.test.tsx` (integration)

**Rule 13: Test Execution in Development**
- Tests run in watch mode: `npm run start:dev:testing`
- Standard development: `npm run start:dev` (no test watching)

#### Responsive Design Rules

**Rule 20: Mobile-First Responsive Design**
- Build responsiveness into Vue.js components from the start
- Use Vuetify responsive utilities (`cols`, `sm`, `md`, `lg`, `xl`)
- Minimum 44x44px touch targets, 16px minimum text size
- Use Vuetify grid system (`VContainer`, `VRow`, `VCol`)
- See: https://vuetifyjs.com/en/features/display-and-platform/

#### Documentation & Pattern Reuse Rules

**Rule 21: Documentation Checks at Critical Junctures**
- Check existing documentation, patterns, reusable components before implementing
- Before creating components: check `client/src/admin/components/generic/`
- Before creating transformers: review `client/src/admin/dataTransformation/`
- Before implementing similar functionality: search codebase for existing implementations

**Rule 22: Pattern Reuse and Generic Component Creation**
- Identify reusable patterns before duplicating code
- Create generic solutions after identifying patterns (2+ similar code structures)
- Create generic component when: similar code appears 2+ times with same structure
- Don't create generic component when: only one use case exists (premature abstraction)
- See: `client/src/admin/components/generic/` for examples

### User Rules (Personal Preferences & Learning)

#### Communication Preference

**Rule 9: Supportive and Explicit Communication**
- Use best practice strategies with explicit descriptions
- Professional naming with supportive tone
- Explain architectural decisions and patterns clearly
- Reference codebase examples when explaining concepts

#### Learning-Focused Rules

**Rule 14: Educational Code Comments**
- Add explanatory comments for complex patterns, new concepts, framework transitions
- Use comment patterns: `LEARNING`, `WHY`, `COMPARISON`, `PATTERN`, `RESOURCE`
- See: `LEARNING_STRATEGIES.md` for comment patterns

**Rule 15: Learning Checkpoints**
- Identify natural learning checkpoints after component creation, pattern introduction
- Provide optional explanations without disrupting flow
- Use checkpoint questions: What, Why, How, When, Where

**Rule 16: Pattern Explanation**
- Explain architectural decisions and why patterns were chosen
- Compare alternatives considered
- Link to learning resources
- Connect new patterns to existing codebase patterns

**Rule 17: Progressive Complexity**
- Start simple, add complexity gradually
- Explain each layer as it's added
- Document learning progression from basic to type safety, validation, error handling

**Rule 18: Active Learning Encouragement**
- After implementing code, suggest modifications to try
- Suggest related concepts to explore
- Explain trade-offs in decisions
- Connect new code to existing patterns

#### Workflow Rules

**Rule 22: Four-Tier Structured Workflow Management**
- Feature (Tier 0) → Phase (Tier 1) → Session (Tier 2) → Task (Tier 3)
- Each tier has guide, log, and handoff documents
- Commands operate at appropriate tier levels

**Rule 23: Ask Mode vs Agent Mode Workflow**
- Ask Mode: Read-only, planning, questions
- Agent Mode: Code changes, implementation
- Use appropriate mode for task type

**Rule 24: Tier-Appropriate Change Commands**
- Use `/scope-and-change` for safe changes (auto-executes)
- Use `/scope-and-summarize` for review (shows analysis)
- Commands automatically determine tier from context

### Additional Rule Files

- `AGENTIC_AI_APPROACHES.md` - Strategies for AI-assisted development
- `LEARNING_STRATEGIES.md` - Active learning techniques and comment patterns
- `SECURITY_GUIDELINES.md` - Security best practices
- Individual `.mdc` files for specific rule categories

---

## Slash Commands

### Architecture

Commands are organized by:
- **Tier** (Feature → Phase → Session → Task)
- **Type** (Atomic vs Composite)
- **Category** (Git, Document, Handoff, Planning, Testing, etc.)

### Four-Tier Structure

#### Tier 0: Feature (Highest Level)
- **Scope**: Multiple phases, weeks/months of work, major features
- **Documents**: `feature-[name]-guide.md`, `feature-[name]-log.md`, `feature-[name]-handoff.md`
- **Commands**:
  - `/plan-feature [name] [description]` - Plan new feature with research
  - `/feature-start [name]` - Start feature (create branch, initialize structure)
  - `/feature-checkpoint [name]` - Create feature checkpoint
  - `/feature-end [name]` - End feature (merge branch, finalize docs)
  - `/feature-change [name] [new-name] [reason]` - Handle feature pivots

#### Tier 1: Phase (High-Level)
- **Scope**: Multiple sessions, weeks of work, major milestones
- **Documents**: `phase-[N]-guide.md`, `phase-[N]-log.md`, `phase-[N]-handoff.md`
- **Commands**:
  - `/plan-phase [N] [description]` - Phase planning with documentation checks
  - `/phase-start [N]` - Load phase guide and handoff
  - `/phase-checkpoint [N]` - Mid-phase review
  - `/phase-end [N]` - Complete phase, update logs/handoffs
  - `/mark-phase-complete [N]` - Mark phase complete

#### Tier 2: Session (Medium-Level)
- **Scope**: Multiple tasks, hours/days of work, focused feature/component
- **Documents**: `session-[X.Y]-guide.md`, `session-[X.Y]-log.md`, `session-[X.Y]-handoff.md`
- **Commands**:
  - `/plan-session [X.Y] [description]` - Session planning with task breakdown
  - `/session-start [X.Y] [description]` - Load session guide/handoff
  - `/session-checkpoint [X.Y]` - Mid-session review
  - `/session-end [X.Y] [description] [next-session]` - Complete session
  - `/update-handoff` - Update session handoff with current progress
  - `/new-agent` - Prepare handoff for agent switch

#### Tier 3: Task (Low-Level)
- **Scope**: Single focused work item, minutes/hours, specific implementation
- **Details**: Embedded in session documents (not separate files)
- **Commands**:
  - `/plan-task [X.Y.Z] [description]` - Task planning
  - `/task-start [X.Y.Z]` - Load task context
  - `/task-checkpoint [X.Y.Z] [notes]` - Task-level quality check
  - `/task-end [X.Y.Z]` - Complete task, update logs
  - `/mark-complete [X.Y.Z]` - Mark task complete

### Command Categories

#### Git Operations (`git/`)
- `/create-branch [name]` - Create new git branch
- `/git-commit [message]` - Stage and commit changes
- `/git-push` - Push current branch to origin
- `/git-merge [sourceBranch] [targetBranch?]` - Merge branches
- See: `commands/git/README.md`

#### Document Operations (`document/`)
- `/document-read-section [tier] [identifier?] [sectionTitle] [docType?]` - Read section
- `/document-list-sections [tier] [identifier?] [docType?]` - List sections
- `/document-extract-section [tier] [identifier?] [sectionTitle] [docType?]` - Extract section
- See: `commands/document/README.md`

#### Handoff Operations (`handoff/`)
- `/handoff-generate [tier] [identifier] [featureName] [nextIdentifier?]` - Generate handoff
- `/handoff-review [tier] [identifier] [featureName]` - Review handoff completeness
- `/handoff-complete [tier] [identifier] [featureName] [nextIdentifier?]` - Complete handoff workflow
- See: `commands/handoff/README.md`

#### Planning Operations (`planning/`)
- `/planning-parse [input]` - Parse plain language into structured plan
- `/planning-validate [plan]` - Validate plan structure
- `/planning-check-docs [type]` - Check documentation before implementing
- `/planning-check-reuse [description]` - Check for reusable patterns
- `/planning-generate-alternatives [description]` - Generate alternative approaches
- `/planning-enforce-decision-gate [decision]` - Enforce decision gate
- See: `commands/planning/README.md`

#### Testing Operations (`testing/`)
- `/test-run [target]` - Execute test suite (vue/server/all)
- `/test-watch [target]` - Run tests in watch mode
- `/test-coverage [target]` - Generate coverage reports
- `/test-validate [file-path]` - Validate test file structure
- `/test-check-immutable [file-path] [reason]` - Check if test is immutable
- `/test-workflow [target] [--coverage]` - Full test workflow
- `/test-before-commit [target]` - Pre-commit test suite
- `/test-end-workflow [tier] [id] [target]` - End-of-workflow test suite
- See: `commands/testing/README.md`

#### Todo Operations (`todo/`)
- `/todo-find [feature] [todo-id]` - Find todo by ID
- `/todo-save [feature] [todo]` - Save a todo
- `/todo-get-all [feature]` - Get all todos for feature
- `/todo-create-citation [feature] [todo-id] [change-log-id] [type] [context] [priority]` - Create citation
- `/todo-rollback [feature] [todo-id] [state-id] [reason]` - Rollback to previous state
- `/todo-validate-scope [feature] [todo] [parent-todo]` - Validate todo scope
- See: `commands/todo/README.md`

#### Utility Commands (`utils/`)
- `/read-handoff` - Read and display key sections from handoff
- `/read-guide` - Read and display relevant sections from guide
- `/lint [target]` - Run linting (vue/server/all)
- `/type-check` - Run type checking for Vue app
- `/test [target] [--watch]` - Run tests (vue/server/all)
- `/verify-app` - Verify app starts on port 3002
- `/status` - Quick overview (phase, next action, branch, last commit)
- `/scope-and-summarize [description]` - Analyze context, determine tier, generate summary
- `/scope-and-change [description]` - Analyze context, auto-execute safe changes or show analysis

#### Audit Operations (`audit/`)
- `/audit-checkpoints` - Audit checkpoint quality
- `/audit-comments` - Audit code comments
- `/audit-docs` - Audit documentation completeness
- `/audit-planning` - Audit planning documents
- `/audit-security` - Security audit
- `/audit-tests` - Test audit
- `/audit-todos` - Todo audit
- See: `commands/audit/README.md`

#### Security Operations (`security/`)
- `/security-check-secrets` - Check for exposed secrets
- `/security-check-config` - Check configuration security
- `/security-check-csrf` - Check CSRF protection
- `/security-check-idor` - Check IDOR vulnerabilities
- `/security-check-auth` - Check authentication/authorization
- See: `commands/security/README.md`

#### Status Operations (`status/`)
- `/status-get [tier] [identifier?]` - Get tier status
- `/status-query-changes [filters]` - Query changes
- `/status-query-citations [filters]` - Query citations
- `/status-detailed [tier] [identifier?]` - Detailed status
- `/status-cross-tier` - Cross-tier status overview
- See: `commands/status/README.md`

#### Validation Operations (`validation/`)
- `/validate-workflow [tier] [identifier?]` - Validate workflow completeness
- `/verify-completeness [tier] [identifier?]` - Verify tier completeness
- `/validate-complete [tier] [identifier?]` - Complete validation workflow
- See: `commands/validation/README.md`

#### README Operations (`readme/`)
- `/readme-create [path] [content]` - Create README
- `/readme-audit [path]` - Audit README quality
- `/readme-validate [path]` - Validate README structure
- `/readme-extract-section [path] [sectionTitle]` - Extract section
- `/readme-mark-temporary [path] [sectionTitle]` - Mark section as temporary
- `/readme-consolidate [paths]` - Consolidate multiple READMEs
- See: `commands/readme/README.md`

### Command Chaining

Commands can be chained with `&&`:

```bash
/verify vue && /log-task 1.3.1 "Base API Client Setup" && /update-handoff
```

### Quick Reference

Each command category has a `QUICK_REFERENCE.md` file with:
- Command signatures
- Parameter types
- Return types
- Common patterns
- Examples

See: `commands/[category]/QUICK_REFERENCE.md`

---

## Project Management

### Structure

```
project-manager/
├── features/              # Feature-specific documentation
│   └── vue-migration/     # Example: Vue migration feature
│       ├── phases/        # Phase guides, logs, handoffs
│       ├── sessions/      # Session guides, logs, handoffs
│       └── *.json        # Feature configuration
├── PROJECT_PLAN.md       # Overall project plan
└── README.md             # Project manager documentation
```

### Document Types

Each tier has three document types:

1. **Guide** (`*-guide.md`) - Planning and reference documents
   - Architecture decisions
   - Patterns and approaches
   - Learning notes
   - Next steps

2. **Log** (`*-log.md`) - Activity and progress logs
   - Completed work
   - Decisions made
   - Issues encountered
   - Lessons learned

3. **Handoff** (`*-handoff.md`) - Transition context documents
   - Current status
   - Next action
   - Transition context
   - Minimal (100-200 lines)

### Workflow Integration

Commands automatically:
- Create appropriate documents
- Update logs and handoffs
- Manage git branches
- Track progress across tiers

---

## Getting Started

### 1. Install in Your Project

See [Installation](#installation) section above for submodule or manual copy instructions.

### 2. Configure Cursor

The `.cursor/` folder is automatically detected by Cursor. Rules are loaded from:
- `.cursor/rules/PROJECT_CODING_RULES.md` (always applied)
- `.cursor/rules/USER_CODING_RULES.md` (always applied)

### 3. Use Slash Commands

Commands are available via Cursor's slash command interface. Type `/` to see available commands.

Example workflow:
```bash
# Start a new session
/session-start 1.3 "API Clients"

# Work on tasks...
/task-start 1.3.1
# ... implement ...
/task-end 1.3.1

# End session
/session-end 1.3 "API Clients" 1.4
```

---

## Usage in Projects

### Updating the Submodule

When new versions are released, update the submodule in your project:

```bash
# Update to latest version
git submodule update --remote .cursor

# Or update to specific commit
cd .cursor
git checkout <commit-hash>
cd ..
git add .cursor
git commit -m "Update Cursor development environment to <version>"
```

### Version Locking

To lock to a specific version, commit the submodule reference:

```bash
cd .cursor
git checkout <commit-hash>
cd ..
git add .cursor
git commit -m "Lock Cursor environment to version <commit-hash>"
```

### Customization

You can customize rules and commands for your project:
- Modify rule files in `.cursor/rules/` (changes won't be tracked if using submodule)
- Add project-specific commands in `.cursor/commands/`
- Override defaults in your project's configuration

**Note:** If using a submodule, local changes won't be committed to the submodule repository. Consider forking the repository if you need to maintain custom changes.

---

## Architecture

### Command Structure

```
commands/
├── tiers/           # Tier-specific commands (Feature/Phase/Session/Task)
├── git/             # Git operations
├── document/        # Document operations
├── handoff/         # Handoff operations
├── planning/        # Planning operations
├── testing/         # Testing operations
├── todo/            # Todo management
├── audit/           # Audit operations
├── security/        # Security checks
├── status/          # Status queries
├── validation/      # Validation operations
├── readme/          # README management
├── comments/        # Code comment operations
├── checkpoint/      # Checkpoint operations
├── batch/           # Batch operations
├── workflow/        # Workflow manager commands
└── utils/           # Shared utilities
```

### Rule Structure

```
rules/
├── PROJECT_CODING_RULES.md      # Technical standards (always applied)
├── USER_CODING_RULES.md         # Personal preferences (always applied)
├── AGENTIC_AI_APPROACHES.md     # AI development strategies
├── LEARNING_STRATEGIES.md       # Learning techniques
├── SECURITY_GUIDELINES.md       # Security best practices
└── *.mdc                        # Individual rule files
```

### Key Principles

1. **Composability** - Commands can be combined and chained
2. **Tier Awareness** - Commands operate at appropriate abstraction levels
3. **Type Safety** - All commands are TypeScript with explicit types
4. **Documentation** - Every command category has README and QUICK_REFERENCE
5. **Consistency** - Follow established patterns across all commands

---

## Additional Resources

- **Commands Documentation**: `commands/README.md`
- **Command Usage Guide**: `commands/USAGE.md`
- **Installation Guide**: `INSTALLATION.md`
- **Project Manager**: `project-manager/README.md`
- **Learning Strategies**: `rules/LEARNING_STRATEGIES.md`
- **AI Approaches**: `rules/AGENTIC_AI_APPROACHES.md`

---

## Support

For questions or issues:
1. Check the relevant `README.md` or `QUICK_REFERENCE.md` in the command category
2. Review `commands/docs/` for architecture and troubleshooting guides
3. Check `commands/docs/troubleshooting-guide.md` for common issues
4. Open an issue on GitHub: https://github.com/WillWhittakerDHP/cursor-project-management-suite/issues

---

**Last Updated**: 2025-01-27
**Version**: 1.0.0

