---
name: ""
overview: ""
todos: []
isProject: false
---

# Coupon: same routine as property type + remove aberrant patterns + doc update

**Requirement:** Do it THE SAME as the property type select on step 2. Same routine. Same wiring. No simplified "shape-only" path.

---

## 1. Remove aberrant patterns (client)

- **[client/src/utils/blockInstanceUtils.ts](client/src/utils/blockInstanceUtils.ts):** Delete `getBlockShapeIdByName` and `getBlockInstancesForShapeName`. Keep only `getBlockShapeIdByType` and existing helpers.
- **[client/src/composables/booking/useWizardFilteredOptions.ts](client/src/composables/booking/useWizardFilteredOptions.ts):** Remove import and use of `getBlockInstancesForShapeName`. Do **not** replace with a direct shape-id filter; replace with `cascadeShapePipeline` (see below).

---

## 2. Server: add `coupon` block shape type

- **New migration:** `ALTER TYPE public.block_shape_type ADD VALUE IF NOT EXISTS 'coupon';`
- **[server/src/db/models/admin/block_shape.ts](server/src/db/models/admin/block_shape.ts):** Add `'coupon'` to the `type` union and to `DataTypes.ENUM(...)`.

---

## 3. Client: add COUPON type constant

- **[client/src/constants/blockShapeTypes.ts](client/src/constants/blockShapeTypes.ts):** Add `COUPON: 'coupon'` to `BLOCK_SHAPE_TYPES`.
- **[client/src/composables/admin/useSelectEnumOptions.ts](client/src/composables/admin/useSelectEnumOptions.ts):** Add `{ title: 'Coupon', value: BLOCK_SHAPE_TYPES.COUPON }` to the block shape type options.

---

## 4. Wire coupon THE SAME as property type (cascade + wizard state)

**Same routine = same pipeline + same state shape.**

### 4a. Wizard state and actions (same shape as property type)

- **[client/src/types/wizard.ts](client/src/types/wizard.ts):**
  - `WizardState`: add `selectedCouponBlocks: BookingBlockInstance[]` (array, same as selectedPropertyTypeBlocks).
  - `WizardSelectionMethods`: add `toggleCouponBlock: (block: BookingBlockInstance) => void`.
  - `WizardComputedProperties`: add `couponCascadeError: ComputedRef<string | null>` (same as propertyTypesCascadeError).
- **[client/src/composables/booking/useBookingWizard.ts](client/src/composables/booking/useBookingWizard.ts):**
  - Add `selectedCouponBlocks = ref<BookingBlockInstance[]>([])`.
  - Add `toggleCouponBlock(block)`: single-select semantics (same as property type UI): if already selected, clear; else set to `[block]`.
  - In `selectUserTypeBlock` and `toggleServiceTypeBlock` (when not _inBatch), clear `selectedCouponBlocks` so coupon selection is dependent on service selection, same as property type.
  - Pass `selectedCouponBlocks` into `useWizardFilteredOptions`.
  - Return `selectedCouponBlocks` in state and `toggleCouponBlock` in actions; add `couponCascadeError` and `availableCouponBlocks` from composable in computed.

### 4b. useWizardFilteredOptions: coupon via cascadeShapePipeline (same as property types)

- **[client/src/types/booking/wizardFilteredOptions.ts](client/src/types/booking/wizardFilteredOptions.ts):** Add `selectedCouponBlocks: Ref<BookingBlockInstance[]>` to params.
- **[client/src/composables/booking/useWizardFilteredOptions.ts](client/src/composables/booking/useWizardFilteredOptions.ts):**
  - Destructure `selectedCouponBlocks` from params.
  - Replace current `availableCouponBlocks` implementation with:

```ts
    const couponTypesResult = computed(() =>
      cascadeShapePipeline({
        bookingData: bookingData.value,
        parentInstances: selectedServiceTypeBlocks.value,
        currentSelection: selectedCouponBlocks.value,
        relationshipName: 'coupons',
        shapeType: BLOCK_SHAPE_TYPES.COUPON,
        allowFallbackToAllOfShape: false
      })
    )
    const availableCouponBlocks = computed(() => couponTypesResult.value.instances)
    const couponCascadeError = computed(() => couponTypesResult.value.error)
    

```

- Return `availableCouponBlocks` and `couponCascadeError` in the composable return.
- Remove any import of `getBlockInstancesForShapeName`.

### 4c. useBookingWizardSetup and provide

- **[client/src/composables/booking/useBookingWizardSetup.ts](client/src/composables/booking/useBookingWizardSetup.ts):** Ensure the flattened `wizard` object passed to `provide(wizardKey, wizard)` includes `selectedCouponBlocks`, `toggleCouponBlock`, `availableCouponBlocks`, `couponCascadeError` (they will if useBookingWizard returns them and setup spreads state, actions, computed).

### 4d. ConfirmationStep: bind to wizard state (same as property type on step 2)

- **[client/src/components/booking/steps/ConfirmationStep.vue](client/src/components/booking/steps/ConfirmationStep.vue):**
  - Remove local `selectedCouponId` ref.
  - Bind the Apply Coupon WizardSelect to:
    - `:items="wizard.availableCouponBlocks"`
    - Model: use wizard selection. For single-select, derive displayed value from `wizard.selectedCouponBlocks[0]?.id ?? null` and on update call `wizard.toggleCouponBlock(block)` or clear (same pattern as property type: selection is in wizard state).
  - So: `model-value` = first selected coupon block id (or null); `@update:model-value` = find block in availableCouponBlocks by id and call `wizard.toggleCouponBlock(block)` when selecting, or clear selection when clearing. Same usage pattern as PropertyDetailsSection with property type.

### 4e. Data collection / submission

- If **[client/src/utils/booking/appointmentDataCollection.ts](client/src/utils/booking/appointmentDataCollection.ts)** (or equivalent) collects wizard state for the appointment payload, add `selectedCouponBlocks` to the collected state so the chosen coupon can be sent if required. Match how `selectedPropertyTypeBlocks` is used.

---

## 5. Admin: booking cascades for coupons

- For the cascade to return coupon options, service block instances must have coupon block instances as allowed dependents (e.g. via `activeBlockIds` / bookingCascades). Document or configure so that the "Coupons" block shape (type COUPON) has block instances, and service block instances declare those coupon instances in their cascade config. Same as property types: parent (service) → valid children (coupon instances). No code change required in pipeline; config only.

---

## 6. Tests

- **useWizardFilteredOptions:** Add/update test for `availableCouponBlocks`: provide bookingData with a COUPON block shape and instances, and service block(s) with cascade to those instances; set selectedServiceTypeBlocks; assert availableCouponBlocks matches cascade result (same as property type tests). Remove any test that used `getBlockInstancesForShapeName` or name-based lookup.
- **blockInstanceUtils:** Remove tests for `getBlockShapeIdByName` / `getBlockInstancesForShapeName` if present.

---

## 7. Docs: same strategy and same routine

- **[.project-manager/features/appointment-workflow/sessions/session-6.10.1-guide.md](.project-manager/features/appointment-workflow/sessions/session-6.10.1-guide.md)** (Task 6.10.1.4):
  - State: Apply Coupon dropdown uses the **same routine** as the property type select on step 2: `cascadeShapePipeline` with `BLOCK_SHAPE_TYPES.COUPON`, `parentInstances: selectedServiceTypeBlocks`, `currentSelection: selectedCouponBlocks`, `relationshipName: 'coupons'`. Wizard state includes `selectedCouponBlocks` and `toggleCouponBlock`; step 5 binds WizardSelect to `wizard.availableCouponBlocks` and wizard selection. No name-based lookup; no separate shape-only path.
- **[.project-manager/features/appointment-workflow/sessions/task-6.10.1.4-planning.md](.project-manager/features/appointment-workflow/sessions/task-6.10.1.4-planning.md):**
  - Goal/Files/Approach: Same as above — same routine as property type (cascade pipeline + wizard state + WizardSelect binding). Explicitly say: "Same as property type select on step 2: cascadeShapePipeline, selectedCouponBlocks in wizard state, toggleCouponBlock, availableCouponBlocks and couponCascadeError from useWizardFilteredOptions."

---

## Summary


| Concern           | Property type (step 2)                                 | Coupon (step 5) — after this plan         |
| ----------------- | ------------------------------------------------------ | ----------------------------------------- |
| Shape type        | BLOCK_SHAPE_TYPES.PROPERTY                             | BLOCK_SHAPE_TYPES.COUPON                  |
| Pipeline          | cascadeShapePipeline                                   | cascadeShapePipeline                      |
| Parent instances  | selectedServiceTypeBlocks                              | selectedServiceTypeBlocks                 |
| Current selection | selectedPropertyTypeBlocks                             | selectedCouponBlocks                      |
| Relationship name | 'property types'                                       | 'coupons'                                 |
| Wizard state      | selectedPropertyTypeBlocks                             | selectedCouponBlocks                      |
| Wizard action     | togglePropertyTypeBlock                                | toggleCouponBlock                         |
| Computed          | availablePropertyTypeBlocks, propertyTypesCascadeError | availableCouponBlocks, couponCascadeError |
| UI                | WizardSelect, items + model from wizard                | WizardSelect, items + model from wizard   |


Same routine. Same wiring. Aberrant name-based helpers removed; docs updated to say the same strategy and same routine as property type was applied.