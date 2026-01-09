# Validation/Verification Quick Reference

## Commands

| Command | Function | Parameters | Description |
|---------|----------|------------|-------------|
| `/validate-workflow` | `validateWorkflow` | `tier, identifier?, featureName?` | Validate workflow state |
| `/validate-completeness` | `verifyCompleteness` | `tier, identifier?, featureName?` | Verify required docs/entries exist |
| `/validate-complete` | `validateComplete` | `tier, identifier?, featureName?` | Complete validation workflow |
| `/validate-security` | `validateSecurity` | `path?, strict?` | Validate codebase for security vulnerabilities |

## Parameter Types

- **tier**: `'feature' | 'phase' | 'session' | 'task'`
- **identifier**: `string | undefined` (required for phase/session/task)
- **featureName**: `string` (default: 'vue-migration')
- **path**: `string | undefined` (optional path to check, defaults to project root)
- **strict**: `boolean | undefined` (treat warnings as errors, default: false)

## Return Types

### CLI API (Formatted String)
```typescript
Promise<string> // Formatted markdown output
```

### Programmatic API (Structured Data)
```typescript
// validateWorkflowProgrammatic
Promise<{
  success: boolean;
  result?: {
    valid: boolean;
    errors: string[];
    warnings: string[];
    info: string[];
  };
  error?: string;
}>

// validateSecurityProgrammatic
Promise<{
  success: boolean;
  result?: {
    valid: boolean;
    errors: Array<{
      file: string;
      line: number;
      column: number;
      rule: string;
      message: string;
    }>;
    warnings: Array<{
      file: string;
      line: number;
      column: number;
      rule: string;
      message: string;
    }>;
    summary: {
      totalFiles: number;
      errorCount: number;
      warningCount: number;
    };
  };
  error?: string;
}>
```

## Examples

### Validate Workflow
```typescript
await validateWorkflow({
  tier: 'session',
  identifier: '2.1',
  featureName: 'vue-migration'
});
```

### Verify Completeness
```typescript
await verifyCompleteness({
  tier: 'session',
  identifier: '2.1',
  featureName: 'vue-migration'
});
```

### Complete Validation
```typescript
await validateComplete(
  'session',
  '2.1',
  'vue-migration'
);
```

### Validate Security
```typescript
// Check entire codebase
await validateSecurity({});

// Check specific path
await validateSecurity({ path: 'server/src' });

// Strict mode (treat warnings as errors)
await validateSecurity({ strict: true });
```

## Validation Checks

### Workflow State
- ✅ Todo exists and valid
- ✅ Documents exist
- ✅ Required sections present
- ✅ Todo consistency

### Completeness
- ✅ All documents exist
- ✅ All sections present
- ✅ Todos exist

### Security
- ✅ ESLint security plugin installed
- ✅ Security rules configured
- ✅ No SQL injection vulnerabilities
- ✅ No XSS vulnerabilities
- ✅ No unsafe eval or require patterns
- ✅ No hardcoded secrets

**Note:** For comprehensive security validation beyond ESLint, use the security commands:
- `/security-audit` - Complete security audit (dependencies, secrets, config, CSRF, auth, IDOR)
- `/security-check-dependencies` - Check for vulnerable npm packages
- `/security-check-secrets` - Detect exposed secrets and hardcoded credentials
- `/security-check-config` - Validate security configuration
- `/security-check-csrf` - Check CSRF protection on routes
- `/security-check-auth` - Validate authentication patterns
- `/security-check-idor` - Detect IDOR vulnerabilities

See `.cursor/commands/security/QUICK_REFERENCE.md` for details.

## Common Patterns

### Validate Before Transition
```typescript
// Before ending session
const validation = await validateComplete('session', '2.1', 'vue-migration');
if (validation.includes('❌')) {
  // Fix errors before proceeding
}
```

### Verify Completeness Before Start
```typescript
// Before starting new session
const completeness = await verifyCompleteness('session', '2.2', 'vue-migration');
if (completeness.includes('❌')) {
  // Create missing documents/todos
}
```

