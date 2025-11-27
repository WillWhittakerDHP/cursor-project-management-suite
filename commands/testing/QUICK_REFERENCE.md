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

## Common Workflows

### Create New Test
```
/test-template unit path/to/test.test.ts ComponentName
/test-validate path/to/test.test.ts
/test-run vue
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
/test-check-immutable path/to/test.test.ts
/test-check-immutable path/to/test.test.ts "feature-change"
```

## See Also

- `.cursor/commands/testing/README.md` - Comprehensive documentation
- `.cursor/commands/README.md` - Main command architecture

