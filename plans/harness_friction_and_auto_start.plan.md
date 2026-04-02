---
name: Harness friction + auto-start
overview: "Auto-start on app_not_running; plugin-advisory gate; verbose output caps; phase 6.16 audit_failed fixed by clearing unused-code-audit (root cause documented in §B3); optional composable split; handoff Next Action."
todos:
  - id: verify-app-auto-start
    content: "verify-app auto-start (`npm run start:dev`, poll, timeout); wire tier-start + tier-end; optional HARNESS_AUTO_START_DEV; document."
    status: pending
  - id: gate-plugin-advisory
    content: "Push gate / recordHarnessPluginAdvisoryFriction per plan (B1)."
    status: pending
  - id: truncate-start-ok-output
    content: "Cap verbose tier/task success output (B2)."
    status: pending
  - id: fix-phase-616-unused-code
    content: "Resolve 10 unused-code issues in 7 files (P1 csrfTokens.ts first); refresh client/.audit-reports; re-run phase-end — see §B3."
    status: pending
  - id: handoff-next-action
    content: "[Next Action] on feature-appointment-workflow-handoff.md"
    status: pending
isProject: false
---

# Harness friction fixes + auto-start on `app_not_running`

## Scope

Merges ideas from [harness-repair-plan.md](.project-manager/features/appointment-workflow/harness-repair-plan.md) with **automatic dev startup** when the app check fails, plus **concrete build work** for recurring phase **6.16** `audit_failed`.

**Locked:** Auto-start uses **`npm run start:dev`** (repo root) so [verify-app.ts](.cursor/commands/utils/verify-app.ts) passes both ports **3001** and **3002**.

---

## Part A — Auto-start when `app_not_running`

### Current behavior

- [tier-start.ts](.cursor/commands/tiers/shared/tier-start.ts) and [tier-end.ts](.cursor/commands/tiers/shared/tier-end.ts) call [verifyApp()](.cursor/commands/utils/verify-app.ts) when `preflight.ensureAppRunning` (e.g. [session.ts](.cursor/commands/tiers/configs/session.ts)).
- [verify-app.ts](.cursor/commands/utils/verify-app.ts) is check-only (no spawn).

### Desired behavior

1. TCP check both ports → success if up.
2. Else spawn `npm run start:dev` from project root; poll `checkAppRunning()` with timeout.
3. Still down → same `app_not_running` failure (optionally note auto-start was attempted).

### Implementation sketch

- `verifyAppWithAutoStart` or extend `verifyApp` in [.cursor/commands/utils/verify-app.ts](.cursor/commands/utils/verify-app.ts); `spawn('npm', ['run', 'start:dev'], { cwd: PROJECT_ROOT, detached: true, stdio: 'ignore' })`; cap wait (e.g. 60–120s).
- Wire [tier-start.ts](.cursor/commands/tiers/shared/tier-start.ts) + [tier-end.ts](.cursor/commands/tiers/shared/tier-end.ts).
- Optional: `HARNESS_AUTO_START_DEV`; document in [HARNESS_CHARTER.md](.project-manager/HARNESS_CHARTER.md).

### Risks

- `start-dev.mjs` may clear busy ports; detached server survives harness exit.

---

## Part B — Friction log / push gate / audits

### B1 — Plugin advisory (20 open rows)

- [recordHarnessPluginAdvisoryFriction](.cursor/commands/utils/workflow-friction-log.ts) / [hasOpenWorkflowFrictionEntries](.cursor/commands/utils/read-workflow-friction.ts): gate filter and/or verbose-only logging (see main plan §1).

### B2 — Verbose `output` on `start_ok`

- Cap success-path `output` in tier/task orchestration.

### B3 — Phase 6.16 recurring `audit_failed` — **build plan (investigated)**

**Root cause:** Not typecheck/loop-mutations. **2026-04-01** [phase-6.16-audit.md](.cursor/project-manager/features/appointment-workflow/audits/phase-6.16-audit.md) shows **tier-quality WARN (88/100)** from **[unused-code-audit](client/.audit-reports/unused-code-audit.json)** — P0/P1 unused code (**10 issues, 7 files**). Phase-end maps that WARN to **`audit_failed`**.

**Recurrence:** Reappears whenever unused-code-audit still has those warnings at phase-end.

**Build steps:**

1. Follow [client/.audit-reports/unused-code-audit.md](client/.audit-reports/unused-code-audit.md) (source: `client/.scripts/unused-code-audit.mjs`).
2. **P1:** [server/src/middlewares/csrfTokens.ts](server/src/middlewares/csrfTokens.ts) — `CSRF_SECRET_COOKIE`, `ensureCsrfSecretCookie`, `verifyCsrfToken`.
3. **P2:** [client/src/stores/authStore.ts](client/src/stores/authStore.ts), [ternaryUtils.ts](client/src/utils/ternary/ternaryUtils.ts), [colorMath.ts](client/src/utils/theme/colorMath.ts), [ownershipChecks.ts](server/src/middlewares/ownershipChecks.ts), [propertyMappingSchemas.ts](server/src/routes/schemas/propertyMappingSchemas.ts), [sendGmailRawMessage.ts](server/src/services/google/gmail/sendGmailRawMessage.ts) — wire, remove exports, or allowlist with justification.
4. Refresh `client/.audit-reports/`; confirm tier-quality no longer WARNs on unused-code.
5. Re-run phase-end for **6.16**; expect **tier-quality PASS** or acceptable state.

**Optional:** Charter change: tier-quality WARN does not emit `audit_failed` (product decision).

### B4 — Handoff

- Add `[Next Action]` to [feature-appointment-workflow-handoff.md](.project-manager/features/appointment-workflow/feature-appointment-workflow-handoff.md).

### B5 — Optional composable

- Narrow [useAdminEntityDeleteWizard.ts](client/src/composables/admin/useAdminEntityDeleteWizard.ts) return surface.

---

## Suggested implementation order

1. **Part A** — auto-start.
2. **B1** — plugin-advisory gate.
3. **B2** — verbose output.
4. **B3** — unused-code cleanup (stops **audit_failed** recurrence for 6.16).
5. **B4** / **B5** as needed.

---

Canonical extended spec (friction table, §0–§6 detail): [harness_friction_fixes_25b900d1.plan.md](/Users/districthomepro/.cursor/plans/harness_friction_fixes_25b900d1.plan.md) (user home) or keep this file as workspace summary.
