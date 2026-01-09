# Architecture Planning Template

**Purpose:** Structure for architectural decisions and planning

**Use When:** Planning major architectural changes, system design decisions, or structural modifications

---

## Architecture Decision: [Decision Name]

**Date:** [Date]
**Status:** [Proposed | Approved | Rejected]
**Decision Maker:** [Name/Role]

### Context

**Problem Statement:**
[Describe the problem or need that requires an architectural decision]

**Constraints:**
- [Constraint 1]
- [Constraint 2]
- [Constraint 3]

**Requirements:**
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]

---

## Alternatives Considered

### Alternative 1: [Name]

**Description:**
[Describe this architectural approach]

**Pros:**
- [Advantage 1]
- [Advantage 2]
- [Advantage 3]

**Cons:**
- [Disadvantage 1]
- [Disadvantage 2]
- [Disadvantage 3]

**Trade-offs:**
- [Trade-off 1]
- [Trade-off 2]

**Implementation Complexity:** [Low | Medium | High]

**Performance Impact:** [Positive | Neutral | Negative]

**Maintenance Impact:** [Low | Medium | High]

---

### Alternative 2: [Name]

**Description:**
[Describe this architectural approach]

**Pros:**
- [Advantage 1]
- [Advantage 2]
- [Advantage 3]

**Cons:**
- [Disadvantage 1]
- [Disadvantage 2]
- [Disadvantage 3]

**Trade-offs:**
- [Trade-off 1]
- [Trade-off 2]

**Implementation Complexity:** [Low | Medium | High]

**Performance Impact:** [Positive | Neutral | Negative]

**Maintenance Impact:** [Low | Medium | High]

---

### Alternative 3: [Name] (if applicable)

[Repeat structure above]

---

## Decision

**Selected Alternative:** [Alternative Name]

**Rationale:**
[Explain why this alternative was chosen over others. Reference specific requirements, constraints, or trade-offs that influenced the decision]

**Key Factors:**
- [Factor 1 that influenced decision]
- [Factor 2 that influenced decision]
- [Factor 3 that influenced decision]

---

## Risk Assessment

**Technical Risks:**
- [Risk 1] - [Mitigation strategy]
- [Risk 2] - [Mitigation strategy]
- [Risk 3] - [Mitigation strategy]

**Timeline Risks:**
- [Risk 1] - [Mitigation strategy]
- [Risk 2] - [Mitigation strategy]

**Resource Risks:**
- [Risk 1] - [Mitigation strategy]
- [Risk 2] - [Mitigation strategy]

---

## Implementation Plan

**Phase 1:** [Description]
- Tasks: [Task list]
- Timeline: [Timeline]
- Dependencies: [Dependencies]

**Phase 2:** [Description]
- Tasks: [Task list]
- Timeline: [Timeline]
- Dependencies: [Dependencies]

**Phase 3:** [Description]
- Tasks: [Task list]
- Timeline: [Timeline]
- Dependencies: [Dependencies]

---

## Security Considerations

### SQL Injection Prevention
- [ ] All database queries use parameterized queries/Sequelize methods
- [ ] No string concatenation for SQL queries
- [ ] Input validation before database operations
- [ ] No use of `sequelize.query()` with user input in SQL strings

### XSS Prevention
- [ ] User input sanitized before rendering
- [ ] React: Using React's built-in escaping (default behavior)
- [ ] Vue: Using v-text or proper escaping for user content
- [ ] No use of `dangerouslySetInnerHTML` or `v-html` with user input
- [ ] Content Security Policy headers configured

### Authentication/Authorization
- [ ] All protected routes verify authentication
- [ ] User permissions checked before data access
- [ ] No sensitive data in client-side code
- [ ] Session tokens properly secured

### Input Validation
- [ ] Server-side validation for all inputs
- [ ] Type checking and schema validation (Joi/Zod)
- [ ] Rate limiting on public endpoints
- [ ] File upload validation (if applicable)

### Secure Configuration
- [ ] Environment variables for secrets (no hardcoded credentials)
- [ ] HTTPS enforced in production
- [ ] CORS properly configured
- [ ] Security headers (helmet.js) configured

### Security Validation
- [ ] Run `/security-audit` to check for vulnerabilities
- [ ] Review dependency vulnerabilities (`/security-check-dependencies`)
- [ ] Check for exposed secrets (`/security-check-secrets`)
- [ ] Validate security configuration (`/security-check-config`)
- [ ] Verify CSRF protection (`/security-check-csrf`)
- [ ] Check authentication patterns (`/security-check-auth`)
- [ ] Review IDOR vulnerabilities (`/security-check-idor`)
- [ ] Run ESLint security checks (`/validate-security`)

**Note:** Security audit is automatically run in `/planning-plan-with-checks` as Step 5. See `.cursor/commands/security/QUICK_REFERENCE.md` for command details.

---

## Success Criteria

- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

---

## References

- [Reference document 1]
- [Reference document 2]
- [Related decision 1]

---

## Notes

[Additional notes, concerns, or follow-up items]

