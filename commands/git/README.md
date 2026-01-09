# Git Operations Commands

This directory contains slash commands for git operations in the workflow system. These commands abstract git operations from workflow execution, enabling reusable git manipulation logic across all tiers.

## Overview

Git commands are organized into **atomic** (single-responsibility) operations. All commands follow the existing command pattern and can be called programmatically or via slash commands.

The git abstraction uses utilities from `utils/utils.ts` for git operations (e.g., `runCommand`, `getCurrentBranch`), following the same pattern as other command categories.

## Quick Reference

See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for a one-page lookup table.

## Command Categories

### Atomic Commands

#### Branch Operations
- `createBranch(branchName)` - Create new git branch and switch to it

#### Commit Operations
- `gitCommit(suggestedMessage, finalMessage?)` - Stage all changes and commit with message

#### Push Operations
- `gitPush()` - Push current branch to origin

#### Merge Operations
- `gitMerge(params)` - Merge source branch into target branch (or current branch)

## Usage Examples

### Programmatic Usage

```typescript
import { createBranch, gitCommit, gitPush, gitMerge } from './cursor/commands/git';

// Create a new branch
const branchResult = await createBranch('feature/new-feature');
if (branchResult.success) {
  console.log(branchResult.output);
}

// Commit changes
const commitResult = await gitCommit('Add new feature', 'Add new feature implementation');
if (commitResult.success) {
  console.log(commitResult.output);
}

// Push to remote
const pushResult = await gitPush();
if (pushResult.success) {
  console.log(pushResult.output);
}

// Merge branches
const mergeResult = await gitMerge({
  sourceBranch: 'feature/new-feature',
  targetBranch: 'main'
});
if (mergeResult.success) {
  console.log(mergeResult.output);
}
```

### Slash Command Usage

Commands can be invoked via slash commands (if configured in your environment):
- `/create-branch feature-name` - Create and switch to new branch
- `/git-commit "Commit message"` - Stage and commit changes
- `/git-push` - Push current branch to origin
- `/git-merge source-branch [target-branch]` - Merge branches

## Integration with Workflow Commands

Git commands are designed to be called from workflow manager commands:

```typescript
import { createBranch, gitCommit, gitPush } from './cursor/commands/git';

// In a workflow command
export async function startSession(sessionId: string): Promise<string> {
  // Create branch for session
  const branchResult = await createBranch(`session-${sessionId}`);
  if (!branchResult.success) {
    return `Failed to create branch: ${branchResult.output}`;
  }
  
  // ... other workflow logic ...
  
  return 'Session started successfully';
}
```

## Command Details

### createBranch

Creates a new git branch and switches to it.

**Parameters:**
- `branchName: string` - Name of the branch to create

**Returns:**
```typescript
Promise<{ success: boolean; output: string }>
```

**Example:**
```typescript
const result = await createBranch('feature/user-auth');
// result.success: true
// result.output: "Created and switched to branch: feature/user-auth"
```

### gitCommit

Stages all changes and commits them with a message.

**Parameters:**
- `suggestedMessage: string` - Suggested commit message
- `finalMessage?: string` - Final commit message (optional, defaults to suggestedMessage)

**Returns:**
```typescript
Promise<{ success: boolean; output: string }>
```

**Example:**
```typescript
const result = await gitCommit('Add user authentication', 'Add user authentication feature');
// result.success: true
// result.output: "Committed: Add user authentication feature"
```

### gitPush

Pushes the current branch to the origin remote.

**Parameters:**
- None (uses current branch automatically)

**Returns:**
```typescript
Promise<{ success: boolean; output: string }>
```

**Example:**
```typescript
const result = await gitPush();
// result.success: true
// result.output: "Pushed to feature/user-auth"
```

### gitMerge

Merges a source branch into a target branch (or current branch if target not specified).

**Parameters:**
```typescript
interface GitMergeParams {
  sourceBranch: string;
  targetBranch?: string; // Optional, defaults to current branch
}
```

**Returns:**
```typescript
Promise<{ success: boolean; output: string }>
```

**Example:**
```typescript
const result = await gitMerge({
  sourceBranch: 'feature/user-auth',
  targetBranch: 'main'
});
// result.success: true
// result.output: "Successfully merged feature/user-auth into main"
```

**Error Handling:**
- Detects merge conflicts and returns detailed error messages
- Automatically checks out target branch if not already on it
- Returns clear error messages for failed operations

## Architecture

### Utilities

Core git logic uses utilities from `.cursor/commands/utils/`:
- `runCommand` - Execute git commands
- `getCurrentBranch` - Get current git branch name
- `WorkflowCommandContext` - Path resolution and context (for workflow integration)

### Commands

Command wrappers are in `.cursor/commands/git/`:
- `atomic/` - Single-responsibility commands
- `composite/` - Multi-step workflows (reserved for future use)

## Best Practices

1. **Check success** - Always check the `success` property before proceeding
2. **Handle errors** - Git operations can fail (conflicts, network issues, etc.)
3. **Use descriptive branch names** - Follow naming conventions (e.g., `feature/`, `fix/`, `session-`)
4. **Commit frequently** - Make small, focused commits
5. **Push after commits** - Push changes regularly to avoid conflicts
6. **Merge carefully** - Review merge results and handle conflicts manually if needed

## Related Documentation

- [Todo Commands](../todo/README.md) - Todo management integration
- [Status Commands](../status/README.md) - Status queries (includes git branch info)
- [Project Manager](../../project-manager/PROJECT_MANAGER_HANDOFF.md) - Core workflow utilities
- Workflow templates in `.cursor/commands/tiers/*/templates/`

