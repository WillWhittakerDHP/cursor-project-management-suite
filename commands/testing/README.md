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

### `/test-analyze-impact [file-paths...]`

**NEW:** Analyze impact of code changes on tests before running them.

**Features:**
- Predicts which tests will be affected by code changes
- Classifies changes as breaking/non-breaking
- Provides confidence levels
- Suggests actions for test updates
- Does NOT modify tests (analysis only)

**Parameters:**
- `file-paths`: One or more file paths that changed
- `--include-uncommitted`: Include uncommitted files from git (default: `true`)
- `--detailed-analysis`: Perform detailed code analysis (default: `true`)

**Example:**
```
/test-analyze-impact client-vue/src/utils/calculator.ts
/test-analyze-impact client-vue/src/utils/calculator.ts client-vue/src/components/MyComponent.vue
```

**Output:**
```
📊 Test Impact Analysis

Detected 1 changed file(s) affecting 1 test file(s).
Change Type: breaking (confidence: high)

1 test file(s) likely to have failures:
  - client-vue/src/utils/calculator.test.ts
    Reason: Function signature changed: export function calculate(a: number, b: number)
    Action: Update test calls to match new function signature

⚠️  Breaking changes detected. Tests may need updates.
This is a FEATURE CHANGE - test modifications are allowed.
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

**ENHANCED:** Run tests affected by file changes with automatic impact analysis.

**New Features:**
- Automatic impact analysis before running tests
- Breaking change detection with confidence levels
- Immutability context awareness (auto-classifies feature changes)
- Detailed predictions of test failures
- Pre-run validation with user prompts for breaking changes

**Parameters:**
- `file-paths`: One or more file paths that changed
- `--skip-impact-analysis`: Skip impact analysis (default: `false`)
- `--test-target`: Test target - `vue` | `server` | `all` (default: `vue`)

**Example:**
```
/test-on-change client-vue/src/utils/calculator.ts
/test-on-change client-vue/src/utils/calculator.ts client-vue/src/components/MyComponent.vue
/test-on-change client-vue/src/utils/calculator.ts --test-target vue
```

**Enhanced Output:**
```
📊 Change Impact Analysis:
  - Change Type: breaking (high confidence)
  - Affected Tests: 1
  - Predicted Failures: 1

⚠️  Breaking changes detected. Tests may need updates.

Running tests...
```

**How It Works:**
1. **Analyzes code changes** - Detects what changed (signature, rename, add, remove)
2. **Predicts test impact** - Identifies which tests will fail and why
3. **Checks immutability** - Auto-classifies as feature change if related code changed
4. **Warns before running** - Gives you a heads-up about expected failures
5. **Runs tests** - Executes tests with full context about what to expect

**Philosophy:**
This enhancement maintains test integrity while improving UX. It does NOT auto-update tests to make them pass. Instead, it:
- ✅ Warns you before tests fail (proactive)
- ✅ Auto-classifies valid modification reasons (reduces friction)
- ✅ Provides actionable guidance (helps you fix tests correctly)
- ❌ Does NOT modify tests automatically (preserves test integrity)
- ❌ Does NOT hide problems (makes failures transparent)

### `/test-dev [filePath] [testTarget] [options]`

Comprehensive test development workflow combining validation, immutability checks, watch mode, and error resolution.

**Features:**
- Test file validation (if file path provided)
- Immutability checks (if file path provided)
- Watch mode execution (default for test development)
- Error analysis and prompt-driven resolution
- Automatic test file fixes (with permission)

**Parameters:**
- `filePath`: Optional path to test file to validate/check
- `testTarget`: `vue` | `server` | `all` (default: `vue`)
- `skipValidation`: Skip validation steps (default: `false`)
- `skipImmutability`: Skip immutability check (default: `false`)

**Example:**
```
/test-dev client-vue/src/components/MyComponent.test.ts vue
/test-dev vue
/test-dev vue --skip-validation
```

**Error Resolution:**
When tests fail, the workflow automatically:
1. Analyzes errors (test code vs app code)
2. Prompts for resolution options:
   - Fix test file (if test code error)
   - Fix app code (if app code error)
   - Skip and continue watching
   - Stop watch mode

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

## Watch Mode Integration

### Task Checkpoints

Task checkpoints (`/task-checkpoint`) now include watch mode testing by default:

**Features:**
- Smart detection: Automatically enables watch mode based on:
  - File modification timestamps (test/app files modified in last 5 minutes)
  - Git status (uncommitted test/app files)
  - Session context (test-writing indicators)
- Mandatory fallback: If smart detection is unclear, watch mode is enabled by default
- Error analysis: Automatically analyzes test failures
- Prompt-driven resolution: Prompts user for error resolution options

**Usage:**
```
/task-checkpoint 1.3.1 "Added new component" vue
/task-checkpoint 1.3.2 vue
```

**Watch Mode Behavior:**
- Starts in foreground (shows initial test run output)
- Continues in background if tests pass
- Stays in foreground on failure for error analysis and resolution
- Automatically restarts after fixes are applied (if configured)

**Error Resolution Flow:**
1. Tests fail → Automatic error analysis
2. Error classification (test code vs app code)
3. User prompt with resolution options
4. Apply fixes based on user choice
5. Re-run tests to verify fixes

### Configuration

Watch mode can be configured via environment variables:

- `CURSOR_TESTS_WATCH_ENABLED` - Enable watch mode (default: `true`, disabled in CI)
- `CURSOR_TESTS_WATCH_SMART_DETECTION` - Enable smart detection (default: `true`)
- `CURSOR_TESTS_WATCH_DETECTION_WINDOW` - Detection window in minutes (default: `5`)
- `CURSOR_TESTS_WATCH_FOREGROUND_ON_FAILURE` - Stay in foreground on failure (default: `true`)
- `CURSOR_TESTS_WATCH_AUTO_RESTART` - Restart watch after fix (default: `true`)
- `CURSOR_TESTS_PROMPT_RESOLUTION` - Enable prompt resolution (default: `true`, disabled in CI)

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

### Task Checkpoint (Enhanced)
```typescript
/task-checkpoint [X.Y.Z] [notes] [testTarget]
```

Task checkpoints now run watch mode tests by default (with smart detection).

## Change Detection and Impact Analysis

### Overview

**NEW:** The testing system now includes intelligent change detection that analyzes code changes and predicts test impact BEFORE running tests. This provides proactive warnings without compromising test integrity.

### How It Works

1. **Detects Changes**: Monitors git status and file modifications
2. **Analyzes Impact**: Examines code diffs for breaking changes
3. **Predicts Failures**: Identifies which tests will fail and why
4. **Auto-Classifies**: Determines if changes are feature/bugfix/refactor
5. **Provides Context**: Gives actionable guidance for test updates

### Change Classification

**Breaking Changes** (High Confidence):
- Function signature changes (parameters added/removed/changed)
- Export removals (deleted functions, classes, types)
- Symbol renames (function, class, or variable renamed)

**Non-Breaking Changes** (High Confidence):
- New exports added
- Internal implementation changes (no signature changes)

**Internal Changes** (Medium Confidence):
- Implementation details modified
- No public API changes

**Unknown** (Low Confidence):
- Cannot determine impact
- Proceed with caution

### Context-Aware Immutability

**ENHANCEMENT:** Immutability checks are now context-aware and can auto-classify modification reasons:

**Automatic Classification:**
- **Feature Change**: Related code file changed recently
- **Refactoring**: User explicitly states refactor intent
- **Test Bug**: User explicitly states bugfix intent

**Example Flow:**
```
1. You modify calculator.ts (function signature changed)
2. You run /test-on-change calculator.ts
3. System detects:
   - calculator.test.ts is affected
   - calculator.test.ts is immutable
   - calculator.ts changed recently (related code)
4. System auto-classifies as "feature-change"
5. Test modification is ALLOWED (immutability bypassed)
6. Tests run with warning about expected failures
```

### Benefits

✅ **Proactive Warnings**: Know what to expect before tests fail
✅ **Reduced Friction**: Auto-classification reduces manual steps
✅ **Better Guidance**: Specific suggestions for fixing tests
✅ **Maintained Integrity**: Tests still validate code (no auto-fixing)
✅ **Transparent**: All changes and predictions are visible

### When to Use

**Use Impact Analysis When:**
- Making breaking changes to code
- Refactoring with signature changes
- Unsure if changes will break tests
- Want guidance on test updates

**Skip Impact Analysis When:**
- Only adding new features (no changes to existing code)
- Changes are purely internal (no API changes)
- Working on test-first development (tests don't exist yet)

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

### Context-Aware Checking (NEW)

The system now automatically detects valid modification scenarios:

**Auto-Classification:**
```typescript
// When you change calculator.ts and run tests:
// System automatically classifies as "feature-change"
// No manual reason required!

const result = await testCheckImmutableWithContext('calculator.test.ts', {
  recentCodeChanges: ['calculator.ts'],
  changeType: 'feature',
});
// Result: canModify = true, reason = "feature-change"
```

**Manual Classification (Still Supported):**
```typescript
// Explicit reason when context unclear
await testCheckImmutable('calculator.test.ts', 'feature-change');
```

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
2. **With Impact Analysis** (NEW): Use `/test-on-change` when making code changes
3. **End of Workflow**: Use `--test` flag with workflow commands
4. **Pre-Commit**: Run `/test-before-commit` before committing
5. **CI/CD**: Run full test suite with coverage

### Using Change Detection (NEW)

**Before Making Breaking Changes:**
```bash
# 1. Analyze impact first
/test-analyze-impact src/utils/calculator.ts

# 2. Review predictions and prepare for test updates

# 3. Make your code changes

# 4. Run tests with impact analysis
/test-on-change src/utils/calculator.ts

# 5. Fix tests based on predictions
# (System has already auto-classified as feature change)
```

**During Refactoring:**
```bash
# Refactoring with context
/test-on-change src/utils/calculator.ts --context "refactor"

# System auto-classifies immutable tests as "refactoring"
# Test modifications allowed for affected tests
```

**Quick Iteration:**
```bash
# Skip impact analysis for rapid iteration
/test-on-change src/utils/calculator.ts --skip-impact-analysis

# Use when you know tests will pass or when working on new features
```

### Coverage Expectations

- **Unit Tests**: 90%+ coverage on utilities and pure functions
- **Component Tests**: 70%+ coverage on components with logic
- **Integration Tests**: Critical paths only

### Working with Immutable Tests (NEW)

**Scenario 1: Feature Change (Auto-Detected)**
```typescript
// You modified: calculator.ts (added new parameter)
// Affected test: calculator.test.ts (marked @immutable)
// System detects: calculator.ts changed recently
// Result: AUTO-CLASSIFIED as "feature-change"
// Action: Test modification ALLOWED

/test-on-change calculator.ts
// ✅ Immutability bypassed automatically
// ⚠️ Tests will fail (expected)
// 📝 Fix tests to match new signature
```

**Scenario 2: Test Bug (Manual)**
```typescript
// Test has a bug (not code)
// Must provide explicit reason

/test-check-immutable calculator.test.ts "test-bug"
// ✅ Test modification ALLOWED
// 📝 Fix the test bug
```

**Scenario 3: Code Bug (Fix Code, Not Test)**
```typescript
// Test fails because code has a bug
// System detects: Assertion failure (code error)
// Result: CANNOT modify immutable test
// Action: Fix the CODE, not the test

// Error analyzer will guide you:
// "This error is in the app code (assertion error).
//  Fix the implementation to match test expectations."
```

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

### Test Development Workflow

```typescript
// Start test development workflow with watch mode
await testDevWorkflow({
  filePath: 'client-vue/src/components/MyComponent.test.ts',
  testTarget: 'vue',
  skipValidation: false,
  skipImmutability: false,
});

// Workflow will:
// 1. Validate test file structure
// 2. Check immutability
// 3. Run initial tests
// 4. Start watch mode
// 5. Monitor for failures and prompt for resolution
```

### Watch Mode in Task Checkpoints

```typescript
// Task checkpoint with watch mode (automatic)
await taskCheckpoint('1.3.1', 'Added new component', 'vue-migration', 'vue');

// Watch mode is automatically enabled based on:
// - File modifications (test/app files changed recently)
// - Git status (uncommitted test/app files)
// - Session context (test-writing indicators)

// If tests fail:
// 1. Error analysis runs automatically
// 2. User is prompted with resolution options:
//    - Fix test file (if test code error)
//    - Fix app code (if app code error)
//    - Skip and continue watching
//    - Stop watch mode
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

// Task checkpoint with watch mode
await taskCheckpoint('1.3.1', 'Component implementation', 'vue-migration', 'vue');
```

## Related Documentation

- `.cursor/commands/README.md` - Main command architecture
- `.cursor/rules/immutable-tests.mdc` - Test immutability rule
- `.cursor/commands/templates/atomic-command-template.md` - Command template pattern
- `client/src/admin/tests/activePartsStateCalculator.test.ts` - Example test structure

