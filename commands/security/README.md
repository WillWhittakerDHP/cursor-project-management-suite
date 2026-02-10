# Security Commands

Comprehensive security validation commands that extend beyond ESLint-based static code analysis.

## Overview

The security command system provides automated validation for security vulnerabilities that cannot be detected through static code analysis alone:

- **Dependency Vulnerabilities** - npm audit integration
- **Exposed Secrets** - Pattern matching for hardcoded credentials
- **Security Misconfiguration** - Configuration file validation
- **CSRF Protection** - Route analysis for CSRF middleware
- **Authentication Patterns** - Authentication middleware verification
- **IDOR Vulnerabilities** - Authorization logic analysis

## Architecture

### Command Structure

```
.cursor/commands/security/
├── atomic/
│   ├── check-dependencies.ts    # npm audit integration
│   ├── check-secrets.ts          # Secret pattern matching
│   ├── check-config.ts           # Configuration validation
│   ├── check-csrf.ts             # CSRF protection checks
│   ├── check-auth.ts             # Authentication checks
│   └── check-idor.ts             # IDOR vulnerability detection
├── composite/
│   └── security-audit.ts        # Run all checks
├── QUICK_REFERENCE.md
└── README.md
```

### Command Pattern

Each atomic command follows a consistent pattern:

1. **CLI Mode**: Returns formatted markdown string
2. **Programmatic Mode**: Returns structured data
3. **No Context Pollution**: Does NOT include problematic code in output
4. **File Paths Only**: Reports file paths and line numbers, not code snippets

## Implementation Details

### Dependencies Check

- Runs `npm audit --json`
- Parses vulnerability data
- Filters by severity (high/critical = errors, moderate/low = warnings)
- Reports package names and versions (not full vulnerability details)

### Secrets Detection

- Pattern matching for common secret types
- Ignores `process.env` usage (environment variables)
- Checks client-side code for exposed secrets
- Reports file paths and line numbers (not actual secrets)

### Configuration Check

- Checks for default credentials
- Validates CORS configuration
- Verifies security headers (helmet.js)
- Checks for verbose error messages
- Validates HTTPS enforcement
- Checks session configuration

### CSRF Protection Check

- Finds route files
- Identifies state-changing methods (POST, PUT, DELETE, PATCH)
- Checks for CSRF middleware
- Verifies CSRF token validation
- Flags unprotected routes

### Authentication Check

- Identifies protected routes
- Checks for authentication middleware
- Verifies password hashing
- Validates session configuration
- Flags routes missing authentication

### IDOR Check

- Finds controller files
- Identifies endpoints accepting IDs
- Checks for authorization before data access
- Verifies permission checks
- Flags endpoints without authorization

## Workflow Integration

### Planning Step

Security audit is integrated as Step 5 in `plan-with-checks.ts`:

```typescript
// Step 5: Security Validation
const { securityAudit } = await import('../../security/composite/security-audit');
const securityResult = await securityAudit({ path: 'server/src' });
```

### Tier Closeout

Security audit runs automatically as part of `audit:all`:
- Included in code quality audit (runs `npm run audit:all` which includes `audit:security`)
- Results are included in audit fixes commit
- Security audit JSON is read by `auditCodeQuality` and included in audit results

Security checks are non-blocking - they report issues but don't prevent workflow completion.

## Usage

### Manual Execution

```bash
# Run complete security audit
/security-audit

# Check specific path
/security-audit --path server/src

# Strict mode (treat warnings as errors)
/security-audit --strict

# Individual checks
/security-check-dependencies
/security-check-secrets
/security-check-config
/security-check-csrf
/security-check-auth
/security-check-idor
```

### Programmatic Usage

```typescript
import { securityAudit } from '.cursor/commands/security/composite/security-audit';
import { checkDependencies } from '.cursor/commands/security/atomic/check-dependencies';

// Run audit
const auditResult = await securityAudit({ path: 'server/src' });

// Check dependencies programmatically
const depsResult = await checkDependenciesProgrammatic({});
if (depsResult.success && depsResult.result) {
  console.log(`Found ${depsResult.result.summary.errorCount} critical vulnerabilities`);
}
```

## Security Philosophy

### DO:
- Report file paths and line numbers
- Provide actionable error messages
- Include severity levels (error/warning)
- Summarize findings at the top
- Make checks fast and non-intrusive

### DON'T:
- Include actual secrets or sensitive data in output
- Show full code snippets of vulnerabilities
- Run destructive operations
- Modify code automatically (only report)
- Block workflow execution (warnings only)

## Limitations

### Pattern Matching
- Secrets detection uses pattern matching and may have false positives
- IDOR detection analyzes code structure and may miss complex authorization logic
- Route analysis may not catch all middleware patterns

### Static Analysis
- Cannot detect runtime authorization logic
- Cannot verify actual CSRF token validation at runtime
- Cannot test actual authentication flows

### Recommendations
- Review flagged items carefully
- Use security checks as a starting point, not definitive security audit
- Combine with manual code review and penetration testing
- Run security checks regularly, not just at workflow checkpoints

## Related Documentation

- **Security Rules**: `.cursor/rules/PROJECT_CODING_RULES.md` (Rules 23-26)
- **Security Guidelines**: `.cursor/rules/SECURITY_GUIDELINES.md`
- **ESLint Security**: `.cursor/commands/validation/atomic/security-check.ts`
- **Planning Templates**: `.cursor/commands/planning/templates/` (Security Considerations section)

## Maintenance

### Updating Patterns

Secret patterns and route analysis patterns may need updates as:
- Codebase patterns evolve
- New security vulnerabilities are discovered
- Framework patterns change

### Adding New Checks

To add a new security check:

1. Create atomic command in `atomic/` directory
2. Follow existing command pattern
3. Add to `security-audit.ts` composite command
4. Update `QUICK_REFERENCE.md`
5. Update this README

## References

- **OWASP Top 10**: https://owasp.org/www-project-top-ten/
- **npm audit**: https://docs.npmjs.com/cli/v8/commands/npm-audit
- **Express Security**: https://expressjs.com/en/advanced/best-practice-security.html
- **Vue Security**: https://vuejs.org/guide/best-practices/security.html

---

**Last Updated:** 2025-01-XX  
**Status:** Active

