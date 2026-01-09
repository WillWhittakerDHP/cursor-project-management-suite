# TimeSlotGrid Component Enhancement and AvailabilityStep Refactoring

## Objectives

Enhance the TimeSlotGrid component and refactor AvailabilityStep to support:

1. Dynamic responsive layout that adapts to calendar widget space with vertical scrolling fallback
2. Time range display on buttons (start - end format)
3. Conditional display of Inspector/Client toggle based on service differential property
4. Time On-Site Graph (visual bars) showing differential arrival times when applicable
5. Client-side availability calculations from part instances (not backend API queries)
6. Database migration to add differential property to block_instances table

## Current State Analysis

- TimeSlotGrid component exists with ResizeObserver and dynamic column calculation
- AvailabilityStep uses TimeSlotGrid but displays single time values (e.g., "9:00 AM")
- Inspector/Client toggle always visible (should be conditional)
- Slider component exists but should be replaced with Time On-Site Graph bars
- Base services don't have `differential` property in database
- useAvailability currently queries backend API (should calculate from part instances)
- Time slots come from useAvailability composable with TimeSlot interface (slotStart, slotEnd, duration)

## Requirements

### 1. Time Slot Display Format

- Buttons must show time ranges: "X:XX AM - X:XX AM" format (e.g., "9:00 AM - 9:15 AM")
- Calculate from TimeSlot.slotStart and TimeSlot.slotEnd
- Format should be readable and consistent
- Buttons ordered vertically (top to bottom, left to right)

### 2. Responsive Layout Behavior

- **Normal state**: Calculate optimal columns based on available width (current behavior)
- **Narrow state**: When cannot fit 2 columns, switch to single column with vertical scrolling
- **Very narrow state**: When insufficient room even for single column, move grid to full-width new row below calendar widget

### 3. Time On-Site Graph (Replaces Slider)

- **When differential scheduling is TRUE**: Display two stacked horizontal bars
- Top bar: Full width, Inspector color, displays "Inspector: {onSiteTotal hh:mm}"
- Bottom bar: Right-justified, half width, Client color, displays "Client Formal Presentation: {presentationDuration hh:mm}"
- When time selected: Top bar shows "Inspector: {onSiteTimeBlock}", bottom bar shows "Client Formal Presentation: {presentationTimeBlock}"
- **When differential scheduling is FALSE**: Display single bar in Client colors showing "{Service} Length {onsiteTotal}"
- Only visible when service has differential scheduling enabled
- Calculate durations from part instances (onSiteTotal, presentationDuration)

### 4. Differential Scheduling Support

- Add `differential: boolean` column to `block_instances` table (database migration)
- Add `differential` property to BlockInstance model (server/src/db/models/booking/block_instance.ts)
- Propagate to BookingBlockInstance type (client-vue/src/utils/transformers/globalToBookingTransformer.ts)
- Inspector/Client toggle buttons only visible when `wizard.selectedBaseService.value?.differential === true`
- Time On-Site Graph only visible when differential is true
- Seed database: Set `differential = true` for "Buyer's Inspection" and "Investor's Inspection" services

### 5. Availability Calculations (Client-Side)

- **useAvailability should NOT query backend API**
- Calculate time slots client-side from part instances' baseTime values
- Use appointment duration calculated from selected service's partInstances
- Calculate inspector arrival times and client presentation times based on part instance durations
- For differential scheduling: Calculate inspector start time (earlier) and client start time (later) based on property details and part instance durations
- Generate available time slots based on calendar availability and calculated durations

### 6. Calendar Widget Space Calculation

- Measure available width dynamically using ResizeObserver (current approach)
- Calculate optimal columns based on actual measured space (not fixed breakpoints)
- Account for calendar widget taking up space in layout
- Calculate optimal columns until minimum 2 columns cannot fit, then switch to single column with vertical scroll

## Implementation Plan

### Phase 1: Database Migration and Model Updates

#### Task 1.1: Create Database Migration

**Goal:** Add `differential` column to `block_instances` table**Files:**

- `server/src/db/migrations/[timestamp]_add_differential_to_block_instances.mjs`

**Key Changes:**

- Add `differential` boolean column with default `false`
- Add NOT NULL constraint
- Update existing records (set to false initially)

**Implementation:**

```javascript
// Migration structure
export async function up(queryInterface, Sequelize) {
  await queryInterface.addColumn('block_instances', 'differential', {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'differential'
  });
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.removeColumn('block_instances', 'differential');
}
```



#### Task 1.2: Update BlockInstance Model

**Goal:** Add differential property to BlockInstance model**Files:**

- `server/src/db/models/booking/block_instance.ts`

**Key Changes:**

- Add `differential: boolean` property declaration
- Add field definition in model init

#### Task 1.3: Create Seeder for Differential Services

**Goal:** Set differential=true for Buyer's Inspection and Investor's Inspection**Files:**

- `server/src/db/seeders/[timestamp]_seed_differential_services.mjs`

**Key Changes:**

- Find services by name ("Buyer's Inspection", "Investor's Inspection")
- Update differential column to true

### Phase 2: Frontend Type Updates

#### Task 2.1: Update BookingBlockInstance Type

**Goal:** Add differential property to BookingBlockInstance type**Files:**

- `client-vue/src/utils/transformers/globalToBookingTransformer.ts`

**Key Changes:**

- Add `differential: boolean` to BookingBlockInstance type definition
- Ensure transformer includes differential property when transforming BlockInstance

### Phase 3: TimeSlotGrid Component Enhancements

#### Task 3.1: Add Time Range Display

**Goal:** Display time ranges instead of single times**Files:**

- `client-vue/src/components/booking/TimeSlotGrid.vue`

**Key Changes:**

- Update props to accept TimeSlot[] instead of string[]
- Create formatTimeRange() function to format slotStart and slotEnd
- Update button display to show range format

**Implementation:**

```typescript
function formatTimeRange(slot: TimeSlot): string {
  const start = new Date(slot.slotStart)
  const end = new Date(slot.slotEnd)
  // Format as "9:00 AM - 9:15 AM"
  return `${formatTime(start)} - ${formatTime(end)}`
}
```



#### Task 3.2: Implement Vertical Scrolling

**Goal:** Add vertical scrolling when space is limited**Files:**

- `client-vue/src/components/booking/TimeSlotGrid.vue`

**Key Changes:**

- Update buttonGridColumns computed to return 1 when < 2 columns can fit
- Add CSS for single-column layout with vertical scrolling
- Add max-height and overflow-y: auto when in single-column mode

**CSS:**

```scss
.time-slot-grid {
  // ... existing styles
  
  &.single-column {
    grid-template-columns: 1fr;
    max-height: 400px; // Adjust based on design
    overflow-y: auto;
    overflow-x: hidden;
  }
}
```



#### Task 3.3: Implement Full-Width Row Fallback

**Goal:** Move grid below calendar when space is insufficient**Files:**

- `client-vue/src/components/booking/steps/AvailabilityStep.vue`

**Key Changes:**

- Add computed property to detect when space is too narrow
- Conditionally render TimeSlotGrid in different VRow/VCol layout
- When very narrow, render grid in new row below calendar (full width)

### Phase 4: AvailabilityStep Refactoring

#### Task 4.1: Conditional Inspector/Client Toggle

**Goal:** Only show toggle when service.differential === true**Files:**

- `client-vue/src/components/booking/steps/AvailabilityStep.vue`

**Key Changes:**

- Add computed property: `isDifferentialService`
- Conditionally render toggle buttons based on isDifferentialService
- Default to 'inspector' mode when differential is false

#### Task 4.2: Replace Slider with Time On-Site Graph

**Goal:** Implement Time On-Site Graph bars as specified in USER_STORY.md**Files:**

- `client-vue/src/components/booking/steps/AvailabilityStep.vue`

**Key Changes:**

- Remove slider component
- Create TimeOnSiteGraph component or inline implementation
- Calculate onSiteTotal and presentationDuration from part instances
- Display bars conditionally based on differential and time selection
- Update bar text based on selected time slot

**Implementation:**

```typescript
// Calculate durations from part instances
const onSiteTotal = computed(() => {
  const service = wizard.selectedBaseService.value
  if (!service?.partInstances) return 0
  return service.partInstances
    .filter(pi => pi.onSite)
    .reduce((sum, pi) => sum + (pi.baseTime || 0), 0)
})

const presentationDuration = computed(() => {
  const service = wizard.selectedBaseService.value
  if (!service?.partInstances) return 0
  return service.partInstances
    .filter(pi => pi.clientPresent)
    .reduce((sum, pi) => sum + (pi.baseTime || 0), 0)
})
```



### Phase 5: Refactor useAvailability for Client-Side Calculations

**Status:** Moved to Session 1.3.7 (separate session due to complexity)

**Reason:** This refactoring is complex enough to warrant its own focused session with proper task breakdown, testing, and documentation. It represents a significant architectural change that should be handled carefully.

**See:** `project-manager/features/data-flow-alignment/sessions/session-1.3.7-guide.md` (to be created)

### Phase 6: Integration and Testing

#### Task 6.1: Update AvailabilityStep to Use New useAvailability

**Goal:** Integrate refactored useAvailability with AvailabilityStep**Files:**

- `client-vue/src/components/booking/steps/AvailabilityStep.vue`

**Key Changes:**

- Update useAvailability call to pass service and property details
- Handle loading states (may not be needed if calculations are synchronous)
- Update timeSlotsPerDay transformation to handle new TimeSlot format

#### Task 6.2: Update TimeSlotGrid Usage

**Goal:** Pass TimeSlot[] to TimeSlotGrid instead of string[]**Files:**

- `client-vue/src/components/booking/steps/AvailabilityStep.vue`

**Key Changes:**

- Update TimeSlotGrid props to accept slots: TimeSlot[]
- Update selectedSlot to be TimeSlot instead of string
- Update handleTimeSlotClick to work with TimeSlot objects

## Success Criteria

- ✅ TimeSlotGrid displays time ranges on buttons (not single times)
- ✅ Buttons ordered vertically (top to bottom, left to right)
- ✅ Component dynamically calculates columns based on available space
- ✅ Switches to single-column with vertical scrolling when 2 columns cannot fit
- ✅ Moves to full-width new row below calendar when space is insufficient
- ✅ Inspector/Client toggle only visible when service.differential === true
- ✅ Time On-Site Graph (bars) replaces slider, only visible when differential is true
- ✅ Time On-Site Graph displays correct inspector and client time blocks
- ✅ Database migration adds differential column to block_instances table
- ✅ BlockInstance model includes differential property
- ✅ BookingBlockInstance type includes differential property
**Note:** Client-side availability calculations moved to Session 1.3.7
- ✅ All responsive breakpoints work correctly
- ✅ Component maintains touch-friendly button sizing (44px minimum)

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] Differential property appears in BlockInstance model
- [ ] Seeder sets differential=true for correct services
- [ ] BookingBlockInstance includes differential property
- [ ] TimeSlotGrid displays time ranges correctly
- [ ] Vertical scrolling works in single-column mode
- [ ] Grid moves to new row when space is insufficient
- [ ] Inspector/Client toggle only shows for differential services
- [ ] Time On-Site Graph displays correctly for differential services
- [ ] Time On-Site Graph displays correctly for non-differential services
- [ ] useAvailability calculates slots without API calls
- [ ] Duration calculations use partInstances.baseTime correctly
- [ ] Differential scheduling calculations work correctly
- [ ] Responsive behavior works at various viewport sizes
- [ ] Touch targets remain 44px minimum on mobile

## Notes

- Calendar availability integration (Google Calendar API) is out of scope for this phase
- Currently using dummy data for calendar availability
- Property details (sqft, type) needed for differential calculations - may need to get from wizard state