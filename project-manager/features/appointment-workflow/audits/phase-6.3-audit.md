# Audit Report: phase 6.3: 6.3

**Feature:** appointment-workflow
**Tier:** phase
**Identifier:** 6.3
**Timestamp:** 2026-02-27T04:10:09.305Z
**Overall Status:** ⚠️ WARN

---

## Summary

- **Pass:** 0
- **Warn:** 1
- **Fail:** 0

**Average Score:** 80/100

## Score Comparison

| Category | Start | End | Delta | Status |
|----------|-------|-----|-------|--------|
| security | 0 | N/A | N/A | ⚠️ Missing |
| docs | 75 | N/A | N/A | ⚠️ Missing |
| vue-architecture | 0 | N/A | N/A | ⚠️ Missing |
| tier-quality | N/A | 80 | N/A | 🆕 New |

---

---

## Tier-quality Audit

**Status:** ⚠️ WARN
**Score:** 80/100

Ran 12 phase-tier audits; found 0 error(s), 1 warning(s), 5 info signal(s).

### Findings

- ℹ️ **INFO**: type-similarity audit produced output (review JSON for details)
  - Location: /Users/districthomepro/Bonsai/Differential_Scheduler/client/.audit-reports/type-similarity-audit.json
  - Suggestion: Review client/.audit-reports/type-similarity-audit.json for findings
- ℹ️ **INFO**: 9 duplication group(s) with high consolidation leverage
  - Location: /Users/districthomepro/Bonsai/Differential_Scheduler/client/.audit-reports/duplication-audit.json
  - Suggestion: Review client/.audit-reports/duplication-audit.md for DRY opportunities
- ℹ️ **INFO**: import-graph audit produced output (review JSON for details)
  - Location: /Users/districthomepro/Bonsai/Differential_Scheduler/client/.audit-reports/import-graph-audit.json
  - Suggestion: Review client/.audit-reports/import-graph-audit.json for findings
- ℹ️ **INFO**: file-cohesion audit produced output (review JSON for details)
  - Location: /Users/districthomepro/Bonsai/Differential_Scheduler/client/.audit-reports/file-cohesion-audit.json
  - Suggestion: Review client/.audit-reports/file-cohesion-audit.json for findings
- ℹ️ **INFO**: deprecation audit produced output (review JSON for details)
  - Location: /Users/districthomepro/Bonsai/Differential_Scheduler/client/.audit-reports/deprecation-audit.json
  - Suggestion: Review client/.audit-reports/deprecation-audit.json for findings
- ⚠️ **WARNING**: 0 untyped inject(s), 2 deep provide/inject chain(s)
  - Location: /Users/districthomepro/Bonsai/Differential_Scheduler/client/.audit-reports/data-flow-health-audit.json
  - Suggestion: Review data-flow-health-audit.md for provide/inject hygiene

### Recommendations

- Review audit reports for warnings
- Review duplication audit for consolidation opportunities

---

## Overall Recommendations

- Review audit reports for warnings
- Review duplication audit for consolidation opportunities
