/**
 * Multi-doc rollup merge contracts (harness tier-end).
 *
 * **Log:** Parent body preserved under `## Parent log (pre-merge body)`; each child log appended under
 * `## Rolled up child logs` → `### {Task|Session|Phase} id (source: file)`. Output passed through
 * `normalizeSessionLogMarkdown`. Idempotency: `<!-- harness-log-rollup ... -->` on line 1.
 *
 * **Handoff:** Top-level `## Current Status`, `## Next Action`, `## Transition Context` only (depth-2
 * excerpts from parent). Child content appears under `## Child handoff excerpts` as `####` headings with
 * bold **Transition Context (excerpt):** / **Current Status (excerpt):** (avoids verifyHandoff matching
 * nested `##`). Idempotency: `<!-- harness-handoff-rollup ... -->` line 1.
 *
 * **Guide (safe / profile `all`):** No tierDown merge. Child `*-guide.md` files renamed to
 * `doc-archive/guide/<tier>/<rollupId>/<timestamp>/`; parent gets first-line marker + original body +
 * `## Guide doc rollup (harness)` listing archived paths.
 *
 * **Wave A:** Skip parents with ids under `6.*` and skip all rollups for feature `appointment-workflow`
 * (see `shouldSkipDocRollupWaveA`).
 */

export const DOC_ROLLUP_KINDS = ['planning', 'log', 'handoff', 'guide'] as const;
