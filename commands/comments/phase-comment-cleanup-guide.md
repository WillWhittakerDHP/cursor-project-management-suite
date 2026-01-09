# Phase Comment Cleanup Guide

**Command:** `/phase-comment-cleanup [--dry-run]`

## Overview

The phase comment cleanup command removes session-specific notes (e.g., "Session 1.3.2: ...") from code comments while preserving valuable architectural comments (WHY, PATTERN, LEARNING, etc.) that support AI understanding.

## When to Use

- **Automatically:** Runs as Step 2.7 in `/phase-end` workflow (after tests, before git operations)
- **Manually:** Run `/phase-comment-cleanup` to clean up session notes at any time
- **Preview:** Use `/phase-comment-cleanup --dry-run` to preview changes without modifying files

## What Gets Removed

The cleanup removes comments containing session notes in these formats:

- `// Session X.Y.Z: ...` (single-line comments)
- `/* Session X.Y.Z: ... */` (multi-line comments)
- `* Session X.Y.Z: ...` (JSDoc comment lines)
- `<!-- Session X.Y.Z: ... -->` (HTML/Vue template comments)

**Examples:**
```typescript
/**
 * WHY: Session 1.3.2: Form Validation Implementation
WHY: Ensures data integrity
 */
```

## What Gets Preserved

The cleanup preserves all valuable architectural comments:

- `// WHY: ...` - Decision rationale
- `// PATTERN: ...` - Architectural patterns
- `// LEARNING: ...` - Learning notes (may be compressed if verbose)
- `// ARCHITECTURE: ...` - Architecture notes
- `// COMPARISON: ...` - Framework comparisons
- `// RESOURCE: ...` - Learning resources

**Examples:**
```typescript
/**
 * WHY: Enables reactive UI updates when selections change
 * PATTERN: Use ref for single values, ref([]) for arrays
 */
```

## Integration with Phase End Workflow

The cleanup runs automatically as **Step 2.7** in the `/phase-end` workflow:

1. Step 1: Mark phase complete
2. Step 2: Update handoff
3. Step 2.5: Run tests (if requested)
4. Step 2.6: Verify test strategy
5. **Step 2.7: Clean up session notes** ← Runs here
6. Step 3: Security audit
7. Step 4: Git operations

The cleanup is **non-blocking** - if it fails, the phase-end workflow continues.

## Examples

### Before Cleanup
```typescript
// LEARNING: Reactive state for wizard selections
// WHY: Enables reactive UI updates when selections change
// PATTERN: Use ref for single values, ref([]) for arrays
const selectedUserType = ref<BookingBlockInstance | null>(null)
```

### After Cleanup
```typescript
// WHY: Enables reactive UI updates when selections change
// PATTERN: Use ref for single values, ref([]) for arrays
const selectedUserType = ref<BookingBlockInstance | null>(null)
```

### Before Cleanup (Multi-line)
```typescript
/**
 * Session 1.3.2: Form Validation Implementation
 * WHY: Ensures data integrity before submission
 * PATTERN: Validate on change, show errors inline
 */
function validateForm() { ... }
```

### After Cleanup
```typescript
/**
 * WHY: Ensures data integrity before submission
 * PATTERN: Validate on change, show errors inline
 */
function validateForm() { ... }
```

## Manual Usage

### Preview Changes (Dry Run)
```bash
/phase-comment-cleanup --dry-run
```

This shows what would be changed without modifying any files.

### Apply Cleanup
```bash
/phase-comment-cleanup
```

This removes session notes from all code files in `client-vue/` and `server/` directories.

### Programmatic Usage
```typescript
import { phaseCommentCleanup } from './cursor/commands';

const result = await phaseCommentCleanup({ dryRun: false });
console.log(result.summary);
console.log(`Files modified: ${result.filesModified}`);
console.log(`Comments removed: ${result.commentsRemoved}`);
```

## File Processing

The cleanup processes these file types:
- `.ts`, `.tsx` - TypeScript files
- `.vue` - Vue component files
- `.js`, `.jsx` - JavaScript files
- `.md` - Markdown files

**Excluded directories:**
- `node_modules/`
- `dist/`
- `.git/`
- `.cursor/`

## Safety Features

- **Dry-run mode:** Preview changes before applying
- **Non-blocking:** Failures don't stop phase-end workflow
- **Error handling:** Errors are logged but don't fail the entire cleanup
- **Git-friendly:** Changes can be reviewed with `git diff` before committing

## Best Practices

1. **Run at phase end:** Let the automatic cleanup handle it during `/phase-end`
2. **Review changes:** Check `git diff` after cleanup to verify changes
3. **Use dry-run first:** Preview changes before applying manually
4. **Preserve WHY/PATTERN:** These comments are kept to support AI understanding

## Related Commands

- `/feature-comment-cleanup` - Removes phase notes (run at feature end)
- `/phase-end` - Complete phase workflow (includes cleanup)
- `/comment-add` - Add new comments to files
- `/comment-review` - Review files for comment suggestions

