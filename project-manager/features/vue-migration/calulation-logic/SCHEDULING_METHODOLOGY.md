# Scheduling Methodology

## Overview
This document establishes unified calculation patterns, data flow, and integration approach for Phase 6. It defines standard methodologies for time calculations, fee calculations, and availability generation based on the audit and comparison of existing logic.

---

## 1. Unified Calculation Patterns

### 1.1 Time Calculation Pattern

**Principle:** Calculate time based on part profiles, square footage, and base thresholds, with configurable rounding.

**Standard Function Signature:**
```typescript
function calculatePartTime(
  sqft: number,
  partProfile: {
    baseTime: number;        // Base time in minutes
    rateOverBaseTime: number; // Minutes per sqft over base
  },
  baseSqFt: number,         // Base square footage threshold
  increment?: number         // Rounding increment (default: 30)
): number
```

**Calculation Steps:**
1. Calculate overage: `max(0, sqft - baseSqFt)`
2. Calculate overage time: `overage * rateOverBaseTime`
3. Calculate total time: `baseTime + overageTime`
4. Round up: `ceil(totalTime / increment) * increment`
5. Return rounded time

**Aggregation Pattern:**
```typescript
function calculateTotalTime(
  sqft: number,
  partProfiles: Array<{
    baseTime: number;
    rateOverBaseTime: number;
  }>,
  baseSqFt: number,
  increment?: number
): number {
  return partProfiles.reduce((total, part) => {
    return total + calculatePartTime(sqft, part, baseSqFt, increment);
  }, 0);
}
```

**Data Flow:**
```
Block Profiles (selected)
  └─> Part Profiles (via activeParts relationship)
       └─> baseTime, rateOverBaseTime
  └─> baseSqFt
  └─> Property sqft (user input)
  └─> Increment (config: default 30)
  └─> Total Time (calculated)
```

**Key Characteristics:**
- ✅ Database-driven (uses part profiles)
- ✅ Supports rounding (configurable increment)
- ✅ Aggregates across multiple parts
- ✅ Per-part baseSqFt support

---

### 1.2 Fee Calculation Pattern

**Principle:** Calculate fees based on USER_STORY specification: sum bases, multiply rates, apply to sqft, add bases, round.

**Standard Function Signature:**
```typescript
function calculateFee(
  partProfiles: Array<{
    baseFee: number;         // Base fee amount
    rateOverBaseFee: number; // Rate multiplier
  }>,
  sqft: number,              // Property square footage
  increment?: number         // Rounding increment (default: 15)
): number
```

**Calculation Steps (per USER_STORY):**
1. **Add all bases:** `totalBaseFee = sum(partProfiles.map(p => p.baseFee))`
2. **Multiply all rates:** `combinedRate = product(partProfiles.map(p => p.rateOverBaseFee))`
3. **Multiply rate by sqft:** `rateSqft = combinedRate * sqft`
4. **Add bases to rate*sqft:** `fee = totalBaseFee + rateSqft`
5. **Round up to nearest increment:** `ceil(fee / increment) * increment`
6. Return rounded fee

**Implementation:**
```typescript
function calculateFee(
  partProfiles: Array<{ baseFee: number; rateOverBaseFee: number }>,
  sqft: number,
  increment: number = 15
): number {
  // Step 1: Add all bases
  const totalBaseFee = partProfiles.reduce(
    (sum, part) => sum + part.baseFee,
    0
  );
  
  // Step 2: Multiply all rates (compound effect)
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

**Data Flow:**
```
Block Profiles (selected)
  └─> Part Profiles (via activeParts relationship)
       └─> baseFee, rateOverBaseFee
  └─> Property sqft (user input)
  └─> Increment (config: default 15)
  └─> Total Fee (calculated)
```

**Key Characteristics:**
- ✅ Follows USER_STORY specification exactly
- ✅ Rates multiply (compound effect)
- ✅ Sqft applies to rate, not time
- ✅ Rounds to nearest 15 minutes

**Note:** This differs from the commented pattern which used `baseFee + (timeOverage * rate)`. The USER_STORY spec takes precedence.

---

### 1.3 Availability Generation Pattern

**Principle:** Use server-side pipeline with comprehensive filtering, enhanced with differential scheduling.

**Standard Flow:**
```
1. Calendar Data (Google Calendar free/busy)
   └─> 2. Normalize Times (UTC conversion)
        └─> 3. Extract & Merge Busy Periods
             └─> 4. Calculate Free Times (gaps)
                  └─> 5. Filter by Available Days
                       └─> 6. Filter by Free Hours
                            └─> 7. Split into Free Bits (increments)
                                 └─> 8. Filter by Lead Time
                                      └─> 9. Filter by Work Hours
                                           └─> 10. Find Availabilities (contiguous slots)
                                                └─> 11. Add Differential Scheduling
                                                     └─> 12. Normalize Back (timezone)
                                                          └─> 13. Return Slots
```

**Enhanced Function Signature:**
```typescript
async function makeAvailabilitiesWithDifferential(
  freeBusyResponse: any,
  timeMin: string,
  timeMax: string,
  timezone: string,
  minuteIncrement: number,
  permissibleStartRule: string,
  duration: number,
  serviceId: string,
  adminSettings: {
    leadTime: number;
    freeHours: Record<string, { start: string; end: string }>;
    workHours: number;
  },
  differentialSettings: {
    dataCollectionMinutes: number;
    reportWritingMinutes: number;
    clientPresentationMinutes: number;
  }
): Promise<Array<{
  inspectorSlot: TimeSlot;
  clientSlot: TimeSlot;
}>>
```

**Differential Scheduling Enhancement:**
After finding inspector slots, calculate client slots:
```typescript
const differentialSlots = inspectorSlots.map(slot => {
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
});

// Filter: Remove slots where client slot doesn't fit
const validSlots = differentialSlots.filter(({ clientSlot }) => 
  isWithinWorkingHours(clientSlot, workingHoursInterval)
);
```

**Data Flow:**
```
Calendar API
  └─> Free/Busy Response
       └─> Server Pipeline
            └─> Inspector Slots
                 └─> Differential Calculation
                      └─> Client Slots
                           └─> Validation
                                └─> Combined Slots
```

**Key Characteristics:**
- ✅ Server-side execution
- ✅ Comprehensive filtering
- ✅ Real calendar integration
- ✅ Differential scheduling
- ✅ Timezone support
- ✅ Configurable increments and rules

---

## 2. Data Flow Architecture

### 2.1 Complete Calculation Flow

```
User Input (Wizard)
  ├─> Service Selection
  │    └─> Block Profiles (selected)
  │
  ├─> Property Details
  │    └─> Square Footage
  │    └─> Dwelling Type
  │
  └─> Date/Time Selection
       └─> Availability Request

Calculation Pipeline:
  ├─> Time Calculation
  │    ├─> Get Part Profiles (from selected blocks)
  │    ├─> Get Base SqFt (from block profiles)
  │    ├─> Calculate Part Times
  │    └─> Aggregate & Round
  │
  ├─> Fee Calculation
  │    ├─> Get Part Profiles (from selected blocks)
  │    ├─> Aggregate Bases
  │    ├─> Multiply Rates
  │    ├─> Apply to SqFt
  │    └─> Round to :15
  │
  └─> Availability Generation
       ├─> Request Calendar Data
       ├─> Server Pipeline
       ├─> Differential Scheduling
       └─> Return Slots

Output:
  ├─> Total Time (minutes, rounded)
  ├─> Total Fee (dollars, rounded to :15)
  └─> Available Slots (inspector + client times)
```

---

### 2.2 Data Transformation Pipeline

```
Global Data (from GlobalContext)
  └─> Scheduler Transformer
       └─> Scheduler Data
            ├─> Block Profiles (with embedded part profiles)
            │    ├─> blockType (denormalized)
            │    ├─> baseSqFt
            │    └─> partProfiles[]
            │         ├─> partType (denormalized)
            │         ├─> baseTime
            │         ├─> rateOverBaseTime
            │         ├─> baseFee
            │         ├─> rateOverBaseFee
            │         ├─> onSite
            │         └─> clientPresent
            │
            └─> Service Configuration
                 ├─> Available Days
                 ├─> Free Hours
                 ├─> Work Hours
                 ├─> Lead Time
                 ├─> Timezone
                 ├─> Minute Increment
                 └─> Permissible Start Rules
```

---

## 3. Integration Approach for Phase 6

### 3.1 Calculation Utilities Structure

**Location:** `client-vue/src/utils/scheduler/calculations/`

**File Structure:**
```
calculations/
  ├─> timeCalculation.ts      # Time calculation utilities
  ├─> feeCalculation.ts      # Fee calculation utilities
  ├─> availabilityUtils.ts   # Availability helpers (client-side)
  └─> types.ts               # Shared types
```

**Time Calculation Module:**
```typescript
// client-vue/src/utils/scheduler/calculations/timeCalculation.ts

export interface PartTimeInput {
  baseTime: number;
  rateOverBaseTime: number;
}

export function calculatePartTime(
  sqft: number,
  partProfile: PartTimeInput,
  baseSqFt: number,
  increment?: number
): number;

export function calculateTotalTime(
  sqft: number,
  partProfiles: PartTimeInput[],
  baseSqFt: number,
  increment?: number
): number;
```

**Fee Calculation Module:**
```typescript
// client-vue/src/utils/scheduler/calculations/feeCalculation.ts

export interface PartFeeInput {
  baseFee: number;
  rateOverBaseFee: number;
}

export function calculateFee(
  partProfiles: PartFeeInput[],
  sqft: number,
  increment?: number
): number;
```

---

### 3.2 Server-Side Enhancements

**Location:** `server/src/utils/availabilities/`

**Enhancements:**
1. **Add Differential Scheduling:**
   - Create `addDifferentialScheduling()` function
   - Integrate into `makeAvailabilities()` pipeline
   - Filter slots where client slot doesn't fit

2. **Complete Stubbed Filters:**
   - Implement `fetchAvailableDays()` with database query
   - Implement `sumWorkHoursForDay()` with database query

3. **Integrate Drive Time:**
   - Uncomment and fix `filterByDriveTimes.ts`
   - Integrate into main pipeline
   - Add to `makeAvailabilities()` parameters

---

### 3.3 Vue Component Integration

**Location:** `client-vue/src/components/scheduler/`

**Integration Points:**

1. **Service Selection Step:**
   - Use `SchedulerBlockProfile[]` from context
   - Display available blocks
   - Track selected blocks

2. **Property Details Step:**
   - Collect square footage
   - Use for time/fee calculations

3. **Availability Step:**
   - Call server API for availability
   - Display inspector + client slots
   - Handle differential scheduling display

4. **Confirmation Step:**
   - Calculate total time (using utilities)
   - Calculate total fee (using utilities)
   - Display breakdown

**Example Usage:**
```typescript
// In ConfirmationStep.vue
import { calculateTotalTime, calculateFee } from '@/utils/scheduler/calculations';
import { useSchedulerContext } from '@/contexts/schedulerContext';

const { selectedBlocks, propertySqft } = useWizardState();

// Get part profiles from selected blocks
const partProfiles = selectedBlocks.flatMap(block => block.partProfiles);

// Calculate time (using first block's baseSqFt)
const baseSqFt = selectedBlocks[0]?.baseSqFt || 0;
const totalTime = calculateTotalTime(propertySqft, partProfiles, baseSqFt, 30);

// Calculate fee
const totalFee = calculateFee(partProfiles, propertySqft, 15);
```

---

## 4. Standard Patterns

### 4.1 Rounding Pattern

**Standard:** Always round up to nearest increment

**Implementation:**
```typescript
function roundUpToIncrement(value: number, increment: number): number {
  return Math.ceil(value / increment) * increment;
}
```

**Usage:**
- Time: Round to 30-minute increments (default)
- Fee: Round to 15-minute increments (default)
- Configurable per calculation

---

### 4.2 Aggregation Pattern

**Standard:** Use `reduce()` for aggregations, avoid mutations

**Time Aggregation:**
```typescript
partProfiles.reduce((total, part) => 
  total + calculatePartTime(sqft, part, baseSqFt, increment),
  0
);
```

**Fee Aggregation:**
```typescript
// Bases: sum
const totalBase = partProfiles.reduce((sum, part) => sum + part.baseFee, 0);

// Rates: multiply
const combinedRate = partProfiles.reduce(
  (product, part) => product * part.rateOverBaseFee,
  1
);
```

---

### 4.3 Error Handling Pattern

**Standard:** Validate inputs, return sensible defaults

**Time Calculation:**
```typescript
function calculatePartTime(
  sqft: number,
  partProfile: PartTimeInput,
  baseSqFt: number,
  increment: number = 30
): number {
  if (!partProfile || sqft < 0 || baseSqFt < 0) {
    return 0; // Or throw error
  }
  
  // ... calculation
}
```

**Fee Calculation:**
```typescript
function calculateFee(
  partProfiles: PartFeeInput[],
  sqft: number,
  increment: number = 15
): number {
  if (!partProfiles?.length || sqft < 0) {
    return 0; // Or throw error
  }
  
  // ... calculation
}
```

---

## 5. Configuration Management

### 5.1 Calculation Configuration

**Location:** `client-vue/src/config/schedulerConfig.ts`

**Configuration:**
```typescript
export const SCHEDULER_CONFIG = {
  timeCalculation: {
    defaultIncrement: 30, // minutes
  },
  feeCalculation: {
    defaultIncrement: 15, // minutes (for rounding)
  },
  availability: {
    defaultIncrement: 30, // minutes
    permissibleStartRules: {
      'every :00': [0],
      'every :15': [0, 15, 30, 45],
      'every :30': [0, 30],
    },
  },
} as const;
```

---

### 5.2 Service Configuration

**Source:** Database (via GlobalContext)

**Structure:**
- Available days per service
- Free hours per day
- Work hours limit
- Lead time
- Timezone
- Minute increment
- Permissible start rules

---

## 6. Testing Strategy

### 6.1 Unit Tests

**Time Calculation:**
- Test single part calculation
- Test aggregation
- Test rounding
- Test edge cases (sqft < baseSqFt, zero parts, etc.)

**Fee Calculation:**
- Test base fee aggregation
- Test rate multiplication
- Test sqft application
- Test rounding
- Test edge cases

**Availability:**
- Test time normalization
- Test busy period merging
- Test free time calculation
- Test filtering stages
- Test differential scheduling

---

### 6.2 Integration Tests

- Test complete calculation flow
- Test data transformation pipeline
- Test server API integration
- Test Vue component integration

---

## 7. Performance Considerations

### 7.1 Memoization

**Time Calculation:**
- Memoize per (sqft, partProfiles, baseSqFt) combination
- TTL: 10 seconds (or until data changes)

**Fee Calculation:**
- Memoize per (partProfiles, sqft) combination
- TTL: 10 seconds

**Availability:**
- Cache calendar responses
- Cache drive times (already implemented)

---

### 7.2 Optimization

- Use functional approaches (map, reduce, filter)
- Avoid unnecessary recalculations
- Batch database queries
- Cache transformed data

---

## 8. Migration Path

### 8.1 Phase 6 Implementation Order

1. **Create Calculation Utilities**
   - Time calculation functions
   - Fee calculation functions
   - Unit tests

2. **Enhance Server Pipeline**
   - Add differential scheduling
   - Complete stubbed filters
   - Integrate drive times

3. **Integrate into Vue Components**
   - Service selection
   - Property details
   - Availability display
   - Confirmation step

4. **Connect Real Data**
   - Replace mocks with database queries
   - Connect calendar API
   - Test end-to-end

---

## 9. Documentation Requirements

### 9.1 Code Documentation

- JSDoc comments for all public functions
- Type definitions for all interfaces
- Examples in comments

### 9.2 User Documentation

- Calculation methodology explanation
- Fee breakdown display
- Time slot explanation (differential scheduling)

---

## 10. Success Criteria

### 10.1 Functional Requirements

- ✅ Time calculations match expected values
- ✅ Fee calculations match USER_STORY spec
- ✅ Availability includes differential scheduling
- ✅ All filters work correctly
- ✅ Real data integration works

### 10.2 Non-Functional Requirements

- ✅ Calculations are performant (< 100ms)
- ✅ Code is maintainable and well-documented
- ✅ Tests provide good coverage (> 80%)
- ✅ Error handling is robust

---

## 11. References

- `SCHEDULING_LOGIC_INVENTORY.md` - Complete logic catalog
- `CALCULATION_COMPARISON.md` - Detailed comparisons
- `SCHEDULING_GAPS.md` - Missing implementations
- `USER_STORY.md` - Business requirements

