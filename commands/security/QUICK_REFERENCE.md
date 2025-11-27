# Security Commands Quick Reference

## Commands

| Command | Function | Parameters | Description |
|---------|----------|------------|-------------|
| `/security-check-dependencies` | `checkDependencies` | `path?, strict?` | Check for vulnerable dependencies using npm audit |
| `/security-check-secrets` | `checkSecrets` | `path?, strict?` | Detect exposed secrets and hardcoded credentials |
| `/security-check-config` | `checkConfig` | `path?` | Validate security configuration (CORS, headers, defaults) |
| `/security-check-csrf` | `checkCSRF` | `path?` | Check CSRF protection on state-changing routes |
| `/security-check-auth` | `checkAuth` | `path?` | Validate authentication patterns and middleware |
| `/security-check-idor` | `checkIDOR` | `path?` | Detect IDOR vulnerabilities in controllers |
| `/security-audit` | `securityAudit` | `path?, strict?` | Run all security checks and provide comprehensive report |

## Parameter Types

- **path**: `string | undefined` (optional path to check, defaults to project root or server/src)
- **strict**: `boolean | undefined` (treat warnings as errors, default: false)

## Return Types

### CLI API (Formatted String)
```typescript
Promise<string> // Formatted markdown output
```

### Programmatic API (Structured Data)
```typescript
// Each command provides programmatic API
Promise<{
  success: boolean;
  result?: {
    valid: boolean;
    errors: Array<{...}>;
    warnings: Array<{...}>;
    summary: {...};
  };
  error?: string;
}>
```

## Examples

### Check Dependencies
```typescript
await checkDependencies({});
await checkDependencies({ path: 'server' });
await checkDependencies({ strict: true });
```

### Check Secrets
```typescript
await checkSecrets({});
await checkSecrets({ path: 'server/src' });
await checkSecrets({ strict: true });
```

### Check Configuration
```typescript
await checkConfig({});
await checkConfig({ path: 'server' });
```

### Check CSRF Protection
```typescript
await checkCSRF({});
await checkCSRF({ path: 'server/src/routes' });
```

### Check Authentication
```typescript
await checkAuth({});
await checkAuth({ path: 'server/src' });
```

### Check IDOR Vulnerabilities
```typescript
await checkIDOR({});
await checkIDOR({ path: 'server/src/api' });
```

### Complete Security Audit
```typescript
// Run all checks
await securityAudit({});

// Check specific path
await securityAudit({ path: 'server/src' });

// Strict mode (treat warnings as errors)
await securityAudit({ strict: true });
```

## Security Checks

### Dependencies
- ✅ npm audit integration
- ✅ High/critical severity flagged as errors
- ✅ Moderate/low severity flagged as warnings
- ✅ Package names and versions reported (not full vulnerability details)

### Secrets
- ✅ Pattern matching for API keys, passwords, tokens
- ✅ Hardcoded credential detection
- ✅ Console.log with secrets detection
- ✅ Client-side secret exposure detection
- ✅ File paths and line numbers (not actual secrets)

### Configuration
- ✅ Default credentials detection
- ✅ CORS misconfiguration checks
- ✅ Security headers (helmet.js) verification
- ✅ Verbose error message detection
- ✅ HTTPS enforcement checks
- ✅ Session configuration validation

### CSRF Protection
- ✅ State-changing route detection (POST, PUT, DELETE, PATCH)
- ✅ CSRF middleware detection
- ✅ CSRF token validation checks
- ✅ Library detection (csurf, etc.)

### Authentication
- ✅ Protected route identification
- ✅ Authentication middleware detection
- ✅ Password hashing verification
- ✅ Session configuration checks
- ✅ JWT token validation detection

### IDOR Vulnerabilities
- ✅ Direct object reference detection
- ✅ Authorization check verification
- ✅ Permission validation detection
- ✅ User ownership validation checks

## Common Patterns

### Run Security Audit Before Commit
```typescript
// Before committing code
const audit = await securityAudit({});
if (audit.includes('❌')) {
  // Review and fix issues before committing
}
```

### Check Specific Path
```typescript
// Check only server code
await securityAudit({ path: 'server/src' });

// Check only client code
await checkSecrets({ path: 'client/src' });
```

### Strict Mode
```typescript
// Treat all warnings as errors
await securityAudit({ strict: true });
```

## Integration Points

### Planning Workflow
Security audit is automatically run as Step 5 in `/planning-plan-with-checks`.

### Tier Closeout
Security audit is automatically run (non-blocking) in:
- `/session-end` - Before git commit
- `/phase-end` - Before git commit

### Manual Execution
Run security checks manually at any time:
```bash
/security-audit
/security-check-dependencies
/security-check-secrets
```

## Notes

- **Non-blocking**: Security checks in workflow are non-blocking (warnings only)
- **No Context Pollution**: Commands do NOT include problematic code in output
- **False Positives**: Some checks may have false positives - review flagged items carefully
- **Pattern Matching**: Secrets and IDOR checks use pattern matching and may need tuning

## Related Commands

- `/validate-security` - ESLint-based security validation (static code analysis)
- `/validate-workflow` - Workflow state validation
- `/validate-completeness` - Completeness verification

