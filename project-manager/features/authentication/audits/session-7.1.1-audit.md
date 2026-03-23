# Audit Report: session 7.1.1: 7.1.1

**Feature:** authentication
**Tier:** session
**Identifier:** 7.1.1
**Timestamp:** 2026-03-23T15:55:03.253Z
**Overall Status:** ⚠️ WARN

---

## Summary

- **Pass:** 1
- **Warn:** 2
- **Fail:** 0

**Average Score:** 76/100

## Score Comparison

| Category | Start | End | Delta | Status |
|----------|-------|-----|-------|--------|
| tier-quality-coverage | 100 | N/A | N/A | ⚠️ Missing |
| type-constant-inventory | 0 | 0 | +0 | ➡️ Unchanged |
| composable-governance | 100 | 100 | +0 | ➡️ Unchanged |
| function-governance | 100 | 100 | +0 | ➡️ Unchanged |
| component-governance | 100 | 100 | +0 | ➡️ Unchanged |
| tier-quality | N/A | 88 | N/A | 🆕 New |
| docs | N/A | 100 | N/A | 🆕 New |
| vue-architecture | N/A | 40 | N/A | 🆕 New |

**Overall:** 80 → 75 (+0 points improvement)

---

---

## Tier-quality Audit

**Status:** ⚠️ WARN
**Score:** 88/100

Ran 9 session-tier audits; found 0 error(s), 1 warning(s), 1 info signal(s).

### Findings

- ⚠️ **WARNING**: 1 file(s) with high complexity scores
  - Location: /Users/districthomepro/Bonsai/Differential_Scheduler/client/.audit-reports/composables-logic-audit.json
  - Suggestion: Review client/.audit-reports/composables-logic-audit.md for top hotspots
- ℹ️ **INFO**: constants-consolidation audit produced output (review JSON for details)
  - Location: /Users/districthomepro/Bonsai/Differential_Scheduler/client/.audit-reports/constants-consolidation-audit.json
  - Suggestion: Review client/.audit-reports/constants-consolidation-audit.json for findings

### Recommendations

- Review audit reports for warnings

---

## Docs Audit

**Status:** ✅ PASS
**Score:** 100/100

3/3 documents exist. 0 issue(s) found.

### Recommendations

- Documentation is comprehensive and well-structured

---

## Vue-architecture Audit

**Status:** ⚠️ WARN
**Score:** 40/100

Scanned 206 .vue file(s); found 0 error(s), 6 warning(s).

### Findings

- ⚠️ **WARNING**: Component script is large (207 non-empty lines). This often indicates logic creep.
  - Location: client/src/components/admin/generic/EntityCard.vue
  - Suggestion: Move domain rules/orchestration into composables; keep only UI state and event wiring.
- ⚠️ **WARNING**: Component script is large (206 non-empty lines). This often indicates logic creep.
  - Location: client/src/components/booking/steps/AvailabilityStep.vue
  - Suggestion: Move domain rules/orchestration into composables; keep only UI state and event wiring.
- ⚠️ **WARNING**: Component script is large (187 non-empty lines). This often indicates logic creep.
  - Location: client/src/components/booking/steps/AvailabilitySubStepContent.vue
  - Suggestion: Move domain rules/orchestration into composables; keep only UI state and event wiring.
- ⚠️ **WARNING**: Component defines many local functions (9). Consider extracting reusable/domain logic into composables.
  - Location: client/src/components/booking/steps/AvailabilitySubStepContent.vue
  - Suggestion: If functions implement business rules or shared transforms, move them into composables/utilities.
- ⚠️ **WARNING**: Composable export name does not match file name: useMountDragAndDropOnPanelsIfReady vs useDragAndDropInstance
  - Location: client/src/composables/admin/useDragAndDropInstance.ts
  - Suggestion: Rename the file or export so `useX.ts` exports `useX` (reduces drift and improves discoverability).
- ⚠️ **WARNING**: Composable export name does not match file name: useComputedAvailabilityMutableState vs useComputedAvailabilityState
  - Location: client/src/composables/booking/useComputedAvailabilityState.ts
  - Suggestion: Rename the file or export so `useX.ts` exports `useX` (reduces drift and improves discoverability).

### Recommendations

- Review `.project-manager/patterns/vue-architecture-contract.md` and move domain logic out of components.
- Review `.project-manager/patterns/composable-taxonomy.md` and standardize composable naming/return shapes.

---

## Overall Recommendations

- Review audit reports for warnings
- Documentation is comprehensive and well-structured
- Review `.project-manager/patterns/vue-architecture-contract.md` and move domain logic out of components.
- Review `.project-manager/patterns/composable-taxonomy.md` and standardize composable naming/return shapes.
