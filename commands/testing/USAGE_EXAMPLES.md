# Testing System Usage Examples

## Quick Start

### Example 1: Analyzing Impact Before Changes

```bash
# You're about to modify a calculator function
# Check impact first

/test-analyze-impact client-vue/src/utils/calculator.ts
```

**Expected Output:**
```
📊 Test Impact Analysis

Detected 1 changed file(s) affecting 1 test file(s).
Change Type: breaking (confidence: high)

1 test file(s) likely to have failures:
  - client-vue/src/utils/calculator.test.ts
    Reason: Function signature changed
    Action: Update test calls to match new function signature

⚠️  Breaking changes detected. Tests may need updates.
This is a FEATURE CHANGE - test modifications are allowed.
```

### Example 2: Running Tests After Code Changes

```bash
# You modified calculator.ts
# Run tests with automatic impact analysis

/test-on-change client-vue/src/utils/calculator.ts
```

**Expected Output:**
```
📊 Change Impact Analysis:
  - Change Type: breaking (high confidence)
  - Affected Tests: 1
  - Predicted Failures: 1

⚠️  Breaking changes detected. Tests may need updates.

Running tests...
[Test output follows]
```

### Example 3: Working with Multiple Files

```bash
# Modified multiple related files
/test-on-change client-vue/src/utils/calculator.ts client-vue/src/utils/formatter.ts

# Or let it auto-detect
/test-on-change
```

### Example 4: Quick Iteration (Skip Analysis)

```bash
# When you know tests will pass
/test-on-change client-vue/src/utils/calculator.ts --skip-impact-analysis
```

## Real-World Scenarios

### Scenario A: Adding a Required Parameter

**Before:**
```typescript
// calculator.ts
export function add(a: number, b: number): number {
  return a + b;
}
```

**After:**
```typescript
// calculator.ts
export function add(a: number, b: number, roundResult: boolean = false): number {
  const result = a + b;
  return roundResult ? Math.round(result) : result;
}
```

**Workflow:**

```bash
# 1. Analyze impact
$ /test-analyze-impact client-vue/src/utils/calculator.ts

Output:
📊 Test Impact Analysis
Detected 1 changed file(s) affecting 1 test file(s).
Change Type: breaking (confidence: high)

Predictions:
  - calculator.test.ts: Function signature changed
    Action: Update test calls to match new signature

# 2. Make your code changes
# (edit calculator.ts as shown above)

# 3. Run tests with auto-detection
$ /test-on-change client-vue/src/utils/calculator.ts

Output:
📊 Change Impact Analysis:
  - Change Type: breaking (high confidence)
  - Affected Tests: 1

✅ Test Modification Status:
  - calculator.test.ts: CAN MODIFY (feature-change detected automatically)

Running tests...
FAIL calculator.test.ts
  × should add two numbers
    Expected: 5, Received: undefined

# 4. Fix tests based on predictions
```

**Fix the test:**
```typescript
// calculator.test.ts
describe('add', () => {
  it('should add two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
  
  it('should round result when requested', () => {
    expect(add(2.4, 3.7, true)).toBe(6);
  });
});
```

### Scenario B: Refactoring Internal Implementation

**Before:**
```typescript
// formatter.ts
export function formatName(first: string, last: string): string {
  return first + ' ' + last;
}
```

**After:**
```typescript
// formatter.ts
export function formatName(first: string, last: string): string {
  // Refactored to use template literal
  return `${first} ${last}`;
}
```

**Workflow:**

```bash
# Analyze impact
$ /test-analyze-impact client-vue/src/utils/formatter.ts

Output:
📊 Test Impact Analysis
Change Type: internal (confidence: medium)
No breaking changes detected. Tests should pass.

# Run tests
$ /test-on-change client-vue/src/utils/formatter.ts

Output:
📊 Change Impact Analysis:
  - Change Type: internal (medium confidence)
  - Affected Tests: 1
  - Predicted Failures: 0

✅ No breaking changes detected.

Running tests...
PASS formatter.test.ts ✓
```

### Scenario C: Removing a Function

**Before:**
```typescript
// utils.ts
export function oldHelper(): void {
  // ...
}

export function newHelper(): void {
  // ...
}
```

**After:**
```typescript
// utils.ts
export function newHelper(): void {
  // ...
}
```

**Workflow:**

```bash
$ /test-analyze-impact client-vue/src/utils/utils.ts

Output:
📊 Test Impact Analysis
Detected 1 changed file(s) affecting 1 test file(s).
Change Type: breaking (confidence: high)

Predictions:
  - utils.test.ts: Export removed - oldHelper
    Action: Remove or update tests for removed exports

⚠️  Breaking changes detected.

$ /test-on-change client-vue/src/utils/utils.ts

# System detects immutable test but auto-classifies as feature-change
# Fix: Remove tests for oldHelper
```

### Scenario D: Working with Immutable Tests

**Test marked as immutable:**
```typescript
/**
 * CALCULATOR TESTS
 * 
 * @immutable - Tests are stable and passing
 */
```

**Check status:**
```bash
$ /test-check-immutable client-vue/src/utils/calculator.test.ts

Output:
🔒 Test is immutable
Cannot modify without valid reason
```

**Make related code change:**
```bash
# Edit calculator.ts (add parameter)

$ /test-on-change client-vue/src/utils/calculator.ts

Output:
✅ Test Modification Status:
  - calculator.test.ts: CAN MODIFY (feature-change detected automatically)

# Immutability bypassed because related code changed!
```

## Integration with Workflows

### Task Checkpoint with Impact Analysis

```bash
# Make code changes
# (edit calculator.ts)

# Run task checkpoint
$ /task-checkpoint 1.3.1 "Added calculator rounding feature"

# Automatically:
# 1. Detects modified files
# 2. Analyzes impact
# 3. Runs tests in watch mode
# 4. Provides error analysis if tests fail
```

### Session End with Tests

```bash
$ /session-end 1.3 "Core utilities" 1.4 --test

# Automatically includes:
# - Impact analysis for all session files
# - Auto-classification for immutable tests
# - Comprehensive test execution
```

## Command Cheat Sheet

```bash
# Analyze impact only (no test execution)
/test-analyze-impact [files...]

# Run tests with impact analysis
/test-on-change [files...]

# Skip impact analysis for speed
/test-on-change [files...] --skip-impact-analysis

# Check test immutability
/test-check-immutable [test-file]

# Check with explicit reason
/test-check-immutable [test-file] "feature-change"
```

## Tips and Best Practices

### When to Use Impact Analysis

✅ **Use when:**
- Making breaking changes
- Unsure if changes will break tests
- Want guidance for fixing tests
- Working with immutable tests

❌ **Skip when:**
- Adding new features (no existing tests)
- Changes are purely internal
- Rapid iteration on new code
- Tests don't exist yet

### Understanding Confidence Levels

**High Confidence** 🔴
- Trust the prediction
- Breaking changes detected
- Prepare for test updates

**Medium Confidence** 🟡
- Probably accurate
- Review changes carefully
- Tests may or may not fail

**Low Confidence** ⚪
- System is uncertain
- Manual review recommended
- Don't rely on predictions

### Working with Predictions

```bash
# Good workflow
1. /test-analyze-impact [files]    # Check predictions
2. Make code changes                # Implement feature
3. /test-on-change [files]         # Run tests
4. Fix tests based on predictions  # Use guidance

# Rapid iteration
1. Make code changes
2. /test-on-change [files]         # Combined analysis + run
3. Fix based on output
```

## Troubleshooting

### "No changes detected"

**Problem:** System doesn't see your changes.

**Solution:**
```bash
# Explicitly provide files
/test-on-change client-vue/src/utils/calculator.ts

# Check git status
git status

# Ensure files are in git working tree
```

### "Cannot modify immutable test"

**Problem:** Test is marked immutable and no context detected.

**Solution:**
```bash
# Option 1: Make related code change (auto-detects)
# Edit the code file that the test covers

# Option 2: Provide explicit reason
/test-check-immutable calculator.test.ts "feature-change"

# Option 3: Update context
/test-on-change calculator.ts  # Includes context
```

### "Low confidence prediction"

**Problem:** System cannot determine change type.

**Solution:**
- Manually review git diff
- Proceed with caution
- Trust test failures over predictions
- Consider detailed code review

## See Also

- [CHANGE_DETECTION_GUIDE.md](./CHANGE_DETECTION_GUIDE.md) - Comprehensive guide
- [README.md](./README.md) - Full testing documentation
- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - Command reference


