# Cursor Development Environment - Sync Guide

**Last Synced:** 2026-01-09

The `.cursor/` directory is maintained both:
1. **In this project** - For direct use
2. **In separate repo** - For sharing across projects

**Separate Repository:** https://github.com/WillWhittakerDHP/cursor-project-management-suite.git

---

## Quick Sync Commands

### Push Changes to Separate Repo

After making changes to `.cursor/` in this project:

```bash
cd .cursor
git add -A
git commit -m "Describe your changes"
git push origin main
```

### Pull Changes from Separate Repo

If the separate repo was updated elsewhere:

```bash
cd .cursor
git pull origin main
```

### Check Sync Status

```bash
cd .cursor
git status
git log --oneline -5
```

---

## Current Setup

The `.cursor/` directory has its own git repository initialized inside the main project:

- `.cursor/.git/` - Separate git repository (ignored by main repo)
- Remote: `origin` → `cursor-project-management-suite`
- Branch: `main` tracking `origin/main`

This is **NOT a git submodule** - it's a nested repository. This gives us flexibility:
- ✅ Changes in main repo stay independent
- ✅ Can sync to separate repo when ready
- ✅ No complex submodule update commands
- ✅ Full `.cursor/` content always available

---

## Workflow

### 1. Make Changes in Main Project

Work normally in `.cursor/` directory (commands, rules, etc.)

Main project tracks the **content** of `.cursor/`
Nested repo tracks the **history** of `.cursor/`

### 2. Commit to Main Project First

```bash
# In project root
git add .cursor/
git commit -m "Update cursor commands"
git push
```

### 3. Then Sync to Separate Repo

```bash
# In .cursor directory
cd .cursor
git add -A
git commit -m "Update cursor commands"
git push origin main
```

---

## Why This Setup?

**Advantages:**
- ✅ Direct access to all `.cursor/` files (no submodule checkout issues)
- ✅ Can edit and test immediately
- ✅ Independent commit histories
- ✅ Easy to sync when ready
- ✅ Can share with other projects via cloning separate repo

**Alternative (Submodule):**
If you want automatic sync, you could convert to a proper submodule.
See `SUBMODULE_INFO.md` for conversion instructions.

---

## Common Operations

### Sync After Major Updates

```bash
cd .cursor
git add -A
git commit -m "Major update: describe changes"
git push origin main
```

### Check What's Changed

```bash
cd .cursor
git status
git diff
```

### View Sync History

```bash
cd .cursor
git log --oneline --graph -10
```

### Force Push (Use Carefully!)

If repos are out of sync and you want to force alignment:

```bash
cd .cursor
git add -A
git commit -m "Force sync with main project state"
git push -f origin main
```

⚠️ **Warning:** This overwrites remote history. Only use when you're sure!

---

## Troubleshooting

### "Not a git repository" Error

If `.cursor/.git` was deleted:

```bash
cd .cursor
git init
git remote add origin https://github.com/WillWhittakerDHP/cursor-project-management-suite.git
git fetch origin
git branch -u origin/main main
```

### Merge Conflicts

If remote has changes you don't have:

```bash
cd .cursor
git fetch origin
git merge origin/main
# Resolve conflicts if any
git push origin main
```

### Start Fresh

If you want to reset to match main project:

```bash
cd .cursor
rm -rf .git
git init
git remote add origin https://github.com/WillWhittakerDHP/cursor-project-management-suite.git
git add -A
git commit -m "Reset to main project state"
git push -f origin main
```

---

## Using in Other Projects

To use this cursor environment in a new project:

### Option 1: Clone Separate Repo

```bash
cd your-new-project
git clone https://github.com/WillWhittakerDHP/cursor-project-management-suite.git .cursor
```

### Option 2: Add as Submodule

```bash
cd your-new-project
git submodule add https://github.com/WillWhittakerDHP/cursor-project-management-suite.git .cursor
```

---

## Notes

- The main project's `.gitignore` excludes `.cursor/.git` to avoid conflicts
- Both repos can have independent commit histories
- This setup was created on 2026-01-09
- Current sync includes: PR workflow, code quality audits, structure consolidation

### Critical files to keep in sync

When syncing, ensure these are included so app start and session-end work correctly:

- `commands/utils/verify-app.ts` – Port check (127.0.0.1), check-first, start:dev from resolved project root

For questions about this setup, see `SUBMODULE_INFO.md` or the main project documentation.
