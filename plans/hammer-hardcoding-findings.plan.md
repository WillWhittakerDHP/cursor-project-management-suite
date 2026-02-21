# Hammer Hardcoding Findings (revised: config/utils exceptions, no inline allows)

## Current state

- **82** findings requiring review across **~52 files** (from [hardcoding-audit.md](client/.audit-reports/hardcoding-audit.md)).
- **Tier 1 rules**: `switchEntityKey`, `switchTypeLike`, `caseString`, `fieldEqualsString`, `fieldMapping`, `inlineLabelMap`, `omitFieldsArray`, `headersArray`, `entityKeyString`.
- **Breakdown**: Majority **fieldMapping**; then **caseString**; then **fieldEqualsString**; a few **inlineLabelMap** and **switchTypeLike**.
- **Exception handling**: Inline `// @audit-allow:hardcoding:<ruleId>` and central allowlist in [audit-global-config.json](client/.audit-reports/audit-global-config.json) (`allowlists.hardcoding`). **No inline allows.** Exceptions are implemented by changing the audit (config + shared utils) so regex-recognizable false positives are ignored; no `// @audit-allow` in code.

## Strategy

1. **Line-based exceptions (false positives)**  
   Handle logger metadata objects and similar “not really hardcoding” findings via **global config + shared utils** (and optionally script), not inline comments.

2. **Refactors**  
   Same as before: **caseString** → constants + map lookup; **fieldEqualsString** → config/formatter map; **fieldMapping** (real) → constants or casing utility; **inlineLabelMap** / **switchTypeLike** → constants or config.

---

## Phase 1: Regex-based exclusion (config + shared utils; no inline allows)

**Goal:** Treat “false positive” lines (e.g. logger metadata, simple return shapes) as allowed by **config and shared logic** so they no longer count as requiring review.

### 1.1 Global config: add `linePatterns` for hardcoding

- **File:** [client/.audit-reports/audit-global-config.json](client/.audit-reports/audit-global-config.json)
- Under `allowlists.hardcoding`, add a new key **`linePatterns`** (array of `{ ruleId, pattern, reason }`).
- **pattern**: string used as a RegExp (escape backslashes in JSON). Match = line is allowed for that ruleId.
- **Examples to add:**
  - **fieldMapping + logger metadata:** Allow when the line is a logger call with an object (second-arg style).  
    Pattern (example): `"logger\\.(debug|info|warn|error)\\s*\\("`  
    Reason: `"Logger metadata object; not API/DB field mapping"`
  - **fieldMapping + simple return shape:** Optional second entry if we want to allow lines that are only `return { key: value.something }` (single-line return of a small object).  
    Pattern (example): `"return\\s*\\{\\s*[a-zA-Z_$][a-zA-Z0-9_$]*\\s*:"`  
    Reason: `"Simple return shape; not API/DB mapping"`  
  - **Metadata field mapping** — objects with metadata/context keys (entityKey, fieldKey, year, month, status, entityId, etc.), not API response mapping. Pattern example: `"\\b(entityKey|fieldKey|wrappedKeys|year|month|status|entityId|itemId)\\s*:"`; reason: `"Metadata/context object; not API/DB field mapping"`. Tighten if needed so real API mappings are not allowed.

### 1.2 Shared utils: support `linePatterns` and optional `lineContent`

- **File:** [client/.scripts/shared-audit-utils.mjs](client/.scripts/shared-audit-utils.mjs)
- **loadCentralAllowlist(auditType):**  
  When reading `allowlists[auditType]`, also return **`linePatterns`**: `entry?.linePatterns ?? []`. So the returned object has `{ patterns, specific, linePatterns }`.
- **checkLinePatternAllowlist(lineContent, ruleId, linePatterns):**  
  New helper. If `linePatterns` is empty, return `{ allowed: false }`. Otherwise, for each entry where `entry.ruleId === ruleId` (or `entry.ruleId === '*'`), run `new RegExp(entry.pattern).test(lineContent)`. If any match, return `{ allowed: true, reason: entry.reason, source: 'linePattern' }`. Use try/catch around RegExp and test so bad patterns don’t break the audit.
- **isMatchAllowed(..., lineContent?):**  
  Add an optional 6th parameter `lineContent`. After existing inline and config checks, if `lineContent != null` and `configAllowlist.linePatterns?.length > 0`, call `checkLinePatternAllowlist(lineContent, ruleId, configAllowlist.linePatterns)`. If it returns allowed, return that result with source `'linePattern'`.  
  (Existing callers that don’t pass `lineContent` are unchanged.)
- **categorizeMatches(matches, repoPath, fileContent, auditType, configAllowlist):**  
  When calling `isMatchAllowed`, pass **`match.line`** as the 6th argument when the match object has a `line` property (e.g. hardcoding audit provides it). So: `isMatchAllowed(repoPath, match.ruleId, match.lineNumber, inlineExceptions, configAllowlist, match.line)`.
- **summarizeExceptions:**  
  Ensure `bySource` can count **`linePattern`** so the report shows how many exceptions came from line patterns (optional: add `linePattern: 0` and increment when `exception.source === 'linePattern'`).

### 1.3 Hardcoding script: pass `match.line` into categorizeMatches

- **File:** [client/.scripts/hardcoding-audit.mjs](client/.scripts/hardcoding-audit.mjs)
- No change to how matches are produced. The script already passes `matches` (with `line`), `repoPath`, `contents`, `AUDIT_TYPE`, `configAllowlist` to `categorizeMatches`. Once shared utils are updated, `categorizeMatches` will pass `match.line` into `isMatchAllowed`, so the hardcoding audit will automatically use `linePatterns` from the global config.

**Outcome:** Logger-metadata and other line-pattern false positives for hardcoding are allowed by config + shared utils; requiring-review count drops without any inline allows.

---

## Phase 2: caseString (switch/case on string literals)

- **Files:** [durationRounding.ts](client/src/utils/booking/durationRounding.ts), [propertyFeatureMatcher.ts](server/src/services/propertyFeatureMatcher.ts), [availabiltiesDbUtils.ts](server/src/utils/availabilities/availabiltiesDbUtils.ts).
- Move string literals to shared constants; replace `switch/case` with map lookup so the only occurrence of the literal is in a constants file (already allowlisted).
- **Outcome:** 0 caseString requiring review.

---

## Phase 3: fieldEqualsString (field === '...')

- **Files:** [StatusButton.vue](client/src/components/admin/generic/StatusButton.vue), [useFieldKeyboardGuard.ts](client/src/composables/admin/useFieldKeyboardGuard.ts), plus single-occurrence files (see report).
- Drive checks from constants or field config (e.g. [entityFieldConstants](client/src/constants/entityFieldConstants.ts)); use a small constant or config for keyboard shortcut keys if needed.
- **Outcome:** fieldEqualsString reduced or zero.

---

## Phase 4: fieldMapping (real API/contact/config mappings)

- **High-impact:** [appointmentDataBuilders.ts](client/src/utils/booking/appointmentDataBuilders.ts) (contact role config) → move to constant; server services (computedAvailabilityService, placesApiService, importCalendarData, calendarParsingHelpers, mapsHelpers, routesApiService) → centralize mapping in constants or use a small casing util where it’s snake ↔ camel.
- **Remaining:** Any still-flagged fieldMapping after linePatterns should be refactored to constants or shared util; no inline allows.
- **Outcome:** 0 real fieldMapping requiring review.

---

## Phase 5: Remaining rules (inlineLabelMap, switchTypeLike)

- **inlineLabelMap:** Move label/usage strings to constants (e.g. script constants).
- **switchTypeLike:** Refactor to config object keyed by type/entity.
- **Outcome:** No remaining Tier 1 requiring review except those explicitly allowed via config/utils.

---

## Phase 6: Verification

- Re-run hardcoding audit; confirm **requiring review** is **0** (or only justified exceptions).
- Confirm allowed exceptions are documented in **audit-global-config.json** (linePatterns + reasons) and optionally in the report (source `linePattern`).
- Run app and lint; no behavior change.

---

## Summary

| Phase | Action | Result |
|-------|--------|--------|
| 1 | Add `linePatterns` in global config; extend loadCentralAllowlist, isMatchAllowed, categorizeMatches, and summarizeExceptions in shared-audit-utils; hardcoding script already passes match.line | False positives (e.g. logger metadata) allowed by config/utils; no inline allows |
| 2–5 | Same refactors as before (caseString, fieldEqualsString, fieldMapping, inlineLabelMap, switchTypeLike) | 0 requiring review for real hardcoding |
| 6 | Re-run audit, start app, lint | Requiring review = 0; no regressions |

## Notes

- **No inline allows** for this effort; all exceptions are via script, **audit-global-config.json** (`allowlists.hardcoding.patterns`, `specific`, and new `linePatterns`), and **shared-audit-utils.mjs**.
- **linePatterns** are regexes; keep them narrow (e.g. logger only) so we don’t over-allow real field mappings.
- Constants/config files remain allowlisted by existing glob patterns; moving literals there still clears findings in application code.
