# Scheduling Logic Gap Analysis

## Overview
This document identifies missing calculations, incomplete implementations, and required new logic for Phase 6 integration. It serves as a roadmap for implementing the unified scheduling methodology.

---

## 1. Missing Calculations

### 1.1 Fee Calculation Implementation

**Status:** ⚠️ **NOT IMPLEMENTED**

**Gap:** Fee calculation exists only as:
- Commented code pattern in `appointmentTransformer.ts`
- USER_STORY specification
- No working implementation

**Required Implementation:**
```typescript
// Location: client-vue/src/utils/scheduler/calculations/feeCalculation.ts

export interface PartFeeInput {
  baseFee: number;
  rateOverBaseFee: number;
}

export function calculateFee(
  partProfiles: PartFeeInput[],
  sqft: number,
  increment: number = 15
): number {
  // Step 1: Add all bases
  const totalBaseFee = partProfiles.reduce(
    (sum, part) => sum + part.baseFee,
    0
  );
  
  // Step 2: Multiply all rates (compound)
  const combinedRate = partProfiles.reduce(
    (product, part) => product * part.rateOverBaseFee,
    1
  );
  
  // Step 3: Multiply rate by sqft
  const rateSqft = combinedRate * sqft;
  
  // Step 4: Add bases to rate*sqft
  const fee = totalBaseFee + rateSqft;
  
  // Step 5: Round up to nearest increment
  return Math.ceil(fee / increment) * increment;
}
```

**Dependencies:**
- Part profiles with `baseFee` and `rateOverBaseFee`
- Property square footage
- Configuration for increment (default 15)

**Priority:** 🔴 **HIGH** - Required for Phase 6 confirmation step

---

### 1.2 Time Calculation Rounding

**Status:** ⚠️ **PARTIALLY IMPLEMENTED**

**Gap:** React's `ProfileToFinalTimeUtils.calculateTime()` doesn't round to increments like Jose's approach.

**Current Implementation:**
```typescript
// No rounding - returns raw minutes
return partProfiles.reduce((totalTime, part) => {
  const overage = home_sq_ft > base_sq_ft 
    ? (home_sq_ft - base_sq_ft) * part.rateOverBaseTime 
    : 0;
  return totalTime + part.baseTime + overage;
}, 0);
```

**Required Enhancement:**
```typescript
// Add rounding support
export function calculateTime(
  home_sq_ft: number,
  partProfiles: Array<{ baseTime: number; rateOverBaseTime: number }>,
  base_sq_ft: number,
  increment: number = 30  // NEW: Add increment parameter
): number {
  const totalTime = partProfiles.reduce((totalTime, part) => {
    const overage = home_sq_ft > base_sq_ft 
      ? (home_sq_ft - base_sq_ft) * part.rateOverBaseTime 
      : 0;
    return totalTime + part.baseTime + overage;
  }, 0);
  
  // NEW: Round up to nearest increment
  return Math.ceil(totalTime / increment) * increment;
}
```

**Priority:** 🟡 **MEDIUM** - Needed for consistency with Jose's UX

---

### 1.3 Per-Part Base SqFt Support

**Status:** ⚠️ **NOT SUPPORTED**

**Gap:** Current implementation uses single `base_sq_ft` for all parts, but block profiles have `baseSqFt` that should be used per block.

**Current Limitation:**
- `calculateTime()` takes single `base_sq_ft` parameter
- All parts use same base threshold

**Required Enhancement:**
```typescript
// Support per-block baseSqFt
export function calculateTimeWithBlockBase(
  home_sq_ft: number,
  blockProfiles: Array<{
    baseSqFt: number;
    partProfiles: Array<{ baseTime: number; rateOverBaseTime: number }>;
  }>
): number {
  return blockProfiles.reduce((totalTime, block) => {
    const blockTime = block.partProfiles.reduce((blockTotal, part) => {
      const overage = home_sq_ft > block.baseSqFt
        ? (home_sq_ft - block.baseSqFt) * part.rateOverBaseTime
        : 0;
      return blockTotal + part.baseTime + overage;
    }, 0);
    return totalTime + blockTime;
  }, 0);
}
```

**Priority:** 🟡 **MEDIUM** - Improves accuracy, but current approach works

---

## 2. Incomplete Implementations

### 2.1 Server Availability Pipeline - Stubbed Filters

**Status:** ⚠️ **PARTIALLY IMPLEMENTED**

**Location:** `server/src/utils/newMakeAvailabilties.ts`

**Gap 1: `fetchAvailableDays()`**
```typescript
// Currently returns hardcoded values
async function fetchAvailableDays(serviceId: string): Promise<number[]> {
  console.log(`Fetching available days for serviceId: ${serviceId}`);
  return [1, 2, 3, 4, 5]; // Example: Monday to Friday
}
```

**Required Implementation:**
```typescript
async function fetchAvailableDays(serviceId: string): Promise<number[]> {
  // Query database for service configuration
  const service = await Service.findById(serviceId);
  return service?.availableDays || [1, 2, 3, 4, 5]; // Default to weekdays
}
```

**Gap 2: `sumWorkHoursForDay()`**
```typescript
// Currently returns 0
function sumWorkHoursForDay(dayIndex: number): number {
  console.log(`Summing work hours for dayIndex: ${dayIndex}`);
  return 0; // Example: No work hours for now
}
```

**Required Implementation:**
```typescript
async function sumWorkHoursForDay(
  dayIndex: number,
  date: Date
): Promise<number> {
  // Query database for appointments on this day
  const startOfDay = startOfDay(date);
  const endOfDay = endOfDay(date);
  
  const appointments = await Appointment.find({
    start: { $gte: startOfDay, $lte: endOfDay },
    status: 'confirmed'
  });
  
  return appointments.reduce((total, apt) => {
    const duration = differenceInMinutes(apt.end, apt.start);
    return total + duration;
  }, 0) / 60; // Convert to hours
}
```

**Priority:** 🟡 **MEDIUM** - Needed for accurate filtering

---

### 2.2 Drive Time Filtering Integration

**Status:** ⚠️ **EXISTS BUT NOT INTEGRATED**

**Location:** 
- `server/src/utils/availabilities/filterByDriveTimes.ts` (commented out)
- `server/src/routes/external/googleFetchRoutes.ts` (functional)

**Gap:** Drive time filtering exists but is not integrated into main availability pipeline.

**Current State:**
- `fetchDriveTimes()` function works and has caching
- `filterByDriveTime()` function exists but is commented out
- Not called in `makeAvailabilities()`

**Required Integration:**
```typescript
// In makeAvailabilities()
// After filtering by free hours, add drive time filtering:

// 6. Filter by drive times
const destinations: Destination[] = mergedBusy.map((busy) => ({
  location: getLocationFromBusyPeriod(busy), // Extract location from busy period
}));

freeTimes = await filterByDriveTime(
  freeTimes,
  mergedBusy,
  destinations,
  adminSettings.minuteIncrement,
  fetchDriveTimes
);
```

**Priority:** 🟢 **LOW** - Nice to have, not critical for Phase 6

---

### 2.3 Differential Scheduling in Server Pipeline

**Status:** ⚠️ **NOT IMPLEMENTED**

**Gap:** Server pipeline generates inspector slots but doesn't calculate client slots for differential scheduling.

**Current State:**
- Jose's client-side approach has differential scheduling
- Server pipeline only generates inspector slots

**Required Implementation:**
```typescript
// Add to makeAvailabilities() or create new function
function addDifferentialScheduling(
  inspectorSlots: TimeSlot[],
  differentialSettings: {
    dataCollectionMinutes: number;
    reportWritingMinutes: number;
    clientPresentationMinutes: number;
  },
  workingHours: { start: Date; end: Date }
): Array<{ inspectorSlot: TimeSlot; clientSlot: TimeSlot }> {
  return inspectorSlots
    .map(slot => {
      const clientStart = addMinutes(
        slot.slotStart,
        differentialSettings.dataCollectionMinutes + 
        differentialSettings.reportWritingMinutes
      );
      const clientEnd = addMinutes(
        clientStart,
        differentialSettings.clientPresentationMinutes
      );
      
      return {
        inspectorSlot: slot,
        clientSlot: new TimeSlot(
          differentialSettings.clientPresentationMinutes,
          clientStart,
          clientEnd
        )
      };
    })
    .filter(({ clientSlot }) => 
      isWithinInterval(clientSlot.slotEnd, {
        start: workingHours.start,
        end: workingHours.end
      })
    );
}
```

**Priority:** 🔴 **HIGH** - Required for Phase 6 differential scheduling

---

## 3. Data Source Gaps

### 3.1 Jose's Hardcoded PartTypeMap Migration

**Status:** ⚠️ **NEEDS MIGRATION**

**Gap:** Jose's wizard uses hardcoded `PartTypeMap` configuration, but we want database-driven approach.

**Current State:**
- Jose's code: Hardcoded map in `constants/Appointment.js`
- Our approach: Database part profiles

**Options:**
1. **Migrate to Database:** Create seed data matching Jose's PartTypeMap
2. **Hybrid:** Use database but fallback to hardcoded if not found
3. **Keep Hardcoded:** Use Jose's map for wizard, database for admin

**Recommendation:** Option 1 - Migrate to database for consistency

**Required Work:**
- Create seed script to populate part profiles matching Jose's configs
- Update wizard to use database part profiles
- Remove hardcoded PartTypeMap dependency

**Priority:** 🟡 **MEDIUM** - Needed for consistency, but current approach works

---

### 3.2 Mock Appointment Data Replacement

**Status:** ⚠️ **USES MOCK DATA**

**Location:** `Jose-Scheduler-Reference/src/utils/getTimeSlots.js`

**Gap:** Jose's `getTimeSlots()` uses hardcoded mock appointments for conflict checking.

**Current Code:**
```javascript
const getMockAppointmentIntervals = date => {
  return [
    getMockAppointment(date, 14) // Hardcoded 2pm appointment
  ]
}
```

**Required:** Replace with real calendar data or server API call.

**Priority:** 🔴 **HIGH** - Required for Phase 6 (will use server pipeline instead)

---

## 4. Missing Utility Functions

### 4.1 Unified Calculation Utilities

**Status:** ⚠️ **NOT CREATED**

**Gap:** No unified utility module for calculations.

**Required Structure:**
```
client-vue/src/utils/scheduler/calculations/
  ├─> timeCalculation.ts
  ├─> feeCalculation.ts
  ├─> availabilityUtils.ts
  └─> types.ts
```

**Required Functions:**

**timeCalculation.ts:**
- `calculatePartTime()`
- `calculateTotalTime()`
- `calculateTimeOverage()`
- `roundToIncrement()`

**feeCalculation.ts:**
- `calculateFee()`
- `calculateBaseFeeTotal()`
- `calculateCombinedRate()`

**availabilityUtils.ts:**
- `formatTimeSlot()`
- `isWithinWorkingHours()`
- `calculateClientSlot()`

**Priority:** 🔴 **HIGH** - Foundation for Phase 6

---

### 4.2 Type Definitions

**Status:** ⚠️ **INCOMPLETE**

**Gap:** Missing comprehensive type definitions for calculations.

**Required Types:**
```typescript
// types.ts
export interface PartTimeInput {
  baseTime: number;
  rateOverBaseTime: number;
}

export interface PartFeeInput {
  baseFee: number;
  rateOverBaseFee: number;
}

export interface TimeCalculationResult {
  totalTime: number;
  timeOverage: number;
  partTimes: Array<{ partId: string; time: number }>;
}

export interface FeeCalculationResult {
  totalFee: number;
  baseFeeTotal: number;
  rateSqft: number;
  breakdown: Array<{ partId: string; baseFee: number; rateFee: number }>;
}

export interface DifferentialSlot {
  inspectorSlot: TimeSlot;
  clientSlot: TimeSlot;
}
```

**Priority:** 🟡 **MEDIUM** - Needed for type safety

---

## 5. Integration Gaps

### 5.1 Vue Component Integration

**Status:** ⚠️ **NOT INTEGRATED**

**Gap:** Calculation utilities not integrated into Vue wizard components.

**Required Integration Points:**

1. **ServiceSelectionStep.vue:**
   - Track selected blocks
   - Store in wizard state

2. **PropertyDetailsStep.vue:**
   - Collect square footage
   - Store in wizard state

3. **AvailabilityStep.vue:**
   - Call server API for availability
   - Display inspector + client slots
   - Handle slot selection

4. **ConfirmationStep.vue:**
   - Calculate total time
   - Calculate total fee
   - Display breakdown
   - Show selected slot details

**Priority:** 🔴 **HIGH** - Required for Phase 6

---

### 5.2 Server API Endpoints

**Status:** ⚠️ **INCOMPLETE**

**Gap:** Missing or incomplete API endpoints for availability with differential scheduling.

**Required Endpoints:**

1. **GET /api/availabilities**
   - Parameters: date, duration, serviceId, propertySqft
   - Returns: Array of differential slots (inspector + client)

2. **POST /api/appointments** (if not exists)
   - Create appointment with differential scheduling
   - Store inspector and client times

**Priority:** 🔴 **HIGH** - Required for Phase 6

---

## 6. Testing Gaps

### 6.1 Unit Tests

**Status:** ⚠️ **NOT CREATED**

**Gap:** No unit tests for calculation utilities.

**Required Tests:**

**Time Calculation:**
- Single part calculation
- Multiple part aggregation
- Rounding behavior
- Edge cases (zero sqft, negative, etc.)

**Fee Calculation:**
- Base fee aggregation
- Rate multiplication
- Sqft application
- Rounding behavior
- Edge cases

**Priority:** 🟡 **MEDIUM** - Important for reliability

---

### 6.2 Integration Tests

**Status:** ⚠️ **NOT CREATED**

**Gap:** No integration tests for calculation flow.

**Required Tests:**
- Complete wizard flow
- Server API integration
- Data transformation pipeline
- End-to-end booking flow

**Priority:** 🟡 **MEDIUM** - Important for reliability

---

## 7. Documentation Gaps

### 7.1 Code Documentation

**Status:** ⚠️ **INCOMPLETE**

**Gap:** Missing JSDoc comments and examples.

**Required:**
- JSDoc for all public functions
- Parameter descriptions
- Return value descriptions
- Usage examples
- Edge case notes

**Priority:** 🟢 **LOW** - Nice to have

---

### 7.2 User-Facing Documentation

**Status:** ⚠️ **NOT CREATED**

**Gap:** No explanation of differential scheduling for users.

**Required:**
- Explanation of why inspector and client times differ
- How time is calculated
- How fees are calculated
- What to expect in confirmation

**Priority:** 🟢 **LOW** - Can be added later

---

## 8. Priority Summary

### 🔴 High Priority (Phase 6 Critical)

1. **Fee Calculation Implementation** - Required for confirmation step
2. **Differential Scheduling in Server Pipeline** - Core feature
3. **Vue Component Integration** - Required for wizard functionality
4. **Server API Endpoints** - Required for data flow
5. **Unified Calculation Utilities** - Foundation for everything

### 🟡 Medium Priority (Phase 6 Enhancement)

6. **Time Calculation Rounding** - Consistency with Jose's UX
7. **Stubbed Filter Completion** - Accuracy improvements
8. **Per-Part Base SqFt Support** - Accuracy improvements
9. **PartTypeMap Migration** - Consistency
10. **Unit Tests** - Reliability

### 🟢 Low Priority (Future)

11. **Drive Time Integration** - Nice to have
12. **Integration Tests** - Important but not blocking
13. **Documentation** - Can be added incrementally

---

## 9. Implementation Roadmap

### Phase 6.1: Foundation (Week 1)
- ✅ Create unified calculation utilities
- ✅ Implement fee calculation
- ✅ Add rounding to time calculation
- ✅ Create type definitions
- ✅ Write unit tests

### Phase 6.2: Server Enhancements (Week 1-2)
- ✅ Add differential scheduling to server pipeline
- ✅ Complete stubbed filters
- ✅ Create/update API endpoints
- ✅ Integration tests

### Phase 6.3: Vue Integration (Week 2)
- ✅ Integrate calculations into wizard components
- ✅ Connect to server API
- ✅ Display calculations in confirmation step
- ✅ End-to-end testing

### Phase 6.4: Polish (Week 2-3)
- ✅ Replace mock data
- ✅ Error handling
- ✅ Loading states
- ✅ User documentation

---

## 10. Risk Assessment

### High Risk Items

1. **Fee Calculation Spec Clarification**
   - Risk: USER_STORY spec differs from commented pattern
   - Mitigation: Confirm with business before implementation

2. **Differential Scheduling Complexity**
   - Risk: Complex logic, potential edge cases
   - Mitigation: Thorough testing, incremental implementation

3. **Data Source Migration**
   - Risk: Breaking changes when moving from hardcoded to database
   - Mitigation: Gradual migration, fallback support

### Medium Risk Items

4. **Server Pipeline Performance**
   - Risk: Multiple filtering stages may be slow
   - Mitigation: Caching, optimization, monitoring

5. **Timezone Handling**
   - Risk: Complex timezone conversions
   - Mitigation: Use proven libraries (date-fns-tz), thorough testing

---

## 11. Dependencies

### External Dependencies
- ✅ date-fns (already in use)
- ✅ date-fns-tz (already in use)
- ✅ Google Calendar API (already integrated)
- ✅ Google Maps API (already integrated)

### Internal Dependencies
- ✅ GlobalContext (data source)
- ✅ SchedulerTransformer (data transformation)
- ✅ Database models (part profiles, block profiles)
- ⚠️ Service configuration (needs database schema)

---

## 12. Success Metrics

### Functional Metrics
- ✅ All calculations produce expected results
- ✅ Differential scheduling works correctly
- ✅ All filters function properly
- ✅ Real data integration works

### Performance Metrics
- ✅ Calculations complete in < 100ms
- ✅ API responses in < 500ms
- ✅ No memory leaks

### Quality Metrics
- ✅ Test coverage > 80%
- ✅ No critical bugs
- ✅ Code follows patterns

---

## 13. Next Steps

1. **Review and Approve:** Review this gap analysis with team
2. **Prioritize:** Confirm priority rankings
3. **Clarify Specs:** Confirm fee calculation formula with business
4. **Create Tasks:** Break down into actionable tasks
5. **Begin Implementation:** Start with high-priority items

---

## 14. References

- `SCHEDULING_LOGIC_INVENTORY.md` - Complete logic catalog
- `CALCULATION_COMPARISON.md` - Detailed comparisons
- `SCHEDULING_METHODOLOGY.md` - Unified patterns
- `USER_STORY.md` - Business requirements

