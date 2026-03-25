# Audit Report: phase 6.14: 6.14

**Feature:** appointment-workflow
**Tier:** phase
**Identifier:** 6.14
**Timestamp:** 2026-03-24T22:44:15.883Z
**Overall Status:** ✅ PASS

---

## Summary

- **Pass:** 1
- **Warn:** 0
- **Fail:** 0

**Average Score:** 92/100

## Score Comparison

| Category | Start | End | Delta | Status |
|----------|-------|-----|-------|--------|
| tier-quality-coverage | 100 | N/A | N/A | ⚠️ Missing |
| tier-quality | N/A | 92 | N/A | 🆕 New |

---

---

## Tier-quality Audit

**Status:** ✅ PASS
**Score:** 92/100

Ran 12 phase-tier audits; found 0 error(s), 0 warning(s), 4 info signal(s).

### Findings

- ℹ️ **INFO**: 1 type-similarity group(s) with UNIFY/BRAND action
  - Location: /Users/districthomepro/Bonsai/Differential_Scheduler/client/.audit-reports/type-similarity-audit.json
  - Suggestion: Review client/.audit-reports/type-similarity-audit.json for type consolidation
- ℹ️ **INFO**: 31 duplication group(s) with high consolidation leverage
  - Location: /Users/districthomepro/Bonsai/Differential_Scheduler/client/.audit-reports/duplication-audit.json
  - Suggestion: Review client/.audit-reports/duplication-audit.md for DRY opportunities
- ℹ️ **INFO**: 24 fan-in violation(s), 21 composable chain depth violation(s)
  - Location: /Users/districthomepro/Bonsai/Differential_Scheduler/client/.audit-reports/import-graph-audit.json
  - Suggestion: Review client/.audit-reports/import-graph-audit.json for import structure
- ℹ️ **INFO**: 2 file(s) with P0/P1 deprecation findings
  - Location: /Users/districthomepro/Bonsai/Differential_Scheduler/client/.audit-reports/deprecation-audit.json
  - Suggestion: Review client/.audit-reports/deprecation-audit.json for deprecation cleanup

### Recommendations

- Review duplication audit for consolidation opportunities

---

## Overall Recommendations

- Review duplication audit for consolidation opportunities
