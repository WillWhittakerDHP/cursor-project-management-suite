# Repository Guidelines for AI Assistants

## ⚠️ CRITICAL: Default Repository

**ALL WORK IN THIS PROJECT USES:**
```
Repository: DHP_Differential_Scheduler
URL: https://github.com/WillWhittakerDHP/DHP_Differential_Scheduler.git
```

**This is the ONLY repository you should commit to by default.**

## Repository Structure

### Primary Repository (Default for Everything)
- **Name:** `DHP_Differential_Scheduler`
- **URL:** `https://github.com/WillWhittakerDHP/DHP_Differential_Scheduler.git`
- **Contains:** 
  - Full application code (client-vue, server, etc.)
  - `.cursor` folder (commands, rules, docs)
  - Project documentation
  - All configuration files
- **Git Remote:** `origin`
- **Default Branch:** `feature/data-flow-alignment` (or current working branch)

### Secondary Repository (Manual Sync Only)
- **Name:** `cursor-project-management-suite`
- **URL:** `https://github.com/WillWhittakerDHP/cursor-project-management-suite.git`
- **Contains:** ONLY `.cursor` folder contents
- **Purpose:** Share cursor environment across multiple projects
- **Updates:** Manual/explicit sync by request only
- **Git Remote:** NOT configured in this workspace

## Rules for AI Assistants

### ✅ ALWAYS Do This (Default Behavior)

1. **All commits go to `DHP_Differential_Scheduler`**
   ```bash
   cd /Users/districthomepro/Bonsai/Differential_Scheduler
   git add <files>
   git commit -m "message"
   git push origin <current-branch>
   ```

2. **This includes:**
   - Application code changes (client-vue, server, etc.)
   - `.cursor` folder changes (commands, rules, docs)
   - Documentation updates
   - Configuration changes
   - **EVERYTHING**

### ⚠️ ONLY Do This When Explicitly Requested

Sync to `cursor-project-management-suite`:
1. **User must explicitly say:** "also push to cursor-project-management-suite" or similar
2. **Process:**
   ```bash
   # Clone standalone repo to temp location
   cd /tmp
   git clone https://github.com/WillWhittakerDHP/cursor-project-management-suite.git
   
   # Copy ONLY .cursor folder contents
   rsync -av --exclude='.git' \
     /Users/districthomepro/Bonsai/Differential_Scheduler/.cursor/ \
     /tmp/cursor-project-management-suite/
   
   # Commit and push to standalone repo
   cd /tmp/cursor-project-management-suite
   git add -A
   git commit -m "..."
   git push origin main
   
   # Clean up
   rm -rf /tmp/cursor-project-management-suite
   ```
3. **Confirm with user:** Show what will be synced before pushing

### ❌ NEVER Do This

1. **Never change git remote** to point to `cursor-project-management-suite`
2. **Never assume** cursor changes should go to standalone repo
3. **Never commit application code** to `cursor-project-management-suite`
4. **Never convert `.cursor` to a submodule** without explicit permission
5. **Never push to standalone repo** unless explicitly asked

## Common Scenarios

### Scenario 1: Regular Development Work
**What to do:** Commit and push to `DHP_Differential_Scheduler` only.

```bash
# Example: User asks to add a new feature
$ git add client-vue/src/components/NewFeature.vue
$ git commit -m "feat: Add new feature"
$ git push origin feature/data-flow-alignment
```

✅ **Correct:** Only pushed to `DHP_Differential_Scheduler`

### Scenario 2: Cursor Command Changes
**What to do:** Commit and push to `DHP_Differential_Scheduler` by default.

```bash
# Example: User updates a cursor command
$ git add .cursor/commands/testing/test-new-feature.ts
$ git commit -m "feat(cursor): Add new test command"
$ git push origin feature/data-flow-alignment
```

✅ **Correct:** Cursor changes go to main repo by default  
⚠️ **Only if explicitly requested:** Also sync to standalone repo

### Scenario 3: User Explicitly Requests Standalone Sync
**User says:** "also push these cursor changes to the standalone repo"

**What to do:**
1. ✅ First commit to `DHP_Differential_Scheduler`
2. ✅ Then sync to `cursor-project-management-suite`
3. ✅ Confirm both pushes completed

```bash
# Step 1: Push to main repo (always first)
$ git push origin feature/data-flow-alignment

# Step 2: Sync to standalone repo (only if requested)
# [Follow manual sync process above]
```

### Scenario 4: Mixed Changes (Code + Cursor)
**What to do:** ALL changes go to `DHP_Differential_Scheduler`.

```bash
# Example: User updates both app code and cursor commands
$ git add client-vue/src/components/Feature.vue
$ git add .cursor/commands/testing/test-feature.ts
$ git commit -m "feat: Add feature with test command"
$ git push origin feature/data-flow-alignment
```

✅ **Correct:** Everything goes to main repo  
❌ **Wrong:** Splitting commits between repos

## Verification Checklist

Before committing, verify:

1. ✅ **Is this the main repo?**
   ```bash
   $ git remote -v
   # Should show: DHP_Differential_Scheduler
   ```

2. ✅ **Am I on the correct branch?**
   ```bash
   $ git branch
   # Should show: feature/data-flow-alignment (or current working branch)
   ```

3. ✅ **Did user explicitly request standalone sync?**
   - If NO → Only commit to main repo
   - If YES → Commit to main repo first, then sync

## Repository Relationship Diagram

```
┌─────────────────────────────────────────────────────────┐
│   DHP_Differential_Scheduler (Main Workspace)           │
│                                                         │
│   ├── client-vue/          (App code)                  │
│   ├── server/              (App code)                  │
│   ├── .cursor/             (Cursor environment)        │
│   │   ├── commands/                                    │
│   │   ├── rules/                                       │
│   │   └── project-manager/                            │
│   └── ... (other files)                               │
│                                                         │
│   Git Remote: origin → DHP_Differential_Scheduler.git  │
│   DEFAULT FOR ALL COMMITS ✅                           │
└─────────────────────────────────────────────────────────┘
                              │
                              │ Manual sync only
                              │ (when explicitly requested)
                              ↓
┌─────────────────────────────────────────────────────────┐
│   cursor-project-management-suite (Standalone)          │
│                                                         │
│   ├── commands/            (Copy of .cursor/commands)  │
│   ├── rules/               (Copy of .cursor/rules)     │
│   └── project-manager/     (Copy of .cursor/pm)        │
│                                                         │
│   Git Remote: NOT in this workspace                    │
│   MANUAL SYNC ONLY ⚠️                                   │
└─────────────────────────────────────────────────────────┘
```

## Key Principles

1. **One Source of Truth:** `DHP_Differential_Scheduler` is the primary workspace
2. **Default to Main Repo:** When in doubt, commit to main repo only
3. **Explicit Sync Only:** Standalone repo requires explicit user request
4. **No Automatic Sync:** Never automatically sync to standalone repo
5. **Safety First:** Better to ask than push to wrong repo

## For Future AI Sessions

When starting a new session, verify:

```bash
# 1. Check you're in the main workspace
$ pwd
# Should be: /Users/districthomepro/Bonsai/Differential_Scheduler

# 2. Check git remote
$ git remote -v
# Should show: DHP_Differential_Scheduler

# 3. Check current branch
$ git branch
# Note the current branch (likely feature/data-flow-alignment)
```

**Then proceed with ALL work using the main repository.**

## Emergency: If Wrong Repo Was Used

If you accidentally pushed to the wrong repository:

1. **Don't panic** - Git changes can be reverted
2. **Stop immediately** - Don't push more changes
3. **Inform user** - Explain what happened
4. **Wait for instructions** - User will decide how to fix

## Summary for AI Assistants

**Remember:**
- 🎯 **Default:** ALL commits → `DHP_Differential_Scheduler`
- ⚠️ **Exception:** Standalone sync ONLY when explicitly requested
- ✅ **Safe:** When in doubt, use main repo only
- ❌ **Never:** Automatically sync to standalone repo

**If user says:** "commit and push"
→ Push to `DHP_Differential_Scheduler`

**If user says:** "commit and push to both repos" or "also update the standalone repo"
→ Push to `DHP_Differential_Scheduler` first, then sync to standalone


