# Audit Report: session 6.3.2: 6.3.2

**Feature:** appointment-workflow
**Tier:** session
**Identifier:** 6.3.2
**Timestamp:** 2026-02-27T01:07:26.398Z
**Overall Status:** ⚠️ WARN

---

## Summary

- **Pass:** 0
- **Warn:** 3
- **Fail:** 0

**Average Score:** 72/100

## Score Comparison

| Category | Start | End | Delta | Status |
|----------|-------|-----|-------|--------|
| tier-quality | 68 | 86 | +18 | ✅ Improved |
| docs | 90 | 90 | +0 | ➡️ Unchanged |
| vue-architecture | 40 | 40 | +0 | ➡️ Unchanged |
| type-constant-inventory | 0 | 0 | +0 | ➡️ Unchanged |

**Overall:** 50 → 54 (+18 points improvement)

---

---

## Tier-quality Audit

**Status:** ⚠️ WARN
**Score:** 86/100 (+18 from baseline)
**Baseline:** 68/100

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
**Score:** 90/100 (+0 from baseline)
**Baseline:** 90/100

3/3 documents exist. 2 issue(s) found.

### Findings

- ⚠️ **WARNING**: Guide missing or incomplete section: Quick Start
  - Location: .project-manager/features/appointment-workflow/sessions/session-6.3.2-guide.md
  - Suggestion: Add or complete Quick Start section in guide
- ⚠️ **WARNING**: Guide missing or incomplete section: Session Workflow
  - Location: .project-manager/features/appointment-workflow/sessions/session-6.3.2-guide.md
  - Suggestion: Add or complete Session Workflow section in guide

### Recommendations

- Documentation is comprehensive and well-structured

---

## Vue-architecture Audit

**Status:** ⚠️ WARN
**Score:** 40/100 (+0 from baseline)
**Baseline:** 40/100

Scanned 176 .vue file(s); found 0 error(s), 6 warning(s).

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
- Documentation is comprehensive and well-structured
- Review `.project-manager/patterns/vue-architecture-contract.md` and move domain logic out of components.
- Review `.project-manager/patterns/composable-taxonomy.md` and standardize composable naming/return shapes.
