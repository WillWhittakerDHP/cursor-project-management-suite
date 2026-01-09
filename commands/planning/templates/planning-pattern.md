# Pattern Selection Planning Template

**Purpose:** Structure for selecting design patterns, architectural patterns, or code patterns

**Use When:** Choosing between different patterns, approaches, or design strategies

---

## Pattern Selection: [Pattern Name/Type]

**Date:** [Date]
**Status:** [Evaluating | Selected | Rejected]
**Decision Maker:** [Name/Role]

## Canonical References (Cursor-Owned)

Before selecting a pattern for Vue work, review:

- `.cursor/project-manager/patterns/vue-architecture-contract.md`
- `.cursor/project-manager/patterns/composable-taxonomy.md`
- `.cursor/project-manager/patterns/ai-consistency-routine.md`

### Context

**Problem Statement:**
[Describe the problem or need that requires a pattern choice]

**Use Case:**
[Describe the specific use case or scenario]

**Current Approach:**
[Describe current pattern or approach (if any)]

**Requirements:**
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]

---

## Pattern Options

### Pattern 1: [Pattern Name]

**Description:**
[Brief description of the pattern]

**Type:** [Design Pattern | Architectural Pattern | Code Pattern]
**Category:** [Creational | Structural | Behavioral | Architectural]

**When to Use:**
- [Scenario 1]
- [Scenario 2]
- [Scenario 3]

**When NOT to Use:**
- [Scenario 1]
- [Scenario 2]

**Pros:**
- [Advantage 1]
- [Advantage 2]
- [Advantage 3]

**Cons:**
- [Disadvantage 1]
- [Disadvantage 2]
- [Disadvantage 3]

**Complexity:** [Low | Medium | High]
**Maintainability:** [Low | Medium | High]
**Performance Impact:** [Positive | Neutral | Negative]
**Team Familiarity:** [High | Medium | Low]

**Code Example:**
```typescript
// Brief example showing pattern usage
```

**Existing Usage in Codebase:**
- [Location 1]
- [Location 2]

---

### Pattern 2: [Pattern Name]

**Description:**
[Brief description of the pattern]

**Type:** [Design Pattern | Architectural Pattern | Code Pattern]
**Category:** [Creational | Structural | Behavioral | Architectural]

**When to Use:**
- [Scenario 1]
- [Scenario 2]
- [Scenario 3]

**When NOT to Use:**
- [Scenario 1]
- [Scenario 2]

**Pros:**
- [Advantage 1]
- [Advantage 2]
- [Advantage 3]

**Cons:**
- [Disadvantage 1]
- [Disadvantage 2]
- [Disadvantage 3]

**Complexity:** [Low | Medium | High]
**Maintainability:** [Low | Medium | High]
**Performance Impact:** [Positive | Neutral | Negative]
**Team Familiarity:** [High | Medium | Low]

**Code Example:**
```typescript
// Brief example showing pattern usage
```

**Existing Usage in Codebase:**
- [Location 1]
- [Location 2]

---

### Pattern 3: [Pattern Name] (if applicable)

[Repeat structure above]

---

## Use Case Analysis

**Primary Use Cases:**
1. [Use case 1]
   - Pattern 1: [How it addresses this]
   - Pattern 2: [How it addresses this]

2. [Use case 2]
   - Pattern 1: [How it addresses this]
   - Pattern 2: [How it addresses this]

**Edge Cases:**
- [Edge case 1] - [How each pattern handles it]
- [Edge case 2] - [How each pattern handles it]

---

## Trade-offs Comparison

| Aspect | Pattern 1 | Pattern 2 | Pattern 3 |
|--------|-----------|-----------|-----------|
| Complexity | [Rating] | [Rating] | [Rating] |
| Maintainability | [Rating] | [Rating] | [Rating] |
| Performance | [Rating] | [Rating] | [Rating] |
| Flexibility | [Rating] | [Rating] | [Rating] |
| Team Familiarity | [Rating] | [Rating] | [Rating] |
| Code Reusability | [Rating] | [Rating] | [Rating] |

---

## Decision

**Selected Pattern:** [Pattern Name]

**Rationale:**
[Explain why this pattern was chosen. Reference specific use cases, requirements, or trade-offs]

**Key Decision Factors:**
- [Factor 1]
- [Factor 2]
- [Factor 3]

**Rejected Patterns:**
- [Pattern Name] - [Reason for rejection]
- [Pattern Name] - [Reason for rejection]

---

## Implementation Plan

**Current State:**
[Describe current pattern/approach]

**Target State:**
[Describe target pattern/approach]

**Implementation Steps:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Files to Modify:**
- [File 1]
- [File 2]
- [File 3]

**New Files to Create:**
- [File 1]
- [File 2]

**Timeline:** [Estimated timeline]

---

## Risk Assessment

**Technical Risks:**
- [Risk 1] - [Mitigation]
- [Risk 2] - [Mitigation]

**Code Quality Risks:**
- [Risk 1] - [Mitigation]

**Team Adoption Risks:**
- [Risk 1] - [Mitigation]

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

- [Pattern documentation]
- [Related patterns]
- [Codebase examples]

---

## Notes

[Additional notes, concerns, or follow-up items]

