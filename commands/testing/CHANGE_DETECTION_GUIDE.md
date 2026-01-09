# Change Detection and Impact Analysis Guide

## Overview

This guide explains the enhanced testing system with intelligent change detection and impact analysis. These enhancements provide **proactive warnings** about test failures while maintaining test integrity.

## Philosophy

### What We Do ✅

- **Detect changes** before tests fail
- **Predict impact** with confidence levels
- **Auto-classify** valid modification reasons
- **Provide guidance** for fixing tests
- **Maintain transparency** - show all predictions and analysis

### What We Don't Do ❌

- **Auto-update tests** to make them pass
- **Hide problems** with silent fallbacks
- **Compromise test integrity** with automatic fixes
- **Guess** when uncertain - we show confidence levels

## Key Concepts

### 1. Change Types

| Type | Description | Confidence | Test Impact |
|------|-------------|------------|-------------|
| **Breaking** | Signature changes, removals, renames | High | Tests WILL fail |
| **Non-Breaking** | New additions, internal changes | High | Tests should pass |
| **Internal** | Implementation details changed | Medium | Tests may fail |
| **Unknown** | Cannot determine impact | Low | Proceed with caution |

### 2. Context-Aware Immutability

Tests marked `@immutable` can now be modified when:

**Automatic Detection:**
- Related code file changed recently → Auto-classified as `feature-change`
- System provides context → Auto-classified based on `changeType`

**Manual Classification:**
- Explicit reason provided → Validated against allowed reasons
- No context available → Requires manual reason

### 3. Impact Analysis

Before running tests, the system:

1. **Detects Changed Files**
   - Git uncommitted files
   - Provided file paths
   - Recently modified files (5-minute window)

2. **Analyzes Changes**
   - Function signature changes
   - Export removals
   - Symbol renames
   - Type changes

3. **Predicts Test Failures**
   - Which tests will fail
   - Why they will fail
   - How to fix them

4. **Checks Immutability**
   - Auto-classifies based on context
   - Determines if test modification allowed
   - Provides clear reasoning

## Usage Examples

### Example 1: Making a Breaking Change

**Scenario:** You need to add a parameter to a function.

```typescript
// Before: calculator.ts
export function calculate(a: number, b: number): number {
  return a + b;
}

// After: calculator.ts
export function calculate(a: number, b: number, operation: string): number {
  if (operation === 'add') return a + b;
  if (operation === 'subtract') return a - b;
  return 0;
}
```

**Workflow:**

```bash
# Step 1: Analyze impact before making changes
/test-analyze-impact src/utils/calculator.ts

# Output:
# 📊 Test Impact Analysis
# 
# Detected 1 changed file(s) affecting 1 test file(s).
# Change Type: breaking (confidence: high)
# 
# 1 test file(s) likely to have failures:
#   - src/utils/calculator.test.ts
#     Reason: Function signature changed: export function calculate(a, b, operation)
#     Action: Update test calls to match new function signature
# 
# ⚠️  Breaking changes detected. Tests may need updates.

# Step 2: Make your changes (edit calculator.ts)

# Step 3: Run tests with auto-detection
/test-on-change src/utils/calculator.ts

# Output:
# 📊 Change Impact Analysis:
#   - Change Type: breaking (high confidence)
#   - Affected Tests: 1
#   - Predicted Failures: 1
# 
# ⚠️  Breaking changes detected. Tests may need updates.
# 
# Running tests...
# [Tests fail as predicted]

# Step 4: Fix tests (system has auto-classified as feature-change)
# Edit calculator.test.ts - immutability bypassed automatically
```

### Example 2: Refactoring Internal Implementation

**Scenario:** You refactor internal logic without changing the API.

```typescript
// Before: formatter.ts
export function formatName(first: string, last: string): string {
  return first + ' ' + last;
}

// After: formatter.ts (refactored)
export function formatName(first: string, last: string): string {
  return `${first} ${last}`; // Using template literal
}
```

**Workflow:**

```bash
# Analyze impact
/test-analyze-impact src/utils/formatter.ts

# Output:
# 📊 Test Impact Analysis
# 
# Detected 1 changed file(s) affecting 1 test file(s).
# Change Type: internal (confidence: medium)
# 
# ✅ No breaking changes detected. Tests should pass.

# Run tests
/test-on-change src/utils/formatter.ts

# Output:
# 📊 Change Impact Analysis:
#   - Change Type: internal (medium confidence)
#   - Affected Tests: 1
#   - Predicted Failures: 0
# 
# ✅ No breaking changes detected. Tests will run normally.
# 
# Running tests...
# [Tests pass]
```

### Example 3: Working with Immutable Tests

**Scenario:** Test is marked `@immutable` and you need to update it.

```typescript
// calculator.test.ts (marked @immutable)
/**
 * CALCULATOR TESTS
 * 
 * Tests for calculator utility functions.
 * 
 * @immutable - Tests are stable and passing
 */
describe('calculate', () => {
  it('should add two numbers', () => {
    expect(calculate(1, 2)).toBe(3);
  });
});
```

**Workflow:**

```bash
# Check immutability status
/test-check-immutable src/utils/calculator.test.ts

# Output:
# 🔒 Test is immutable
# Cannot modify without valid reason
# Valid reasons: feature-change, test-bug, refactoring

# Make code change to calculator.ts
# (add parameter as in Example 1)

# Run tests with auto-detection
/test-on-change src/utils/calculator.ts

# Output:
# 📊 Change Impact Analysis:
#   - Change Type: breaking (high confidence)
#   - Affected Tests: 1
# 
# ✅ Test Modification Status:
#   - calculator.test.ts: CAN MODIFY (feature-change detected automatically)
# 
# ⚠️  Breaking changes detected. Tests may need updates.
# This is a FEATURE CHANGE - test modifications are allowed.

# Fix tests - immutability bypassed automatically!
```

## Command Reference

### Atomic Commands

#### `/test-analyze-impact [file-paths...]`

Analyze code changes without running tests.

**Use Cases:**
- Planning breaking changes
- Estimating impact scope
- Getting guidance before implementation

**Example:**
```bash
/test-analyze-impact src/utils/calculator.ts src/utils/formatter.ts
```

### Composite Commands

#### `/test-on-change [file-paths...] [--skip-impact-analysis] [--test-target]`

Run tests with automatic impact analysis.

**Use Cases:**
- After making code changes
- During development iteration
- Before committing changes

**Example:**
```bash
# With impact analysis (default)
/test-on-change src/utils/calculator.ts

# Skip analysis for speed
/test-on-change src/utils/calculator.ts --skip-impact-analysis

# Specify test target
/test-on-change src/utils/calculator.ts --test-target vue
```

## Integration with Existing Workflows

### Task Checkpoints

Task checkpoints already include smart watch mode detection. Now they also benefit from change detection:

```bash
/task-checkpoint 1.3.1 "Added calculator function" vue

# Automatically:
# 1. Detects recently modified files
# 2. Analyzes impact
# 3. Auto-classifies immutability reasons
# 4. Runs tests in watch mode
# 5. Provides error analysis on failure
```

### End-of-Workflow Tests

```bash
# Session end with tests
/session-end 1.3 "Core utilities" 1.4 --test

# Automatically includes:
# - Impact analysis for session files
# - Auto-classification for immutable tests
# - Comprehensive error analysis
```

## Configuration

Change detection respects existing test configuration:

```typescript
// From test-config.ts
export const TEST_CONFIG: TestConfig = {
  analyzeErrors: true,          // Enable error analysis
  allowTestFileFixes: true,     // Allow test modifications
  promptResolution: {
    enabled: true,              // Enable prompt-driven resolution
    autoFixTestCode: false,     // Don't auto-fix (require permission)
  },
};
```

## Best Practices

### DO ✅

1. **Analyze before big changes**
   ```bash
   /test-analyze-impact file.ts
   ```

2. **Use auto-detection for related changes**
   ```bash
   /test-on-change file.ts  # Auto-classifies immutability
   ```

3. **Trust the predictions**
   - High confidence = very likely accurate
   - Medium confidence = probably accurate
   - Low confidence = uncertain, proceed carefully

4. **Fix tests after code works**
   - Let tests fail first
   - Fix based on predictions
   - Verify tests actually test the right thing

### DON'T ❌

1. **Don't skip impact analysis habitually**
   - It's fast and provides valuable context
   - Only skip when truly unnecessary

2. **Don't ignore breaking change warnings**
   - High confidence breaking = tests WILL fail
   - Prepare for test updates

3. **Don't modify tests to make them pass**
   - If tests fail unexpectedly, check your code first
   - Tests should validate code, not adjust to it

4. **Don't trust low confidence predictions**
   - Low confidence = system is uncertain
   - Manual review recommended

## Troubleshooting

### "No changes detected"

**Cause:** Files aren't in git or recently modified.

**Solution:**
```bash
# Explicitly provide file paths
/test-on-change src/utils/calculator.ts

# Or include uncommitted files
/test-analyze-impact src/utils/calculator.ts --include-uncommitted
```

### "Test is immutable - cannot modify"

**Cause:** Test is marked `@immutable` and no context detected.

**Solution:**
```bash
# Option 1: Make related code change (auto-detects)
# Edit calculator.ts, then:
/test-on-change src/utils/calculator.ts

# Option 2: Provide explicit reason
/test-check-immutable src/utils/calculator.test.ts "feature-change"
```

### "Low confidence prediction"

**Cause:** System cannot determine change type with certainty.

**Solution:**
- Manually review changes
- Consider detailed analysis with git diff
- Proceed with caution
- Trust test failures over predictions

## Technical Details

### Change Detection Algorithm

1. **File Collection**
   - Git uncommitted files (`git status --porcelain`)
   - Provided file paths
   - Recently modified files (mtime < 5 minutes)

2. **Change Analysis**
   - Git diff parsing (`git diff HEAD file`)
   - Pattern matching for breaking changes:
     - Function signature: `/function|const.*=.*\(|export/`
     - Exports removed: `/^-.*export/`
     - Renames: `/function|const|class|interface|type\s+(\w+)/`

3. **Test File Discovery**
   - Replace extension: `.ts` → `.test.ts`
   - Check existence: `access(testFilePath)`
   - Verify in git: Include in analysis

4. **Classification**
   - Breaking: signature/remove/rename changes
   - Non-breaking: add operations
   - Internal: modify operations
   - Unknown: no patterns matched

### Context-Aware Immutability

1. **Check Base Immutability**
   - Look for `@immutable` marker
   - Verify test passes (if applicable)

2. **Apply Context**
   - User-provided `changeType` → Direct classification
   - Recent code changes → Check related file
   - No context → Require manual reason

3. **Classify Reason**
   - `changeType: 'feature'` → `feature-change`
   - `changeType: 'refactor'` → `refactoring`
   - `changeType: 'bugfix'` → `test-bug`
   - Related file changed → `feature-change`

4. **Validate**
   - Check against allowed reasons
   - Return modification permission

## See Also

- [Testing README](./README.md) - Comprehensive testing documentation
- [Test Immutability Rule](.cursor/rules/immutable-tests.mdc) - Immutability policy
- [Test Config](./utils/test-config.ts) - Configuration options


