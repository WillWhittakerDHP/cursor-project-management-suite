# Installation Guide

Complete guide for installing the Cursor Project Management Suite in your project.

## Prerequisites

- Git installed on your system
- A project where you want to use the Cursor development environment
- Cursor IDE (or compatible editor that supports `.cursor/` folder)

## Installation Methods

### Method 1: Git Submodule (Recommended)

**Best for:** Projects using git version control, teams, or when you want to easily update to new versions.

#### Step 1: Add as Submodule

In your project root directory:

```bash
git submodule add https://github.com/WillWhittakerDHP/cursor-project-management-suite.git .cursor
```

This will:
- Clone the repository into `.cursor/` folder
- Add submodule configuration to `.gitmodules`
- Stage the submodule for commit

#### Step 2: Commit the Submodule

```bash
git commit -m "Add Cursor development environment as submodule"
```

#### Step 3: Verify Installation

Check that the `.cursor/` folder exists and contains:
- `commands/` directory
- `rules/` directory
- `project-manager/` directory

```bash
ls -la .cursor/
```

#### Updating the Submodule

When new versions are released:

```bash
# Update to latest version
git submodule update --remote .cursor

# Commit the update
git add .cursor
git commit -m "Update Cursor development environment"
```

#### Cloning a Project with Submodule

If someone clones your project that uses this submodule:

```bash
# Clone the project
git clone <your-project-url>
cd <your-project>

# Initialize and update submodules
git submodule update --init --recursive
```

### Method 2: Manual Copy

**Best for:** Quick setup, projects not using git, or when you want full control over the files.

#### Step 1: Clone the Repository

```bash
git clone https://github.com/WillWhittakerDHP/cursor-project-management-suite.git temp-cursor
```

#### Step 2: Copy to Your Project

```bash
# Copy all contents to .cursor/ folder in your project
cp -r temp-cursor/* /path/to/your/project/.cursor/

# Or if you're already in your project root:
cp -r temp-cursor/* .cursor/
```

#### Step 3: Clean Up

```bash
rm -rf temp-cursor
```

#### Step 4: Verify Installation

Check that the `.cursor/` folder exists and contains the expected directories:

```bash
ls -la .cursor/
```

**Note:** With manual copy, you'll need to manually update files when new versions are released. Consider using the submodule method for easier updates.

## Configuration

### Cursor IDE Configuration

Cursor automatically detects the `.cursor/` folder in your project root. No additional configuration is needed.

The rules are automatically loaded from:
- `.cursor/rules/PROJECT_CODING_RULES.md` (always applied)
- `.cursor/rules/USER_CODING_RULES.md` (always applied)

### Verify Rules are Loaded

1. Open Cursor IDE
2. Check the rules indicator (usually in status bar or settings)
3. You should see rules from `PROJECT_CODING_RULES.md` and `USER_CODING_RULES.md` loaded

### Verify Commands are Available

1. In Cursor, type `/` to see available slash commands
2. You should see commands like:
   - `/session-start`
   - `/task-end`
   - `/verify`
   - `/status`
   - And many more...

## Troubleshooting

### Submodule Issues

**Problem:** Submodule shows as modified when it shouldn't

```bash
# Check submodule status
git submodule status

# If it shows modifications, you may have local changes
cd .cursor
git status
```

**Solution:** Either commit your changes or reset to the tracked commit:

```bash
cd .cursor
git reset --hard HEAD
cd ..
```

**Problem:** Submodule is empty after clone

```bash
# Initialize and update submodules
git submodule update --init --recursive
```

### Commands Not Available

**Problem:** Slash commands don't appear in Cursor

**Solutions:**
1. Ensure `.cursor/commands/` folder exists
2. Restart Cursor IDE
3. Check that `commands/index.ts` exists and exports commands
4. Verify Cursor is configured to load commands from `.cursor/commands/`

### Rules Not Loading

**Problem:** Coding rules don't seem to be applied

**Solutions:**
1. Check that `.cursor/rules/PROJECT_CODING_RULES.md` exists
2. Verify the file has `alwaysApply: true` in frontmatter
3. Restart Cursor IDE
4. Check Cursor settings for rules configuration

### Path Issues

**Problem:** Commands fail with path errors

**Solutions:**
1. Ensure you're running commands from project root
2. Check that `.cursor/` is in project root, not nested
3. Verify relative paths in command files are correct

## Uninstallation

### Remove Submodule

If you installed as a submodule and want to remove it:

```bash
# Remove submodule entry from .gitmodules
git submodule deinit -f .cursor

# Remove submodule entry from .git/config
git rm --cached .cursor

# Remove the .cursor directory
rm -rf .cursor

# Remove .gitmodules if empty
rm .gitmodules

# Commit the removal
git commit -m "Remove Cursor development environment submodule"
```

### Remove Manual Copy

Simply delete the `.cursor/` folder:

```bash
rm -rf .cursor
```

## Next Steps

After installation:

1. **Read the README**: See `README.md` for overview of features
2. **Explore Commands**: Check `commands/README.md` for available commands
3. **Review Rules**: Read `rules/PROJECT_CODING_RULES.md` and `rules/USER_CODING_RULES.md`
4. **Start Using**: Try `/session-start` or `/status` to get started

## Getting Help

- **Documentation**: Check `README.md` and category-specific READMEs
- **Issues**: Open an issue on GitHub: https://github.com/WillWhittakerDHP/cursor-project-management-suite/issues
- **Troubleshooting**: See `commands/docs/troubleshooting-guide.md`

---

**Last Updated**: 2025-01-27

