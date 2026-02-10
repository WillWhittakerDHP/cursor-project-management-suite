# Phase Comment Cleanup Guide

**Command:** `/phase-comment-cleanup [--dry-run]`

## Overview

The phase comment cleanup command removes session-specific notes (e.g., "Session 1.3.2: ...") from code comments and evaluates both typed comments (WHY/PATTERN/LEARNING/RESOURCE) and regular comments for valuable "non-obvious" insights. Obvious or redundant comments are removed, while valuable comments are compressed to 2-3 concise lines.

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

## What Gets Preserved vs Removed

The cleanup evaluates both typed comments (WHY/PATTERN/LEARNING/RESOURCE) and regular comments for valuable "non-obvious" insights:

### Preserved (Valuable Comments)

Comments containing non-obvious insights are preserved and compressed:

- **Specific technical transformations** (RFC3339 conversion, format parsing)
- **Problem prevention explanations** (prevents bugs, avoids errors)
- **Architectural decisions** (why composable pattern, why this approach)
- **Technical concepts** (reactivity, dependency tracking, lifecycle)
- **Causal explanations** (because X, since Y, due to Z)

**Examples:**
```typescript
/**
 * WHY: Converts RFC3339 business hours to HH:mm for validation
 * PATTERN: Composable at top for access throughout
 */
```

### Removed (Obvious Comments)

Comments that are obvious or redundant with code are removed:

**Typed Comments (WHY/PATTERN/LEARNING/etc.):**
- **Generic actions** (gets, fetches, loads, saves)
- **Vague references** (this function, it, the code)
- **Generic connectors** without substance (for, to, when, if)
- **Obvious requirements** (always include, must use)
- **Redundant explanations** that are clear from code

**Regular Comments (non-typed):**
- **Obvious actions** (gets, fetches, loads, saves, sets, initializes)
- **Vague references** (this function, it, the code, the variable)
- **Generic verbs** (calculates, computes, processes, handles, manages)
- **Redundant labels** (function that does X, variable that stores Y)
- **Meta-comments** without substance (note, notice, remember)

**Examples (removed):**
```typescript
// LEARNING: Fetches current settings from business-settings API
// WHY: Populates form with current configuration
// PATTERN: API call with error handling
// ↑ All removed - obvious from code

// Gets the user data from the API
// ↑ Removed - obvious from code

// This function calculates the total
// ↑ Removed - vague and obvious
```

**Examples (preserved - regular comments):**
```typescript
// Workaround for race condition in async initialization
// ↑ Preserved - explains non-obvious problem

// Performance optimization: avoids O(n²) lookup
// ↑ Preserved - explains performance consideration

// Legacy format support - deprecated but still needed for backward compatibility
// ↑ Preserved - explains compatibility concern
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

### Before Cleanup (Valuable Comments)
```typescript
// LEARNING: Get time conversion functions from useLocalTime composable
// WHY: Need to convert RFC3339 business hours to HH:mm for validation
// PATTERN: Use composable at top of composable function for access throughout
const { convertToLocalTime } = useLocalTime();
```

### After Cleanup (Compressed)
```typescript
/**
 * WHY: Converts RFC3339 business hours to HH:mm for validation
 * PATTERN: Composable at top for access throughout
 */
const { convertToLocalTime } = useLocalTime();
```

### Before Cleanup (Obvious Comments)
```typescript
// LEARNING: Fetches current settings from business-settings API
// WHY: Populates form with current configuration
// PATTERN: API call with error handling
const settings = await fetchSettings();
```

### After Cleanup (Removed)
```typescript
const settings = await fetchSettings();
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
4. **Trust the evaluation:** The cleanup preserves non-obvious insights and removes obvious/redundant comments
5. **Compression:** Valuable comment clusters are compressed to 2-3 concise lines (max 75 chars per line)

## Related Commands

- `/feature-comment-cleanup` - Removes phase notes (run at feature end)
- `/phase-end` - Complete phase workflow (includes cleanup)
- `/comment-add` - Add new comments to files
- `/comment-review` - Review files for comment suggestions

