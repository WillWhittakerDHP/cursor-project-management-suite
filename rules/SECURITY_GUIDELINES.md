# Security Guidelines Reference

**Purpose:** Reference document for security best practices and common vulnerabilities

**Status:** Reference document (not loaded by Cursor automatically)

---

## Overview

This document provides quick reference for security best practices in the Differential Scheduler application. For detailed coding rules, see `PROJECT_CODING_RULES.md` Rules 23-26.

---

## Common Security Vulnerabilities

### SQL Injection

**Risk:** User input concatenated into SQL queries can execute malicious SQL code.

**Prevention:**
- Always use Sequelize ORM methods (findOne, findAll, etc.)
- Use parameterized queries for raw SQL
- Never concatenate user input into SQL strings

**Example:**
```typescript
// ✅ Safe
const user = await User.findOne({ where: { id: userId } });

// ❌ Vulnerable
const query = `SELECT * FROM users WHERE id = ${userId}`;
```

---

### Cross-Site Scripting (XSS)

**Risk:** Malicious scripts injected into web pages through user input.

**Prevention:**
- React: Use default JSX rendering (automatic escaping)
- Vue: Use v-text or default interpolation (not v-html)
- Sanitize HTML if rendering is required

**Example:**
```typescript
// ✅ Safe (React)
<div>{userInput}</div>

// ✅ Safe (Vue)
<div v-text="userInput"></div>

// ❌ Vulnerable (React)
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// ❌ Vulnerable (Vue)
<div v-html="userInput"></div>
```

---

### Input Validation

**Risk:** Unvalidated input can cause errors, data corruption, or security issues.

**Prevention:**
- Validate all inputs on the server side
- Use Joi or Zod schemas for validation
- Type checking alone is not sufficient

**Example:**
```typescript
// ✅ Safe
const schema = Joi.object({
  userId: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(100).required()
});

const { error, value } = schema.validate(req.body);
if (error) {
  return res.status(400).json({ error: error.message });
}
```

---

### Production Deployment

**HTTPS:** Enforce HTTPS in production (e.g. at reverse proxy or load balancer). Do not send sensitive cookies or credentials over plain HTTP.

**Session cookies:** When using session middleware, set `secure: true` (HTTPS only) and `httpOnly: true` (not accessible to JavaScript) to mitigate XSS and sniffing.

**Error responses:** In production, do not expose stack traces or internal error messages to clients; use generic messages and log details server-side only.

**Passwords:** When storing user passwords, use a dedicated hashing library (e.g. bcrypt, argon2). Never store plain-text passwords.

---

### Secure Configuration

**Risk:** Hardcoded secrets can be exposed in version control.

**Prevention:**
- Use environment variables for all secrets
- Never commit credentials to git
- Use secure secret management in production

**Example:**
```typescript
// ✅ Safe
const dbPassword = process.env.DB_PASSWORD;

// ❌ Vulnerable
const dbPassword = "mySecretPassword";
```

---

## ESLint Security Rules

The following security rules are enabled via `eslint-plugin-security`:

- `security/detect-object-injection` - Detects object injection vulnerabilities
- `security/detect-non-literal-regexp` - Detects non-literal regex patterns
- `security/detect-unsafe-regex` - Detects potentially unsafe regex patterns
- `security/detect-buffer-noassert` - Detects buffer operations without assertions
- `security/detect-child-process` - Detects unsafe child process execution
- `security/detect-disable-mustache-escape` - Detects disabled mustache escaping
- `security/detect-eval-with-expression` - Detects eval() usage
- `security/detect-no-csrf-before-method-override` - Detects CSRF protection issues
- `security/detect-non-literal-fs-filename` - Detects non-literal file system paths
- `security/detect-non-literal-require` - Detects non-literal require() calls
- `security/detect-possible-timing-attacks` - Detects potential timing attacks
- `security/detect-pseudoRandomBytes` - Detects insecure random number generation

---

## Validation

Use the `/validate-security` command to scan the codebase for security vulnerabilities:

```bash
/validate-security
/validate-security --path server/src
/validate-security --strict
```

---

## Planning Templates

All planning templates include security checklists. Review them during planning:

- `.cursor/commands/planning/templates/planning-architecture.md`
- `.cursor/commands/planning/templates/planning-technology.md`
- `.cursor/commands/planning/templates/planning-pattern.md`

---

## Resources

- **OWASP Top 10**: https://owasp.org/www-project-top-ten/
- **ESLint Security Plugin**: https://github.com/nodesecurity/eslint-plugin-security
- **Sequelize Security**: https://sequelize.org/docs/v6/core-concepts/raw-queries/
- **React Security**: https://react.dev/learn/escape-hatches
- **Vue Security**: https://vuejs.org/guide/best-practices/security.html

---

**Last Updated:** 2025-01-XX  
**Status:** Reference Document

