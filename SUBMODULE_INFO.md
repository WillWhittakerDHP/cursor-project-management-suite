# Cursor Development Environment - Submodule Information

The `.cursor/` folder in this project can optionally be replaced with a git submodule pointing to the standalone repository.

## Standalone Repository

**Repository:** `cursor-project-management-suite`  
**URL:** `https://github.com/WillWhittakerDHP/cursor-project-management-suite.git`

This repository contains:
- All slash commands (`commands/`)
- All coding rules (`rules/`)
- Project management tools (`project-manager/`)

## Current Setup

Currently, `.cursor/` is part of this repository directly. This works fine, but if you want to:

1. **Share the environment across multiple projects**
2. **Version-lock to specific releases**
3. **Easily update across all projects**

You can convert it to a submodule.

## Converting to Submodule (Optional)

If you want to use the submodule approach:

```bash
# Backup existing .cursor/ (optional)
mv .cursor .cursor.backup

# Remove from git tracking
git rm -r --cached .cursor

# Add as submodule
git submodule add https://github.com/WillWhittakerDHP/cursor-project-management-suite.git .cursor

# Commit the change
git commit -m "Replace .cursor/ with submodule"
```

## Updating the Submodule

If using as submodule:

```bash
# Update to latest version
git submodule update --remote .cursor

# Commit the update
git add .cursor
git commit -m "Update Cursor development environment"
```

## For New Projects

When starting a new project, use the submodule from the start:

```bash
# In your new project root
git submodule add https://github.com/WillWhittakerDHP/cursor-project-management-suite.git .cursor
git commit -m "Add Cursor development environment as submodule"
```

See the standalone repository's `INSTALLATION.md` for complete instructions.

