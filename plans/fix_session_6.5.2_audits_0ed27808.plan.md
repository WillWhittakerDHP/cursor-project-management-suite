---
name: Fix session 6.5.2 audits
overview: Address session 6.5.2 audit failures: Vue-architecture (3 admin panels), tier-quality (composables-logic and composable-health). Docs (Part 3) omitted per user request.
todos:
  - id: vue-capacity
    content: Add useCapacityConstraintsHandlers; thin CapacityConstraintsPanel
  - id: vue-grid
    content: Add useGridConfigHandlers; thin GridConfigPanel
  - id: vue-property-form
    content: Add usePropertyCreateForm; thin PropertyCreateForm
  - id: tier-composables-logic
    content: Reduce useFieldContextState complexity below 20
  - id: tier-return-types
    content: Add explicit return types to useInstancesTab and useShapesTab
  - id: tier-provide
    content: Use InjectionKey for loadedWizardState in useBookingWizardSetup
  - id: tier-oversized
    content: Address oversized-return / useFormFields per audit
  - id: verify
    content: Re-run session audit, vue-tsc, lint
---

# Fix All Session 6.5.2 Audit Findings

Execution order: **Vue architecture** first, then **tier-quality**. **Docs (Part 3) omitted** per user request. No changes to audit scripts or thresholds.

---

## Part 1: Vue-architecture (3 components)

All three components are flagged for "many local functions"; extract handlers into composables so the SFC script holds only inject/setup and template bindings. New composables live under [client/src/composables/admin/](client/src/composables/admin/). Each composable must have an **explicit return type** (interface in [client/src/types/admin/](client/src/types/admin/) or co-located).

### 1.1 CapacityConstraintsPanel.vue (14 handlers)

- **Current:** [client/src/views/admin/tabs/components/CapacityConstraintsPanel.vue](client/src/views/admin/tabs/components/CapacityConstraintsPanel.vue) — injects `BUSINESS_CONTROLS_STATE_KEY`, defines 14 one-liner handlers that assign into `state.capacity.maxWorkHours` or `state.capacity.maxIncome`.
- **Add:** `client/src/composables/admin/useCapacityConstraintsHandlers.ts`
  - **Input:** state (typed as the shape provided by `BUSINESS_CONTROLS_STATE_KEY`: at least `{ capacity: { maxWorkHours: T; maxIncome: T } }` with the known field shapes).
  - **Logic:** Return an object of 14 handler functions (e.g. `handleMaxWorkHoursDayMaxHours`, `handleMaxWorkHoursDayEnforcement`, …) that perform the same assignments. No business logic beyond assignment/coercion (`Number(v)` where needed).
  - **Return type:** Explicit interface (e.g. `UseCapacityConstraintsHandlersReturn`) listing all 14 handler signatures.
- **Update panel:** Inject state, call `useCapacityConstraintsHandlers(state)`, destructure and bind in template; remove the 14 local functions.

### 1.2 GridConfigPanel.vue (9 handlers)

- **Current:** [client/src/views/admin/tabs/components/GridConfigPanel.vue](client/src/views/admin/tabs/components/GridConfigPanel.vue) — injects same key; 9 handlers (one calls `formState.setMinuteIncrement(Number(v))`, rest assign to `differential.*`).
- **Add:** `client/src/composables/admin/useGridConfigHandlers.ts`
  - **Input:** state (shape with `formState` and `differential`).
  - **Logic:** Return 9 handlers (e.g. `handleMinuteIncrement`, `handleMajorAttendees`, `handleMinorAttendees`, `handleMajorLabel`, `handleMinorLabel`, `handleDifferentialGraphDefaultLabel`, `handleMoveableFallbackLabel`, `handleMajorStateLabel`, `handleMinorStateLabel`).
  - **Return type:** Explicit interface.
- **Update panel:** Same pattern — inject, use composable, bind; remove 9 local functions.

### 1.3 PropertyCreateForm.vue (11 setters)

- **Current:** [client/src/views/admin/tabs/components/PropertyCreateForm.vue](client/src/views/admin/tabs/components/PropertyCreateForm.vue) — receives `newProperty: Ref<PropertyRequest | Partial<PropertyRequest>>`; 11 setters + 11 computeds that read from `props.newProperty?.value`.
- **Add:** `client/src/composables/admin/usePropertyCreateForm.ts`
  - **Input:** `newProperty: Ref<PropertyRequest | Partial<PropertyRequest>>`.
  - **Logic:** Same computeds (address, unit, city, state, zipCode, squareFootage, mlsNumber, bedrooms, bathrooms, foundationAccess, additionalUnits) and same 11 setter functions (guarded `if (newProperty?.value) newProperty.value.x = ...`). Coerce numbers and foundationAccess as today.
  - **Return type:** Explicit interface (all computeds + setters).
- **Update component:** Pass `props.newProperty` into composable; template binds to composable return; remove local functions and computeds from SFC.

**Verification:** Run the vue-architecture audit and confirm the three files no longer report "many local functions."

---

## Part 2: Tier-quality

### 2.1 Composables-logic (1 file, score 20 → below 20)

- **File:** [client/src/composables/fieldContext/useFieldContextState.ts](client/src/composables/fieldContext/useFieldContextState.ts) — complexity score 20; suggestion: separate query/mutations from derived state and formatting.
- **Action:** Extract a small piece so the main file’s score drops (e.g. move entity/metadata derivations into a helper or small composable; or move the `components.map((ea) => ea.childId)` and related derived state into a pure helper).
- **Verification:** Re-run composables-logic audit; confirm this file is no longer "requiring review."

### 2.2 Composable-health — explicit return types (wave 1)

- **useInstancesTab:** Add explicit return type (interface matching current 17 properties).
- **useShapesTab:** Add explicit return type (interface matching current return shape).

### 2.3 Composable-health — untyped provide (wave 1)

- **useBookingWizardSetup:** Replace `provide('loadedWizardState', ...)` with an `InjectionKey` and use it for provide/inject.

### 2.4 Composable-health — oversized-return and excessive-imports

- **Oversized-return:** Allowlist or decompose as needed so session audit passes.
- **useFormFields (wave 3):** Document consumers and approach; no isolated change.

**Verification:** Re-run composable-health audit; confirm missing-return-type and untyped-provide cleared.

---

## Part 4: Final verification

1. Run the full session-tier audit for 6.5.2; confirm tier-quality and vue-architecture pass (docs may still warn; Part 3 omitted).
2. Run `cd client && npx vue-tsc --noEmit` and `npm run lint`; fix any regressions.

---

## Summary table

| Part | Target | Main change |
|------|--------|-------------|
| 1.1 | CapacityConstraintsPanel | Add useCapacityConstraintsHandlers; panel calls it, removes 14 local functions |
| 1.2 | GridConfigPanel | Add useGridConfigHandlers; panel calls it, removes 9 local functions |
| 1.3 | PropertyCreateForm | Add usePropertyCreateForm; form calls it, removes 11 setters + 11 computeds from SFC |
| 2.1 | useFieldContextState | Extract small composable/helper to reduce complexity below 20 |
| 2.2 | useInstancesTab, useShapesTab | Add explicit return type to both |
| 2.3 | useBookingWizardSetup | Replace string provide with InjectionKey for loadedWizardState |
| 2.4 | Oversized-return / useFormFields | Allowlist or decompose; document useFormFields consumers |

**Omitted:** Part 3 (Docs — Learning Goals in session-6.5.2-guide.md).
