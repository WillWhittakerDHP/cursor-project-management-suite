# Testing Commands

Comprehensive test command structure with atomic/composite patterns, test immutability protection, templates, and workflow integration.

## Architecture

Commands follow the atomic/composite pattern established in the codebase:
- **Atomic commands**: Single-responsibility test operations
- **Composite commands**: High-level test workflows combining atomic commands
- **Templates**: Test file templates for consistent test creation
- **Utilities**: Shared test immutability utilities

## Directory Structure

```
.cursor/commands/testing/
├── atomic/              # Atomic test commands
├── composite/           # Composite test workflows
├── templates/           # Test file templates
├── utils/              # Shared utilities
├── README.md           # This file
└── QUICK_REFERENCE.md  # Quick command lookup
```

## Atomic Commands

### `/test-run [target]`

Execute test suite for vue/server/all without watch mode.

**Parameters:**
- `target`: `vue` | `server` | `all` (default: `vue`)

**Example:**
```
/test-run vue
/test-run server
/test-run all
```

### `/test-watch [target]`

Run tests in watch mode, automatically re-running when files change.

**Parameters:**
- `target`: `vue` | `server` | `all` (default: `vue`)

**Example:**
```
/test-watch vue
```

### `/test-coverage [target]`

Generate test coverage reports.

**Parameters:**
- `target`: `vue` | `server` | `all` (default: `vue`)

**Example:**
```
/test-coverage vue
```

### `/test-validate [file-path]`

Validate test file structure and compliance with best practices.

**Checks:**
- Descriptive header comment (Rule 10 compliance)
- Proper test structure (describe/it blocks)
- Test naming conventions
- Import organization
- Test immutability markers

**Example:**
```
/test-validate client-vue/src/components/MyComponent.test.ts
```

### `/test-check-immutable [file-path] [reason]`

Check if a test file is marked as immutable and protected from modification.

**Parameters:**
- `file-path`: Path to test file
- `reason`: Optional modification reason (`feature-change` | `test-bug` | `refactoring` | `other`)

**Returns:**
- `isImmutable`: Whether test is immutable
- `hasMarker`: Whether immutability marker exists
- `canModify`: Whether modification is allowed with given reason

**Example:**
```
/test-check-immutable client-vue/src/utils/calculator.test.ts
/test-check-immutable client-vue/src/utils/calculator.test.ts "feature-change"
```

### `/test-lint [target]`

Lint test files specifically.

**Parameters:**
- `target`: `vue` | `server` | `all` (default: `vue`)

**Example:**
```
/test-lint vue
```

### `/test-template [type] [file-path] [component-name]`

Generate a test file from a template.

**Parameters:**
- `type`: `unit` | `integration` | `component`
- `file-path`: Path where test file should be created
- `component-name`: Optional component name (auto-detected from file path if not provided)

**Example:**
```
/test-template unit client-vue/src/utils/calculator.test.ts Calculator
/test-template component client-vue/src/components/MyComponent.test.ts
```

## Composite Commands

### `/test-workflow [target] [--coverage]`

Full test workflow: validate → lint → run → (optionally) coverage.

**Parameters:**
- `target`: `vue` | `server` | `all` (default: `vue`)
- `--coverage`: Include coverage report generation

**Example:**
```
/test-workflow vue
/test-workflow vue --coverage
```

### `/test-before-commit [target]`

Pre-commit test suite: run unit tests and linting.

**Parameters:**
- `target`: `vue` | `server` | `all` (default: `vue`)

**Example:**
```
/test-before-commit vue
```

### `/test-on-change [file-paths...]`

Run tests affected by file changes.

**Parameters:**
- `file-paths`: One or more file paths that changed

**Example:**
```
/test-on-change client-vue/src/utils/calculator.ts
/test-on-change client-vue/src/utils/calculator.ts client-vue/src/components/MyComponent.vue
```

### `/test-end-workflow [tier] [id] [target]`

End-of-workflow test suite. Runs appropriate tests based on workflow tier.

**Parameters:**
- `tier`: `task` | `session` | `phase` | `feature`
- `id`: Workflow identifier (task ID, session ID, phase number, or feature name)
- `target`: `vue` | `server` | `all` (default: `vue`)

**Test Scope by Tier:**
- **Task**: Unit tests for changed files
- **Session**: Relevant tests for session scope
- **Phase**: Full test suite
- **Feature**: All tests + coverage

**Example:**
```
/test-end-workflow task 1.3.1 vue
/test-end-workflow session 1.3 vue
/test-end-workflow phase 1 vue
/test-end-workflow feature vue-migration all
```

## Workflow Integration

Test commands are integrated into workflow commands:

### Session End
```typescript
/session-end [X.Y] [--test] [--test-target vue|server|all]
```

### Task End
```typescript
/task-end [X.Y.Z] [--test] [--test-target vue|server|all]
```

### Phase End
```typescript
/phase-end [N] [--test] [--test-target vue|server|all]
```

### Feature End
```typescript
/feature-end [name] [--test]
```

## Test Immutability

### Rules

Tests are immutable once they pass, lint, and function correctly. Tests can only be modified when:

1. **Feature Change**: Test needs update due to feature modification
2. **Test Bug**: Test itself has a bug (not code bug)
3. **Refactoring**: Code refactoring requires test updates

Tests cannot be modified when:
- Code has a bug (fix the code, not the test)
- Test passes (passing tests are immutable)
- No valid reason provided

### Marking Tests as Immutable

Add an immutability marker to your test file:

```typescript
/**
 * MY COMPONENT TESTS
 * 
 * Component tests for MyComponent.
 * 
 * @immutable - Mark as immutable once tests pass and are stable
 */
```

Or:

```typescript
/**
 * MY COMPONENT TESTS
 * 
 * IMMUTABLE: true
 */
```

### Checking Immutability

```typescript
// Check if test is immutable
const result = await testCheckImmutable('path/to/test.test.ts');

// Check if modification is allowed
const result = await testCheckImmutable('path/to/test.test.ts', 'feature-change');
```

## Test Templates

### Unit Test Template

Use for pure functions, utilities, and business logic.

**Template Features:**
- Descriptive header comment
- Test organization with describe blocks
- Arrange-Act-Assert pattern
- Edge case testing
- Immutability marker placement

**Usage:**
```
/test-template unit client-vue/src/utils/calculator.test.ts Calculator
```

### Integration Test Template

Use for context coordination, component integration, and user workflows.

**Template Features:**
- Descriptive header comment
- Test setup and teardown
- Data flow testing
- Context coordination tests
- User workflow tests

**Usage:**
```
/test-template integration client-vue/src/integration/bookingFlow.test.ts
```

### Component Test Template

Use for React/Vue components with user interactions and side effects.

**Template Features:**
- Descriptive header comment
- Rendering tests
- User interaction tests
- Props handling tests
- State management tests

**Usage:**
```
/test-template component client-vue/src/components/MyComponent.test.ts MyComponent
```

## Best Practices

### Test File Structure

1. **Descriptive Header**: Always include a descriptive header comment (Rule 10)
2. **Test Organization**: Group related tests using describe blocks
3. **Clear Test Names**: Use descriptive test names that explain what is being tested
4. **Arrange-Act-Assert**: Follow AAA pattern for test structure
5. **Edge Cases**: Test edge cases and error conditions
6. **Immutability Marker**: Add `@immutable` comment once tests are stable and passing

### When to Run Tests

1. **On Change (Watch Mode)**: Use `start:dev:testing` for continuous feedback
2. **End of Workflow**: Use `--test` flag with workflow commands
3. **Pre-Commit**: Run `/test-before-commit` before committing
4. **CI/CD**: Run full test suite with coverage

### Coverage Expectations

- **Unit Tests**: 90%+ coverage on utilities and pure functions
- **Component Tests**: 70%+ coverage on components with logic
- **Integration Tests**: Critical paths only

## Integration with Existing Commands

### Verify Command

The `/verify` command has been enhanced to use the new test structure:

```
/verify vue --test
/verify all --test
```

### Existing Test Command

The existing `/test` command remains available for backward compatibility. The new structure provides additional capabilities while maintaining compatibility.

## Examples

### Complete Test Workflow

```typescript
// 1. Generate test file from template
await testTemplate('unit', 'client-vue/src/utils/calculator.test.ts', 'Calculator');

// 2. Validate test structure
await testValidate('client-vue/src/utils/calculator.test.ts');

// 3. Run tests
await testRun('vue');

// 4. Mark as immutable once passing
// Add @immutable marker to test file

// 5. Check immutability
await testCheckImmutable('client-vue/src/utils/calculator.test.ts');
```

### Workflow Integration

```typescript
// End session with tests
await sessionEnd({
  sessionId: '1.3',
  description: 'API Clients',
  nextSession: '1.4',
  lastCompletedTask: '1.3.4',
  runTests: true,
  testTarget: 'vue',
});

// End phase with tests
await phaseEnd({
  phase: '1',
  completedSessions: ['1.1', '1.2', '1.3'],
  runTests: true,
  testTarget: 'vue',
});
```

## Related Documentation

- `.cursor/commands/README.md` - Main command architecture
- `.cursor/rules/immutable-tests.mdc` - Test immutability rule
- `.cursor/commands/templates/atomic-command-template.md` - Command template pattern
- `client/src/admin/tests/activePartsStateCalculator.test.ts` - Example test structure

