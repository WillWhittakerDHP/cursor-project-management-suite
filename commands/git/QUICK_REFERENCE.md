# Git Operations Quick Reference

## Commands

| Command | Function | Parameters | Description |
|---------|----------|------------|-------------|
| `/create-branch` | `createBranch` | `branchName: string` | Create new git branch and switch to it |
| `/git-commit` | `gitCommit` | `suggestedMessage: string, finalMessage?: string` | Stage all changes and commit with message |
| `/git-push` | `gitPush` | None | Push current branch to origin |
| `/git-merge` | `gitMerge` | `params: GitMergeParams` | Merge source branch into target branch |

## Parameter Types

### createBranch
```typescript
branchName: string
```

### gitCommit
```typescript
suggestedMessage: string
finalMessage?: string // Optional, defaults to suggestedMessage
```

### gitPush
```typescript
// No parameters - uses current branch automatically
```

### gitMerge
```typescript
interface GitMergeParams {
  sourceBranch: string;
  targetBranch?: string; // Optional, defaults to current branch
}
```

## Return Types

All commands return:
```typescript
Promise<{
  success: boolean;
  output: string;
}>
```

## Examples

### Create Branch
```typescript
const result = await createBranch('feature/user-auth');
// result.success: true
// result.output: "Created and switched to branch: feature/user-auth"
```

### Commit Changes
```typescript
const result = await gitCommit('Add user authentication', 'Add user authentication feature');
// result.success: true
// result.output: "Committed: Add user authentication feature"
```

### Push to Remote
```typescript
const result = await gitPush();
// result.success: true
// result.output: "Pushed to feature/user-auth"
```

### Merge Branches
```typescript
const result = await gitMerge({
  sourceBranch: 'feature/user-auth',
  targetBranch: 'main'
});
// result.success: true
// result.output: "Successfully merged feature/user-auth into main"
```

## Common Patterns

### Create Branch and Commit
```typescript
const branchResult = await createBranch('feature/new-feature');
if (branchResult.success) {
  // ... make changes ...
  const commitResult = await gitCommit('Add new feature');
  if (commitResult.success) {
    await gitPush();
  }
}
```

### Commit and Push Workflow
```typescript
const commitResult = await gitCommit('Update documentation');
if (commitResult.success) {
  const pushResult = await gitPush();
  if (!pushResult.success) {
    console.error('Failed to push:', pushResult.output);
  }
}
```

### Merge with Error Handling
```typescript
const mergeResult = await gitMerge({
  sourceBranch: 'feature/user-auth',
  targetBranch: 'main'
});

if (!mergeResult.success) {
  if (mergeResult.output.includes('conflict')) {
    // Handle merge conflict
    console.error('Merge conflict detected:', mergeResult.output);
  } else {
    // Handle other errors
    console.error('Merge failed:', mergeResult.output);
  }
}
```

### Check Current Branch Before Operations
```typescript
import { getCurrentBranch } from '../../utils/utils';

const currentBranch = await getCurrentBranch();
console.log('Current branch:', currentBranch);

if (currentBranch === 'main') {
  // Don't commit directly to main
  const branchResult = await createBranch('feature/my-feature');
  // ... work on feature branch ...
}
```

## Error Handling

All commands return `{ success: boolean, output: string }`:
- `success: true` - Operation completed successfully
- `success: false` - Operation failed, `output` contains error message

### Common Error Scenarios

**Branch Already Exists:**
```typescript
const result = await createBranch('existing-branch');
// result.success: false
// result.output: "error: branch 'existing-branch' already exists"
```

**Merge Conflicts:**
```typescript
const result = await gitMerge({ sourceBranch: 'feature/a', targetBranch: 'main' });
// result.success: false
// result.output: "Merge conflict detected when merging feature/a into main.\nPlease resolve conflicts manually..."
```

**Push Failures:**
```typescript
const result = await gitPush();
// result.success: false
// result.output: "error: failed to push some refs to 'origin'"
```

## Integration with Workflow Commands

Git commands are commonly used in workflow commands:

**Session Start:**
```typescript
const branchResult = await createBranch(`session-${sessionId}`);
```

**Session End:**
```typescript
const commitResult = await gitCommit(commitMessage);
const pushResult = await gitPush();
const mergeResult = await gitMerge({
  sourceBranch: sessionBranch,
  targetBranch: 'main'
});
```

**Phase End:**
```typescript
const branchResult = await createBranch(newBranchName);
const commitResult = await gitCommit(commitMessage);
const pushResult = await gitPush();
const mergeResult = await gitMerge({
  sourceBranch: phaseBranch,
  targetBranch: 'main'
});
```

