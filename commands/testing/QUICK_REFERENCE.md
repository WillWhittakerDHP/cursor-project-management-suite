# Testing Commands Quick Reference

Quick lookup table for all testing commands.

## Atomic Commands

| Command | Purpose | Parameters | Example |
|---------|---------|------------|---------|
| `/test-run` | Execute test suite | `[target]` | `/test-run vue` |
| `/test-watch` | Run tests in watch mode | `[target]` | `/test-watch vue` |
| `/test-coverage` | Generate coverage reports | `[target]` | `/test-coverage vue` |
| `/test-validate` | Validate test file structure | `[file-path]` | `/test-validate path/to/test.test.ts` |
| `/test-check-immutable` | Check test immutability | `[file-path] [reason]` | `/test-check-immutable path/to/test.test.ts` |
| `/test-lint` | Lint test files | `[target]` | `/test-lint vue` |
| `/test-template` | Generate test from template | `[type] [file-path] [component-name]` | `/test-template unit path/to/test.test.ts` |
| `/test-analyze-impact` 🆕 | Analyze code change impact | `[file-paths...]` | `/test-analyze-impact file1.ts file2.ts` |

**Target Options:** `vue` | `server` | `all` (default: `vue`)

**Template Types:** `unit` | `integration` | `component`

## Composite Commands

| Command | Purpose | Parameters | Example |
|---------|---------|------------|---------|
| `/test-workflow` | Full test workflow | `[target] [--coverage]` | `/test-workflow vue --coverage` |
| `/test-before-commit` | Pre-commit test suite | `[target]` | `/test-before-commit vue` |
| `/test-on-change` | Run tests for changed files | `[file-paths...]` | `/test-on-change file1.ts file2.ts` |
| `/test-end-workflow` | End-of-workflow tests | `[tier] [id] [target]` | `/test-end-workflow session 1.3 vue` |

**Workflow Tiers:** `task` | `session` | `phase` | `feature`

## Workflow Integration

| Workflow Command | Test Flag | Example |
|------------------|-----------|---------|
| `/session-end` | `--test` | `/session-end 1.3 "Description" 1.4 --test` |
| `/task-end` | `--test` | `/task-end 1.3.1 --test` |
| `/phase-end` | `--test` | `/phase-end 1 --test` |
| `/feature-end` | `--test` | `/feature-end vue-migration --test` |

## Test Immutability

**Valid Modification Reasons:**
- `feature-change` - Feature changed, test needs update
- `test-bug` - Test itself has a bug
- `refactoring` - Code refactoring requires test updates

**Immutability Marker:**
```typescript
/**
 * @immutable - Mark as immutable once tests pass and are stable
 */
```

## Change Detection & Impact Analysis 🆕

**New Feature:** Proactive test impact analysis before running tests.

### Impact Analysis Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/test-analyze-impact` | Analyze code changes | Before breaking changes |
| `/test-on-change` (enhanced) | Run tests with impact analysis | After code changes |

### Change Types

- **Breaking** 🔴 - Signature changes, removals, renames (tests will fail)
- **Non-Breaking** 🟢 - New additions, internal changes (tests should pass)
- **Internal** 🟡 - Implementation changes (may affect tests)
- **Unknown** ⚪ - Cannot determine (proceed with caution)

### Auto-Classification 🎯

The system now auto-detects valid test modification reasons:

- **Feature Change**: Related code file changed recently ✅
- **Refactoring**: User explicitly states refactor intent ✅
- **Test Bug**: User explicitly states bug fix intent ✅

No manual reason needed when context is clear!

## Common Workflows

### Create New Test
```
/test-template unit path/to/test.test.ts ComponentName
/test-validate path/to/test.test.ts
/test-run vue
```

### Making Breaking Changes 🆕
```
# 1. Analyze impact first
/test-analyze-impact src/utils/calculator.ts

# 2. Make your code changes
# (edit calculator.ts)

# 3. Run tests with auto-detection
/test-on-change src/utils/calculator.ts
# ✅ System auto-classifies as "feature-change"
# ⚠️ Predicts which tests will fail
# 📝 Provides guidance for fixes
```

### Run Tests Before Commit
```
/test-before-commit vue
```

### End Session with Tests
```
/session-end 1.3 "Description" 1.4 --test --test-target vue
```

### Check Test Immutability
```
# Basic check
/test-check-immutable path/to/test.test.ts

# With explicit reason (manual)
/test-check-immutable path/to/test.test.ts "feature-change"

# With context (auto-classification) 🆕
# Happens automatically in /test-on-change
```

## See Also

- `.cursor/commands/testing/README.md` - Comprehensive documentation
- `.cursor/commands/README.md` - Main command architecture

