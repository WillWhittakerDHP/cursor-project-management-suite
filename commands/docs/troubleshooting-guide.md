# Troubleshooting Guide

**Purpose:** Solutions and workarounds for common workflow command and documentation issues  
**Date Created:** 2025-11-16  
**Location:** `.cursor/commands/docs/`

---

## Overview

This guide provides solutions for common issues encountered when using the workflow manager system. Issues are organized by category: command issues, workflow problems, file path errors, and documentation sync problems.

---

## Command Issues

### Commands Not Working as Expected

#### Issue: Command syntax error
**Symptoms:**
- Command not recognized
- Unexpected behavior
- Error message about invalid syntax

**Solution:**
1. Verify command syntax matches documented format
2. Check command naming: `/{action}-{tier}` for composite, `/{tier}-atomic-{action}` for atomic
3. Ensure all required parameters are provided
4. Check for typos in tier identifiers (feature name, phase number, session ID)

**Example:**
```
❌ Wrong: /start-feature user authentication
✅ Correct: /start-feature user-authentication "Build user authentication system"
```

**Reference:**
- See `.cursor/rules/USER_CODING_RULES.md` Rule 22 for command syntax
- See `.cursor/commands/docs/atomic-commands-architecture.md` for atomic command syntax

---

#### Issue: Command creates wrong file structure
**Symptoms:**
- Files created in wrong location
- Incorrect file naming
- Missing files

**Solution:**
1. Verify feature name matches existing feature directory
2. Check file path structure: `.cursor/project-manager/features/[name]/`
3. Ensure phase/session numbers match existing structure
4. Verify git branch name matches feature name

**File Path Structure:**
```
.cursor/project-manager/features/[name]/
├── feature-[name]-guide.md
├── feature-[name]-log.md
├── feature-[name]-handoff.md
├── phases/
│   └── phase-[N]-guide.md
└── sessions/
    └── session-[X.Y]-guide.md
```

**Reference:**
- See `.cursor/project-manager/docs/feature-tier-architecture.md` for file structure

---

#### Issue: Atomic command not found
**Symptoms:**
- Error: "Command not found"
- Atomic command doesn't exist

**Solution:**
1. Verify atomic command naming: `/{tier}-atomic-{action}`
2. Check available atomic commands in Rule 22
3. Use composite command if atomic command doesn't exist
4. Verify tier level (feature/phase/session/task)

**Available Atomic Commands:**
- Feature: `/feature-atomic-create`, `/feature-atomic-research`, `/feature-atomic-load`, `/feature-atomic-checkpoint`, `/feature-atomic-summarize`, `/feature-atomic-close`
- Phase: `/phase-atomic-create`, `/phase-atomic-load`, `/phase-atomic-checkpoint`, `/phase-atomic-summarize`, `/phase-atomic-close`
- Session: `/session-atomic-create`, `/session-atomic-load`, `/session-atomic-checkpoint`, `/session-atomic-summarize`, `/session-atomic-close`
- Task: `/task-atomic-create`, `/task-atomic-load`, `/task-atomic-checkpoint`, `/task-atomic-close`

**Reference:**
- See `.cursor/rules/USER_CODING_RULES.md` Rule 22 for atomic commands list
- See `.cursor/commands/docs/atomic-commands-architecture.md` for complete documentation

---

### File Path Errors

#### Issue: Feature not found
**Symptoms:**
- Error: "Feature [name] not found"
- Cannot load feature context

**Solution:**
1. Verify feature directory exists: `.cursor/project-manager/features/[name]/`
2. Check feature name spelling (case-sensitive, use kebab-case)
3. Ensure feature guide exists: `feature-[name]-guide.md`
4. Create feature structure if missing: `/plan-feature [name] [description]`

**Example:**
```
❌ Wrong: /start-feature UserAuthentication
✅ Correct: /start-feature user-authentication
```

**Reference:**
- See `.cursor/project-manager/docs/feature-tier-architecture.md` for feature structure

---

#### Issue: Phase not found
**Symptoms:**
- Error: "Phase [N] not found"
- Cannot load phase context

**Solution:**
1. Verify phase directory exists: `.cursor/project-manager/features/[name]/phases/`
2. Check phase guide exists: `phase-[N]-guide.md`
3. Verify phase number matches existing phases
4. Create phase if missing: `/plan-phase [N] [description]`

**Note:** `/start-phase` will automatically create phase if it doesn't exist (conditional composition)

**Reference:**
- See `.cursor/rules/USER_CODING_RULES.md` Rule 22 for conditional compositions

---

#### Issue: Session not found
**Symptoms:**
- Error: "Session [X.Y] not found"
- Cannot load session context

**Solution:**
1. Verify session directory exists: `.cursor/project-manager/features/[name]/sessions/`
2. Check session guide exists: `session-[X.Y]-guide.md`
3. Verify session ID format: `[phase].[session]` (e.g., `2.1`)
4. Create session if missing: `/plan-session [X.Y] [description]`

**Note:** `/start-session` will automatically create session if it doesn't exist (conditional composition)

**Reference:**
- See `.cursor/rules/USER_CODING_RULES.md` Rule 22 for conditional compositions

---

### Git Branch Issues

#### Issue: Feature branch not created
**Symptoms:**
- Git branch missing after `/start-feature`
- Cannot find `feature/[name]` branch

**Solution:**
1. Verify git repository is initialized
2. Check current branch: `git branch`
3. Ensure `develop` branch exists (feature branches branch from `develop`)
4. Manually create branch if needed: `git checkout -b feature/[name]`

**Branch Strategy:**
- Feature branches: `feature/[name]` (from `develop`)
- Created at: `/start-feature`
- Merged at: `/end-feature`
- Deleted after merge

**Reference:**
- See `.cursor/rules/USER_CODING_RULES.md` Rule 22 for git branch strategy

---

#### Issue: Wrong base branch
**Symptoms:**
- Feature branch created from wrong branch
- Merge conflicts

**Solution:**
1. Verify feature branches branch from `develop` (not `main`)
2. Check current branch before creating feature: `git branch`
3. Switch to `develop` if needed: `git checkout develop`
4. Pull latest changes: `git pull origin develop`
5. Create feature branch: `git checkout -b feature/[name]`

**Reference:**
- See `.cursor/rules/USER_CODING_RULES.md` Rule 22 for git branch strategy

---

## Workflow Problems

### Session/Phase/Feature Not Found Errors

#### Issue: Cannot start session
**Symptoms:**
- `/start-session` fails
- Session files not found

**Solution:**
1. Verify session exists or use `/plan-session` first
2. Check session ID format: `[phase].[session]` (e.g., `2.1`)
3. Verify parent phase exists
4. Use `/start-session` - it will create session if missing (conditional composition)

**Workaround:**
```
/plan-session 2.1 "Build login component"
/start-session 2.1 "Build login component"
```

**Reference:**
- See `.cursor/rules/USER_CODING_RULES.md` Rule 22 for session commands

---

#### Issue: Cannot start phase
**Symptoms:**
- `/start-phase` fails
- Phase files not found

**Solution:**
1. Verify phase exists or use `/plan-phase` first
2. Check phase number matches existing phases
3. Verify parent feature exists
4. Use `/start-phase` - it will create phase if missing (conditional composition)

**Workaround:**
```
/plan-phase 2 "Implement authentication middleware"
/start-phase 2 "Implement authentication middleware"
```

**Reference:**
- See `.cursor/rules/USER_CODING_RULES.md` Rule 22 for phase commands

---

### Checkpoint Issues

#### Issue: Checkpoint not updating
**Symptoms:**
- Checkpoint command runs but log not updated
- Progress not tracked

**Solution:**
1. Verify log file exists: `feature-[name]-log.md`, `phase-[N]-log.md`, `session-[X.Y]-log.md`
2. Check file permissions (should be writable)
3. Verify checkpoint format matches template
4. Manually update log if needed

**Checkpoint Format:**
```markdown
### Checkpoint: [Date]
**Status:** [Current status]
**Progress:** [What was accomplished]
**Next:** [Next steps]
```

**Reference:**
- See `.cursor/commands/tiers/*/templates/` for log templates

---

#### Issue: Checkpoint creates duplicate entries
**Symptoms:**
- Multiple checkpoint entries for same task
- Log file has duplicates

**Solution:**
1. Check if checkpoint already exists before creating new one
2. Update existing checkpoint instead of creating duplicate
3. Review log file before adding checkpoint
4. Use unique checkpoint identifiers (date/time)

**Best Practice:**
- One checkpoint per task completion
- Update existing checkpoint if task continues
- Use dates/timestamps for checkpoint identification

---

### Documentation Sync Problems

#### Issue: Handoff document out of sync
**Symptoms:**
- Handoff document shows outdated information
- Next steps don't match current state

**Solution:**
1. Update handoff document after each task/session
2. Use `/update-handoff` command if available
3. Manually update handoff sections:
   - Current State
   - Next Action
   - Files Modified
   - Dependencies

**Handoff Update Process:**
1. Review current work state
2. Update "Current State" section
3. Update "Next Action" with immediate next step
4. List files modified since last update
5. Update dependencies if changed

**Reference:**
- See `.cursor/commands/tiers/session/templates/session-handoff.md` for handoff format

---

#### Issue: Guide and log out of sync
**Symptoms:**
- Guide shows different status than log
- Checkboxes not updated

**Solution:**
1. Update guide checkboxes as work progresses
2. Keep log entries aligned with guide structure
3. Review both documents regularly
4. Use consistent status indicators

**Sync Process:**
1. After completing task: Update log entry
2. Update guide checkbox: `- [ ]` → `- [x]`
3. Update status in both documents
4. Verify consistency

**Reference:**
- See `.cursor/commands/tiers/*/templates/` for guide and log templates

---

### Tier Confusion

#### Issue: Wrong tier level selected
**Symptoms:**
- Work planned at wrong tier (e.g., feature instead of session)
- Scope mismatch

**Solution:**
1. Use `/tier-discriminator [description]` or `/what-tier [description]` before planning
2. Review tier criteria:
   - **Feature:** Weeks/months, multiple phases, architectural decisions, new git branch
   - **Phase:** Weeks, multiple sessions, major milestones
   - **Session:** Hours/days, multiple tasks, focused work
   - **Task:** Minutes/hours, single focused work item
3. Adjust tier level if needed

**Tier Selection Guide:**
```
/tier-discriminator "Build login component"
```
Returns recommended tier, reasoning, and suggested command.

**Reference:**
- See `.cursor/commands/docs/tier-discriminator-guide.md` for tier selection guide

---

#### Issue: Work spans multiple tiers
**Symptoms:**
- Work doesn't fit single tier
- Unclear which tier to use

**Solution:**
1. Break work into appropriate tier levels
2. Use feature for overall initiative
3. Use phases for major milestones
4. Use sessions for focused work
5. Use tasks for specific implementations

**Example:**
- Feature: "User Authentication System"
- Phase 1: "Backend API"
- Session 1.1: "JWT Implementation"
- Task 1.1.1: "Create JWT token generator"

**Reference:**
- See `.cursor/project-manager/docs/feature-tier-architecture.md` for tier hierarchy

---

## Command-Specific Issues

### Feature Commands

#### Issue: `/end-feature` prompts but merge fails
**Symptoms:**
- Feature end workflow starts
- Git merge fails
- Branch not deleted

**Solution:**
1. Verify all changes committed: `git status`
2. Check for merge conflicts: `git merge feature/[name]`
3. Resolve conflicts if any
4. Ensure `develop` branch is up to date: `git pull origin develop`
5. Retry merge manually if needed

**Manual Merge Process:**
```bash
git checkout develop
git pull origin develop
git merge feature/[name]
# Resolve conflicts if any
git push origin develop
git branch -d feature/[name]
```

---

#### Issue: Research phase not completed
**Symptoms:**
- `/start-feature` requires research phase
- Research questions not answered

**Solution:**
1. Complete research phase: `/feature-atomic-research [name]`
2. Answer all research questions (30+ questions)
3. Document research findings in feature guide
4. Update feature log with research phase entry

**Research Phase Requirements:**
- 30+ questions covering 6 categories
- Architecture & Design (5 questions)
- Scope & Phases (5 questions)
- External Research (5 questions)
- Risk & Mitigation (5 questions)
- Testing & Quality (5 questions)
- Documentation & Communication (5 questions)

**Reference:**
- See `.cursor/commands/docs/research-question-set.md` for research questions

---

### Phase Commands

#### Issue: Phase change creates confusion
**Symptoms:**
- `/change-phase` creates new phase structure
- Old phase structure still exists

**Solution:**
1. Review phase-change documentation before using
2. Understand difference between pivot changes and renumbering
3. Update all references to old phase number
4. Document change reason clearly

**Phase Change Types:**
- **Pivot Change:** Architecture/scope change, creates phase-change document
- **Renumbering:** Simple renumbering, updates references

**Reference:**
- See `.cursor/project-manager/docs/phase-change-workflow.md` for phase change guide

---

### Session Commands

#### Issue: Session end workflow incomplete
**Symptoms:**
- `/end-session` doesn't complete all steps
- Some steps skipped

**Solution:**
1. Verify app starts: `npm run start:dev:vue` or `/verify-app`
2. Run quality checks: `/verify vue` or linting
3. Update session log manually if needed
4. Update handoff document manually if needed
5. Git commit/push manually if needed

**Manual Session End Process:**
1. Verify app starts
2. Run quality checks
3. Update session log
4. Update handoff document
5. Git commit and push

**Reference:**
- See `.cursor/rules/USER_CODING_RULES.md` Rule 22 for session end workflow

---

## Common Error Messages

### "Feature [name] not found"
**Cause:** Feature directory doesn't exist or name mismatch  
**Solution:** Create feature with `/plan-feature [name] [description]` or verify name spelling

### "Phase [N] not found"
**Cause:** Phase directory doesn't exist or number mismatch  
**Solution:** Create phase with `/plan-phase [N] [description]` or use `/start-phase` (creates if missing)

### "Session [X.Y] not found"
**Cause:** Session directory doesn't exist or ID mismatch  
**Solution:** Create session with `/plan-session [X.Y] [description]` or use `/start-session` (creates if missing)

### "Command not recognized"
**Cause:** Command syntax error or typo  
**Solution:** Verify command syntax, check command naming format, ensure all parameters provided

### "Git branch [name] not found"
**Cause:** Feature branch not created or wrong name  
**Solution:** Create branch manually: `git checkout -b feature/[name]` or verify `/start-feature` completed

---

## Best Practices to Avoid Issues

### 1. Use Tier Discriminator
Before planning work, use `/tier-discriminator` to determine appropriate tier level.

### 2. Follow Command Naming
- Composite: `/{action}-{tier}` (e.g., `/start-feature`)
- Atomic: `/{tier}-atomic-{action}` (e.g., `/feature-atomic-load`)

### 3. Verify File Structure
Before using commands, verify file structure exists or use commands that create structure automatically.

### 4. Keep Documentation Updated
Update guides, logs, and handoffs regularly to avoid sync issues.

### 5. Use Conditional Compositions
Use `/start-phase` and `/start-session` which automatically create structure if missing.

### 6. Check Git Status
Before ending features, verify git status and resolve any conflicts.

### 7. Complete Research Phase
Complete research phase before starting feature implementation.

### 8. Review Templates
Review templates before creating new documents to ensure proper structure.

---

## Getting Help

### Documentation References
- **Command Syntax:** `.cursor/rules/USER_CODING_RULES.md` Rule 22
- **Architecture:** `.cursor/project-manager/docs/feature-tier-architecture.md`
- **Atomic Commands:** `.cursor/commands/docs/atomic-commands-architecture.md`
- **Tier Selection:** `.cursor/commands/docs/tier-discriminator-guide.md`
- **Templates:** `.cursor/commands/docs/template-usage-guide.md`

### Workflow Examples
- **Active Feature:** `.cursor/project-manager/features/vue-migration/`
- **Example Feature:** `.cursor/commands/docs/examples/features/EXAMPLE-user-authentication/`

### Common Commands
- `/tier-discriminator [description]` - Determine appropriate tier
- `/plan-feature [name] [description]` - Plan new feature
- `/start-feature [name]` - Start feature
- `/plan-phase [N] [description]` - Plan new phase
- `/start-phase [N] [description]` - Start phase
- `/plan-session [X.Y] [description]` - Plan new session
- `/start-session [X.Y] [description]` - Start session

---

## Reporting Issues

If you encounter an issue not covered in this guide:

1. **Document the issue:**
   - Command used
   - Expected behavior
   - Actual behavior
   - Error messages

2. **Check documentation:**
   - Review relevant architecture docs
   - Check command syntax
   - Verify file structure

3. **Try workarounds:**
   - Use alternative commands
   - Manual file creation
   - Manual git operations

4. **Update this guide:**
   - Add new issues and solutions
   - Improve existing solutions
   - Share with team

---

**End of Troubleshooting Guide**

*This guide should be updated as new issues are discovered and resolved.*

