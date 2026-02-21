# Session 2.2.6: Constraint Attribution & Admin Performance

## Decision: Preserve Current Implementation

**When handoff conflicts with current codebase, default to current (better) version.**

- **Direct overlap:** Keep `overlap.event.direct` / `overlap.outOfOffice.direct` (do NOT change to `overlap.appointment.direct`)
- **Drive buffers:** Keep `overlap.driveToCandidate.buffer:{minutes}` / `overlap.driveFromCandidate.buffer:{minutes}` (correct terminology)
- **No aliases** for `driveTimeTo`/`driveTimeFrom` — fix any incorrect usage to `driveToCandidate`/`driveFromCandidate`

---

## Current State

### Already Implemented (Tasks 2.2.6.3–2.2.6.5 Complete)

| Task | Status | Location |
|------|--------|----------|
| Conditional loading | Done | [`useAvailabilitySettings.ts`](frontend-root/src/composables/admin/useAvailabilitySettings.ts) – `enabled` option, watch |
| Provide currentTab | Done | [`AdminPanel.vue`](frontend-root/src/views/admin/AdminPanel.vue) – `provide('adminCurrentTab', currentTab)` |
| BusinessControlsTab conditional | Done | [`BusinessControlsTab.vue`](frontend-root/src/views/admin/tabs/BusinessControlsTab.vue) – inject, `enabled: isTabActive` |

### Violation Display Already Correct

- [`constraintColors.ts`](frontend-root/src/utils/booking/constraintColors.ts): `getColorForViolation()` strips `:minutes`, `formatViolationTooltip()` parses buffer minutes, `nameMap` uses `driveToCandidate`/`driveFromCandidate`
- [`AppointmentSlotGrid.vue`](frontend-root/src/components/booking/AppointmentSlotGrid.vue): Displays violations using constraintColors (no separate SlotConstraintOverlay)

### No Server Changes

- [`slotComputationService.ts`](server/src/services/slotComputationService.ts): Keep current attribution (`event`/`outOfOffice` for direct; `driveToCandidate`/`driveFromCandidate` for buffers)

---

## Scope: Documentation Fixes Only

### 1. Update Session Handoff ([`session-2.2.6-handoff.md`](.project-manager/features/feature-2-google-apis-integration/sessions/session-2.2.6-handoff.md))

Replace incorrect violation format examples:

| Wrong (handoff) | Correct |
|-----------------|---------|
| `overlap.driveTimeTo.buffer:20` | `overlap.driveToCandidate.buffer:20` |
| `overlap.driveTimeFrom.buffer:{minutes}` | `overlap.driveFromCandidate.buffer:{minutes}` |
| "DriveTimeTo buffer (20 min)" | "Drive To Appointment buffer (20 min)" |

Update Violation Attribution Rules diagram to use `driveToCandidate`/`driveFromCandidate`.

### 2. Update Session Guide ([`session-2.2.6-guide.md`](.project-manager/features/feature-2-google-apis-integration/sessions/session-2.2.6-guide.md))

- Task 2.2.6.2: Change "DriveTimeTo buffer (20 min)" → "Drive To Appointment buffer (20 min)" in display examples
- Remove/update references to `SlotConstraintOverlay.vue` (display is in AppointmentSlotGrid)
- Mark Tasks 2.2.6.3, 2.2.6.4, 2.2.6.5 complete

### 3. Mark Session Complete

- Update session handoff status to reflect implementation
- Run session-end checklist: app start, lint, session log, handoff

---

## Files to Modify

| File | Change |
|------|--------|
| `.project-manager/.../session-2.2.6-handoff.md` | Fix violation format examples, diagram, terminology |
| `.project-manager/.../session-2.2.6-guide.md` | Fix tooltip example, mark admin tasks complete |

---

## Out of Scope (No Changes)

- Server `slotComputationService.ts` – keep current attribution
- Client `constraintColors.ts` – already correct
- Client `AppointmentSlotGrid.vue` – already correct
- Admin performance code – already implemented
