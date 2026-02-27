# Audit Report: task 6.3.1.5: 6.3.1.5

**Feature:** appointment-workflow
**Tier:** task
**Identifier:** 6.3.1.5
**Timestamp:** 2026-02-23T22:23:15.308Z
**Overall Status:** ❌ FAIL

---

## Summary

- **Pass:** 0
- **Warn:** 0
- **Fail:** 2

**Average Score:** 0/100

---

## Security Audit

**Status:** ❌ FAIL
**Score:** 0/100

Security audit failed. 8 error(s), 9 warning(s).

### Findings

- ❌ **ERROR**: 1. Dependency Vulnerabilities: **Dependency vulnerabilities detected**
  - Location: 1. Dependency Vulnerabilities
  - Suggestion: Review security guidelines and fix security issues
- ❌ **ERROR**: 1. Dependency Vulnerabilities: -  **axios@unknown**
  - Location: 1. Dependency Vulnerabilities
  - Suggestion: Review security guidelines and fix security issues
- ❌ **ERROR**: 1. Dependency Vulnerabilities: -  **body-parser@unknown**
  - Location: 1. Dependency Vulnerabilities
  - Suggestion: Review security guidelines and fix security issues
- ❌ **ERROR**: 1. Dependency Vulnerabilities: -  **express@unknown**
  - Location: 1. Dependency Vulnerabilities
  - Suggestion: Review security guidelines and fix security issues
- ❌ **ERROR**: 1. Dependency Vulnerabilities: -  **form-data@unknown**
  - Location: 1. Dependency Vulnerabilities
  - Suggestion: Review security guidelines and fix security issues
- ❌ **ERROR**: 1. Dependency Vulnerabilities: -  **qs@unknown**
  - Location: 1. Dependency Vulnerabilities
  - Suggestion: Review security guidelines and fix security issues
- ⚠️ **WARNING**: 1. Dependency Vulnerabilities: -  **@babel/runtime@unknown**
  - Location: 1. Dependency Vulnerabilities
  - Suggestion: Review security best practices
- ⚠️ **WARNING**: 1. Dependency Vulnerabilities: -  **lodash@unknown**
  - Location: 1. Dependency Vulnerabilities
  - Suggestion: Review security best practices
- ⚠️ **WARNING**: 1. Dependency Vulnerabilities: -  **vite@unknown**
  - Location: 1. Dependency Vulnerabilities
  - Suggestion: Review security best practices
- ⚠️ **WARNING**: 3. Security Configuration: -  **app configuration**
  - Location: 3. Security Configuration
  - Suggestion: Review security best practices
- ⚠️ **WARNING**: 3. Security Configuration: -  **app configuration**
  - Location: 3. Security Configuration
  - Suggestion: Review security best practices
- ⚠️ **WARNING**: 3. Security Configuration: -  **app configuration**
  - Location: 3. Security Configuration
  - Suggestion: Review security best practices
- ⚠️ **WARNING**: 3. Security Configuration: -  **session configuration**
  - Location: 3. Security Configuration
  - Suggestion: Review security best practices
- ⚠️ **WARNING**: 3. Security Configuration: -  **session configuration**
  - Location: 3. Security Configuration
  - Suggestion: Review security best practices
- ⚠️ **WARNING**: 5. Authentication Patterns: -  **package.json**
  - Location: 5. Authentication Patterns
  - Suggestion: Review security best practices
- ❌ **ERROR**: 6. IDOR Vulnerabilities: **1 security check(s) found issues**
  - Location: 6. IDOR Vulnerabilities
  - Suggestion: Review security guidelines and fix security issues
- ❌ **ERROR**: 6. IDOR Vulnerabilities: | Dependencies |  Issues Found |
  - Location: 6. IDOR Vulnerabilities
  - Suggestion: Review security guidelines and fix security issues

### Recommendations

- Fix 8 security error(s) immediately
- Review SECURITY_GUIDELINES.md for best practices
- Address 9 security warning(s)

---

## Vue-architecture Audit

**Status:** ❌ FAIL
**Score:** 0/100

Scanned 149 .vue file(s); found 2 error(s), 13 warning(s).

### Findings

- ⚠️ **WARNING**: Component script is large (211 non-empty lines). This often indicates logic creep.
  - Location: client/src/@core/components/TheCustomizer.vue
  - Suggestion: Move domain rules/orchestration into composables; keep only UI state and event wiring.
- ⚠️ **WARNING**: Component script is large (319 non-empty lines). This often indicates logic creep.
  - Location: client/src/components/admin/generic/EntityCard.vue
  - Suggestion: Move domain rules/orchestration into composables; keep only UI state and event wiring.
- ⚠️ **WARNING**: Component script is large (194 non-empty lines). This often indicates logic creep.
  - Location: client/src/components/admin/generic/fields/SelectInputs.vue
  - Suggestion: Move domain rules/orchestration into composables; keep only UI state and event wiring.
- ⚠️ **WARNING**: Component script is large (215 non-empty lines). This often indicates logic creep.
  - Location: client/src/components/admin/metadata/AdminPrimitiveMetadataEditor.vue
  - Suggestion: Move domain rules/orchestration into composables; keep only UI state and event wiring.
- ⚠️ **WARNING**: Component script is large (213 non-empty lines). This often indicates logic creep.
  - Location: client/src/components/booking/BookingWizard.vue
  - Suggestion: Move domain rules/orchestration into composables; keep only UI state and event wiring.
- ⚠️ **WARNING**: Component script is large (242 non-empty lines). This often indicates logic creep.
  - Location: client/src/components/booking/dev/DevPanelsContainer.vue
  - Suggestion: Move domain rules/orchestration into composables; keep only UI state and event wiring.
- ❌ **ERROR**: Component script references a network/fetch client. Data fetching should be moved into composables/stores/services.
  - Location: client/src/components/booking/steps/PropertyDetailsStep.vue
  - Suggestion: Extract to a composable (use*Query) or store/service and keep component as wiring + UI behavior.
- ❌ **ERROR**: Component script references a network/fetch client. Data fetching should be moved into composables/stores/services.
  - Location: client/src/components/common/AddressAutocomplete.vue
  - Suggestion: Extract to a composable (use*Query) or store/service and keep component as wiring + UI behavior.
- ⚠️ **WARNING**: Component script is large (212 non-empty lines). This often indicates logic creep.
  - Location: client/src/components/common/AddressAutocomplete.vue
  - Suggestion: Move domain rules/orchestration into composables; keep only UI state and event wiring.
- ⚠️ **WARNING**: Component script is large (181 non-empty lines). This often indicates logic creep.
  - Location: client/src/views/admin/tabs/BusinessControlsTab.vue
  - Suggestion: Move domain rules/orchestration into composables; keep only UI state and event wiring.
- ⚠️ **WARNING**: Component script is large (355 non-empty lines). This often indicates logic creep.
  - Location: client/src/views/admin/tabs/InstancesTab.vue
  - Suggestion: Move domain rules/orchestration into composables; keep only UI state and event wiring.
- ⚠️ **WARNING**: Component defines many local functions (10). Consider extracting reusable/domain logic into composables.
  - Location: client/src/views/admin/tabs/InstancesTab.vue
  - Suggestion: If functions implement business rules or shared transforms, move them into composables/utilities.
- ⚠️ **WARNING**: Component script is large (292 non-empty lines). This often indicates logic creep.
  - Location: client/src/views/admin/tabs/ShapesTab.vue
  - Suggestion: Move domain rules/orchestration into composables; keep only UI state and event wiring.
- ⚠️ **WARNING**: Component defines many local functions (18). Consider extracting reusable/domain logic into composables.
  - Location: client/src/views/admin/tabs/ShapesTab.vue
  - Suggestion: If functions implement business rules or shared transforms, move them into composables/utilities.
- ⚠️ **WARNING**: Component defines many local functions (10). Consider extracting reusable/domain logic into composables.
  - Location: client/src/views/admin/tabs/components/AppointmentsTable.vue
  - Suggestion: If functions implement business rules or shared transforms, move them into composables/utilities.

### Recommendations

- Review `.project-manager/patterns/vue-architecture-contract.md` and move domain logic out of components.
- Review `.project-manager/patterns/composable-taxonomy.md` and standardize composable naming/return shapes.

---

## Overall Recommendations

- Fix 8 security error(s) immediately
- Review SECURITY_GUIDELINES.md for best practices
- Address 9 security warning(s)
- Review `.project-manager/patterns/vue-architecture-contract.md` and move domain logic out of components.
- Review `.project-manager/patterns/composable-taxonomy.md` and standardize composable naming/return shapes.
