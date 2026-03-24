---
name: allowlist-explicit-review
description: Systematically review central allowlist `specific` rows and inline @audit-allow comments against code and latest audit JSON to spot stale or convenience suppressions versus legitimate exceptions.
---

# Allowlist explicit review

Use this skill when the user wants to **audit allowlists for “lazy” or stale allows** (explicit file/line suppressions and inline comments), not broad glob patterns (see allowlist glob coverage audit separately).

## Artifacts

- **Queue (run first):** From repo `client/`, run `npm run audit:allowlist-explicit-review` then open `client/.audit-reports/allowlist-explicit-review-queue-audit.md` (and `.json`). Optional short summary: `npm run audit:allowlist-explicit-review:summary`.
- **Cross-reference:** The queue compares each row to `client/.audit-reports/<auditType>-audit.json` when present, using `files[].allowed[]` (and `scanned[].allowed[]` where audits use that shape). Regenerate JSON by running the relevant `npm run audit:<type>` first.
- **Integrity / globs:** `npm run audit:allowlist-cleanup` and `npm run audit:allowlist-glob-coverage` complement this workflow.

## Agent procedure

1. **Run the queue** (or use an existing fresh report). Sort is already by heuristic priority (weak reason text, cross-ref `none`, wildcards, wide line ranges; fixtures/tests deprioritized).
2. **Work top-down.** For each row:
   - Open the file at the line (inline) or read the file and any `lineRange` (config `specific`).
   - Decide whether the suppressed pattern **still exists** and whether a **small refactor** could remove the need for the allow.
3. **Falsification:** For suspicious rows, plan to **remove or narrow** the allow (delete `specific` entry or inline comment, or tighten `lineRange` / `ruleIds`), then run **one** target audit, e.g. `npm run audit:error-handling`, and confirm whether new `requiresReview` noise appears.
4. **Never** recommend allowlisting `neverPermissibleCategories` rule IDs from `client/.audit-reports/audit-global-config.json` — those must be eliminated or migrated, not suppressed.
5. **Session output:** End with a compact table: `Keep` | `Remove` | `Narrow` | `Fix code first` with a one-line rationale per row touched.

## Interpreting cross-ref

- **hit:** Latest audit JSON contains an allowed finding consistent with path/line/rule — suppression is **active** (not automatically “lazy”).
- **none:** No matching allowed finding — candidate **stale allow**, **path/case mismatch**, or audit not run; confirm by removal experiment.
- **unknown:** Missing JSON or unsupported schema — run the audit or inspect manually.

Heuristic flags are **not** verdicts; they only rank the queue.

## Maintenance

If an audit changes how it writes JSON, update `flattenAllowedFromAuditJson` in `client/.scripts/allowlist-explicit-review-queue.mjs` when adding new top-level shapes.
