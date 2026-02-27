# Audit Report: session 6.4.2: 6.4.2

**Feature:** appointment-workflow
**Tier:** session
**Identifier:** 6.4.2
**Timestamp:** 2026-02-27T19:35:31.806Z
**Overall Status:** ⚠️ WARN

---

## Summary

- **Pass:** 0
- **Warn:** 3
- **Fail:** 0

**Average Score:** 69/100

## Score Comparison

| Category | Start | End | Delta | Status |
|----------|-------|-----|-------|--------|
| tier-quality | 86 | 86 | +0 | ➡️ Unchanged |
| docs | 75 | 80 | +5 | ✅ Improved |
| vue-architecture | 40 | 40 | +0 | ➡️ Unchanged |
| type-constant-inventory | 0 | 0 | +0 | ➡️ Unchanged |
| composable-governance | 94 | 94 | +0 | ➡️ Unchanged |
| function-governance | 100 | 100 | +0 | ➡️ Unchanged |
| component-governance | 100 | 100 | +0 | ➡️ Unchanged |

**Overall:** 71 → 71 (+5 points improvement)

---

---

## Tier-quality Audit

**Status:** ⚠️ WARN
**Score:** 86/100 (+0 from baseline)
**Baseline:** 86/100

Ran 9 session-tier audits; found 0 error(s), 1 warning(s), 2 info signal(s).

### Findings

- ⚠️ **WARNING**: 1 file(s) with high complexity scores
  - Location: /Users/districthomepro/Bonsai/Differential_Scheduler/client/.audit-reports/composables-logic-audit.json
  - Suggestion: Review client/.audit-reports/composables-logic-audit.md for top hotspots
- ℹ️ **INFO**: constants-consolidation audit produced output (review JSON for details)
  - Location: /Users/districthomepro/Bonsai/Differential_Scheduler/client/.audit-reports/constants-consolidation-audit.json
  - Suggestion: Review client/.audit-reports/constants-consolidation-audit.json for findings
- ℹ️ **INFO**: 1 high-fan-in composable finding(s) requiring coordinated repair
  - Location: /Users/districthomepro/Bonsai/Differential_Scheduler/client/.audit-reports/composable-health-audit.json
  - Suggestion: Review composable-health-audit.md wave 3 for multi-file planning

### Recommendations

- Review audit reports for warnings

---

## Docs Audit

**Status:** ⚠️ WARN
**Score:** 80/100 (+5 from baseline)
**Baseline:** 75/100

3/3 documents exist. 4 issue(s) found.

### Findings

- ⚠️ **WARNING**: Guide missing or incomplete section: Quick Start
  - Location: .project-manager/features/appointment-workflow/sessions/session-6.4.2-guide.md
  - Suggestion: Add or complete Quick Start section in guide
- ⚠️ **WARNING**: Guide missing or incomplete section: Learning Goals
  - Location: .project-manager/features/appointment-workflow/sessions/session-6.4.2-guide.md
  - Suggestion: Add or complete Learning Goals section in guide
- ⚠️ **WARNING**: Guide missing or incomplete section: Tasks
  - Location: .project-manager/features/appointment-workflow/sessions/session-6.4.2-guide.md
  - Suggestion: Add or complete Tasks section in guide
- ⚠️ **WARNING**: Guide missing or incomplete section: Session Workflow
  - Location: .project-manager/features/appointment-workflow/sessions/session-6.4.2-guide.md
  - Suggestion: Add or complete Session Workflow section in guide

### Recommendations

- Review documentation structure and completeness

---

## Vue-architecture Audit

**Status:** ⚠️ WARN
**Score:** 40/100 (+0 from baseline)
**Baseline:** 40/100

Scanned 174 .vue file(s); found 0 error(s), 6 warning(s).

### Findings

- ⚠️ **WARNING**: Component script is large (183 non-empty lines). This often indicates logic creep.
  - Location: client/src/components/booking/BookingWizard.vue
  - Suggestion: Move domain rules/orchestration into composables; keep only UI state and event wiring.
- ⚠️ **WARNING**: Component script is large (229 non-empty lines). This often indicates logic creep.
  - Location: client/src/views/admin/tabs/InstancesTab.vue
  - Suggestion: Move domain rules/orchestration into composables; keep only UI state and event wiring.
- ⚠️ **WARNING**: Component defines many local functions (14). Consider extracting reusable/domain logic into composables.
  - Location: client/src/views/admin/tabs/components/CapacityConstraintsPanel.vue
  - Suggestion: If functions implement business rules or shared transforms, move them into composables/utilities.
- ⚠️ **WARNING**: Component defines many local functions (8). Consider extracting reusable/domain logic into composables.
  - Location: client/src/views/admin/tabs/components/GridConfigPanel.vue
  - Suggestion: If functions implement business rules or shared transforms, move them into composables/utilities.
- ⚠️ **WARNING**: Component defines many local functions (9). Consider extracting reusable/domain logic into composables.
  - Location: client/src/views/admin/tabs/components/OverlapConstraintsPanel.vue
  - Suggestion: If functions implement business rules or shared transforms, move them into composables/utilities.
- ⚠️ **WARNING**: Component defines many local functions (11). Consider extracting reusable/domain logic into composables.
  - Location: client/src/views/admin/tabs/components/PropertyCreateForm.vue
  - Suggestion: If functions implement business rules or shared transforms, move them into composables/utilities.

### Recommendations

- Review `.project-manager/patterns/vue-architecture-contract.md` and move domain logic out of components.
- Review `.project-manager/patterns/composable-taxonomy.md` and standardize composable naming/return shapes.

---

## Overall Recommendations

- Review audit reports for warnings
- Review documentation structure and completeness
- Review `.project-manager/patterns/vue-architecture-contract.md` and move domain logic out of components.
- Review `.project-manager/patterns/composable-taxonomy.md` and standardize composable naming/return shapes.
