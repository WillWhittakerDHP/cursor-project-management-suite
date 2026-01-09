# Feature Comment Cleanup Guide

**Command:** `/feature-comment-cleanup [--dry-run] [--no-compress]`

## Overview

The feature comment cleanup command removes phase-specific notes (e.g., "Phase 1.2.3: ...") from code comments and **compresses verbose comment clusters** to concise, context-friendly versions while preserving valuable architectural insights (WHY, PATTERN) that support AI understanding.

## When to Use

- **Automatically:** Runs as Step 2.6 in `/feature-end` workflow (after tests, before git operations)
- **Manually:** Run `/feature-comment-cleanup` to clean up phase notes and compress verbose comments
- **Preview:** Use `/feature-comment-cleanup --dry-run` to preview changes without modifying files
- **Skip Compression:** Use `/feature-comment-cleanup --no-compress` to only remove phase notes without compressing comments

## What Is Comment Compression?

**NEW FEATURE:** Comment compression analyzes clusters of verbose educational comments (LEARNING, COMPARISON, multiple WHY statements) and compresses them to concise, context-friendly versions that preserve the core architectural insight.

### Compression Strategy

1. **Identifies comment clusters:** Groups of 2+ typed comments or 3+ consecutive comments
2. **Extracts core insights:** Pulls out the essential architectural understanding from verbose explanations
3. **Prioritizes information:**
   - **WHY** (decision rationale) - Highest priority
   - **PATTERN** (architectural pattern) - Second priority
   - **SEE/REFERENCE** (related patterns) - Third priority
4. **Removes redundancy:** Eliminates repeated explanations, examples, and verbose scaffolding
5. **Preserves context:** Keeps essential understanding while reducing bloat

## What Gets Removed

The cleanup removes comments containing phase notes in these formats:

- `// Phase X.Y.Z: ...` (single-line comments with sub-phase)
- `// Phase X.Y: ...` (single-line comments without sub-phase)
- `/* Phase X.Y.Z: ... */` (multi-line comments)
- `* Phase X.Y.Z: ...` (JSDoc comment lines)
- `<!-- Phase X.Y.Z: ... -->` (HTML/Vue template comments)

**Examples:**
```typescript
/**
 * WHY: Phase 1.2: Complete data collection
WHY: Ensures all required data is collected
 */
```

## What Gets Compressed

When compression is enabled (default), the following comment patterns are compressed:

### Compression Targets

1. **Comment Clusters:** 2+ typed comments (WHY, LEARNING, COMPARISON, etc.) grouped together
2. **Verbose LEARNING Comments:** Educational scaffolding that explains "how" but not "why"
3. **Verbose COMPARISON Comments:** Framework comparisons that can be simplified to WHY
4. **Redundant Explanations:** Multiple comments saying similar things
5. **Example Code in Comments:** Inline examples that add verbosity

### Compression Rules

- **LEARNING → WHY:** Educational comments compressed to decision rationale
- **COMPARISON → WHY:** Framework comparisons compressed to core insight
- **Multiple WHY → Single WHY:** Redundant explanations merged
- **WHY + PATTERN Preserved:** Always kept in compressed form
- **SEE/REFERENCE Preserved:** Links to other patterns maintained

### What Is Never Compressed

- ✅ **Concise comments:** Already well-written WHY/PATTERN comments (≤2 lines)
- ✅ **Protected comments:** TODO, FIXME, Feature references, future work
- ✅ **Single comments:** Standalone comments not in clusters
- ✅ **Code comments:** Comments explaining specific code logic (not architectural)

**Example of Already-Concise (No Compression):**
```typescript
/**
 * WHY: Enables reactive UI updates when selections change
 * PATTERN: Use ref for single values, ref([]) for arrays
 */
```

## Integration with Feature End Workflow

The cleanup runs automatically as **Step 2.6** in the `/feature-end` workflow:

1. Step 1: Generate feature summary
2. Step 2: Close feature documentation
3. Step 2.5: Run tests (if requested)
4. **Step 2.6: Clean up phase notes** ← Runs here
5. Step 3: Git operations

The cleanup is **non-blocking** - if it fails, the feature-end workflow continues.

**Note:** Phase cleanup should run before feature cleanup. Phase cleanup removes session notes, feature cleanup removes phase notes. This ensures a clean progression.

## Examples

### Example 1: Phase Note Removal + Compression

**Before Cleanup:**
```typescript
/**
 * WHY: Enables reactive UI updates when selections change
 * PATTERN: Use ref for single values, ref([]) for arrays
 */
const selectedUserType = ref<BookingBlockInstance | null>(null)
```

**After Cleanup (with compression):**
```typescript
/**
 * WHY: Enables reactive UI updates when selections change
 * PATTERN: Use ref for single values, ref([]) for arrays
 */
const selectedUserType = ref<BookingBlockInstance | null>(null)
```

**What Changed:**
- ❌ Removed: Phase note `Phase 1.2: ...`
- 🗜️ Compressed: Verbose LEARNING and COMPARISON collapsed into concise WHY
- ✅ Preserved: Core architectural insight (WHY and PATTERN)

### Example 2: Multi-line Compression

**Before Cleanup:**
```typescript
/**
 * LEARNING: Vue Query Mutation Pattern
 * 
 * Vue Query uses mutations for POST/PUT/DELETE operations
 * Similar to React Query but with Vue's reactivity system
 * This provides automatic loading states and error handling
 * 
 * Phase 1.2: Complete data collection
 * WHY: Ensures all required data is collected before submission
 * 
 * PATTERN: Collect from wizard state, transform to API format
 * We use transformers to convert between frontend and API formats
 * This keeps the wizard state decoupled from the API
 */
function collectAppointmentData() { ... }
```

**After Cleanup (with compression):**
```typescript
/**
 * WHY: Ensures all required data is collected before submission
 * PATTERN: Collect from wizard state, transform to API format
 */
function collectAppointmentData() { ... }
```

**What Changed:**
- ❌ Removed: Phase note and verbose LEARNING explanation
- 🗜️ Compressed: 13 lines → 4 lines (69% reduction)
- ✅ Preserved: Essential WHY and PATTERN

### Example 3: Protected Comments (No Change)

**Before & After Cleanup:**
```typescript
/**
 * TODO: Feature 5 - Add support for recurring appointments
 * NOTE: This will require database schema changes
 * Phase 1.2: Initial planning
 */
// ✅ Protected - Contains TODO and Feature reference
```

Protected comments (TODO, FIXME, Feature references) are **never compressed or removed**.

## Manual Usage

### Preview Changes (Dry Run)
```bash
/feature-comment-cleanup --dry-run
```

Shows what would be changed without modifying any files (includes compression preview).

### Apply Full Cleanup (Remove + Compress)
```bash
/feature-comment-cleanup
```

Removes phase notes **and compresses verbose comment clusters** in all code files (`client-vue/` and `server/` directories).

### Remove Phase Notes Only (Skip Compression)
```bash
/feature-comment-cleanup --no-compress
```

Removes phase notes but preserves all comment verbosity (useful if you want to manually review comments first).

### Programmatic Usage
```typescript
import { featureCommentCleanup } from './cursor/commands';

// Full cleanup with compression (default)
const result = await featureCommentCleanup({ dryRun: false, compress: true });
console.log(result.summary);
console.log(`Files modified: ${result.filesModified}`);
console.log(`Comments removed: ${result.commentsRemoved}`);
console.log(`Comments compressed: ${result.commentsCompressed}`);

// Remove phase notes only, skip compression
const resultNoCompress = await featureCommentCleanup({ dryRun: false, compress: false });
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
- **Non-blocking:** Failures don't stop feature-end workflow
- **Error handling:** Errors are logged but don't fail the entire cleanup
- **Git-friendly:** Changes can be reviewed with `git diff` before committing

## Best Practices

1. **Run at feature end:** Let the automatic cleanup handle it during `/feature-end` (includes compression)
2. **Use dry-run first:** Preview both removal and compression changes with `--dry-run`
3. **Review changes:** Check `git diff` after cleanup to verify compression quality
4. **Trust compression:** The algorithm preserves essential WHY/PATTERN insights
5. **Skip compression if uncertain:** Use `--no-compress` if you want to review verbosity manually
6. **Run phase cleanup first:** If running manually, run `/phase-comment-cleanup` before `/feature-comment-cleanup`
7. **Expect significant reduction:** Typical compression reduces comment clusters by 50-70%

## Cleanup Order

When cleaning up manually, follow this order:

1. **Phase cleanup** (`/phase-comment-cleanup`) - Removes session notes
2. **Feature cleanup** (`/feature-comment-cleanup`) - Removes phase notes

This ensures phase notes that reference sessions are cleaned up properly.

## Related Commands

- `/phase-comment-cleanup` - Removes session notes (run at phase end)
- `/feature-end` - Complete feature workflow (includes cleanup)
- `/comment-add` - Add new comments to files
- `/comment-review` - Review files for comment suggestions

