# Calculation Comparison and Recommendations

## Overview
This document provides side-by-side comparisons of similar calculations found across different implementations, identifies overlaps and conflicts, and provides recommendations for Phase 6 integration.

---

## 1. Time Calculation Comparison

### 1.1 Jose's `getSlotPart()` vs React's `ProfileToFinalTimeUtils.calculateTime()`

#### Jose's Approach (`getSlotPart.js`)

**Function:**
```javascript
getSlotPart(dwellingSize, partType, serviceType) => number
```

**Calculation:**
```javascript
const { baseTime, baseSqft, workRate } = PartTypeMap[partType][serviceType];
const overBaseDwellingSize = Number(dwellingSize) < baseSqft ? 0 : dwellingSize - baseSqft;
const overBaseMinutes = overBaseDwellingSize * workRate;
const overBaseMinutesRounded = Math.ceil(overBaseMinutes / DEFAULT_INCREMENT) * DEFAULT_INCREMENT;
const slotPartTime = baseTimeMinutes + overBaseMinutesRounded;
```

**Key Characteristics:**
- ✅ Calculates **single part** time
- ✅ Uses **hardcoded** `PartTypeMap` configuration
- ✅ **Rounds** to nearest increment (30 min default)
- ✅ Service-specific configurations
- ⚠️ Requires service type to look up config
- ⚠️ Hardcoded data (not database-driven)

**Data Source:**
```javascript
PartTypeMap[PartTypes.DATA_COLLECTION][ServiceTypeNames.BUYERS_INSPECTION] = {
  baseTime: {minutes: 30},
  baseSqft: 750,
  workRate: 0.06
}
```

---

#### React Approach (`ProfileToFinalTimeUtils.ts`)

**Function:**
```typescript
calculateTime(home_sq_ft, partProfiles, base_sq_ft) => number
```

**Calculation:**
```typescript
partProfiles.reduce((totalTime, part) => {
  const overage = home_sq_ft > base_sq_ft 
    ? (home_sq_ft - base_sq_ft) * part.rateOverBaseTime 
    : 0;
  return totalTime + part.baseTime + overage;
}, 0);
```

**Key Characteristics:**
- ✅ Calculates **aggregate** time across multiple parts
- ✅ Uses **database** part profiles
- ❌ **No rounding** (returns raw minutes)
- ✅ Dynamic data (database-driven)
- ✅ Works with any part profile structure
- ⚠️ Requires single `base_sq_ft` for all parts

**Data Source:**
- Part profiles from `SchedulerBlockProfile.partProfiles[]`
- Each part has: `baseTime`, `rateOverBaseTime`
- Base sqft from `BlockProfile.baseSqFt`

---

#### Comparison Table

| Aspect | Jose's Approach | React Approach |
|--------|----------------|----------------|
| **Scope** | Single part | Multiple parts aggregate |
| **Data Source** | Hardcoded map | Database part profiles |
| **Rounding** | ✅ Rounds to 30min increment | ❌ No rounding |
| **Base Sqft** | Per part type | Single value for all parts |
| **Service Specific** | ✅ Yes | ❌ No (generic) |
| **Flexibility** | ⚠️ Requires code changes | ✅ Database-driven |
| **Use Case** | Wizard calculation | Scheduler aggregation |

---

#### Key Differences

1. **Rounding:** Jose rounds to nearest increment, React does not
2. **Data Source:** Jose uses hardcoded configs, React uses database
3. **Scope:** Jose calculates one part, React aggregates multiple
4. **Base Sqft:** Jose has per-part-type base, React uses single base

---

#### Recommendation for Phase 6

**Hybrid Approach:**
1. **Use React's aggregation logic** as the base (database-driven)
2. **Add rounding** from Jose's approach (round to nearest increment)
3. **Use database part profiles** instead of hardcoded map
4. **Support per-part baseSqFt** from block profiles

**Proposed Unified Function:**
```typescript
function calculatePartTime(
  sqft: number,
  partProfile: { baseTime: number; rateOverBaseTime: number },
  baseSqFt: number,
  increment: number = 30
): number {
  const overage = sqft > baseSqFt ? (sqft - baseSqFt) * partProfile.rateOverBaseTime : 0;
  const totalMinutes = partProfile.baseTime + overage;
  return Math.ceil(totalMinutes / increment) * increment; // Round up to increment
}

function calculateTotalTime(
  sqft: number,
  partProfiles: Array<{ baseTime: number; rateOverBaseTime: number }>,
  baseSqFt: number,
  increment: number = 30
): number {
  return partProfiles.reduce((total, part) => {
    return total + calculatePartTime(sqft, part, baseSqFt, increment);
  }, 0);
}
```

**Benefits:**
- ✅ Database-driven (flexible)
- ✅ Includes rounding (matches Jose's UX)
- ✅ Supports aggregation (matches React's use case)
- ✅ Configurable increment

---

## 2. Availability Generation Comparison

### 2.1 Jose's Client-Side Generation (`getTimeSlots.js`)

**Approach:** Client-side time slot generation

**Process:**
1. Define working hours interval
2. Start with first slot at interval start
3. For each increment:
   - Check if slot end is within working hours
   - Check if slot conflicts with mock appointments (30min padding)
   - Calculate client slot (differential scheduling)
   - Add to results
4. Increment by `DEFAULT_INCREMENT` (30 min)

**Features:**
- ✅ Simple, straightforward logic
- ✅ Differential scheduling (inspector vs client slots)
- ✅ Working hours filtering
- ✅ Conflict detection with padding
- ⚠️ Uses mock appointment data
- ⚠️ No timezone handling
- ⚠️ No calendar integration
- ⚠️ No drive time consideration
- ⚠️ No lead time filtering
- ⚠️ No available days filtering

**Complexity:** Low
**Dependencies:** Minimal (date-fns)

---

### 2.2 Server-Side Pipeline (`newMakeAvailabilties.ts`)

**Approach:** Server-side multi-stage filtering pipeline

**Process:**
1. Normalize times to UTC
2. Extract and merge busy periods from calendar
3. Calculate free time gaps
4. Filter by available days (per service)
5. Filter by free hours (working hours per day)
6. Split into increment-sized slots with permissible starts
7. Filter by lead time (minimum advance booking)
8. Filter by work hours (daily limits)
9. Find contiguous slots meeting duration
10. Normalize back to target timezone

**Features:**
- ✅ Real calendar integration (Google Calendar)
- ✅ Comprehensive filtering pipeline
- ✅ Timezone handling
- ✅ Lead time enforcement
- ✅ Work hours limits
- ✅ Available days per service
- ✅ Permissible start rules (every :15, :30, etc.)
- ⚠️ Some filters stubbed (availableDays, workHours)
- ⚠️ No differential scheduling
- ⚠️ No drive time integration (exists but commented out)

**Complexity:** High
**Dependencies:** date-fns, date-fns-tz, Google Calendar API

---

#### Comparison Table

| Feature | Jose's Approach | Server Approach |
|---------|----------------|-----------------|
| **Location** | Client-side | Server-side |
| **Calendar Integration** | ❌ Mock data | ✅ Real calendar |
| **Timezone Handling** | ❌ None | ✅ Full support |
| **Differential Scheduling** | ✅ Yes | ❌ No |
| **Working Hours** | ✅ Simple check | ✅ Per-day config |
| **Conflict Detection** | ✅ 30min padding | ✅ Real busy periods |
| **Lead Time** | ❌ No | ✅ Yes |
| **Available Days** | ❌ No | ✅ Per service |
| **Drive Times** | ❌ No | ⚠️ Exists but not integrated |
| **Permissible Starts** | ❌ Fixed increment | ✅ Configurable rules |
| **Work Hours Limits** | ❌ No | ⚠️ Stubbed |
| **Complexity** | Low | High |

---

#### Key Differences

1. **Calendar Data:** Jose uses mocks, server uses real calendar
2. **Differential Scheduling:** Jose has it, server doesn't
3. **Filtering:** Server has comprehensive pipeline, Jose has basic checks
4. **Timezone:** Server handles timezones, Jose doesn't
5. **Location:** Client vs server execution

---

#### Recommendation for Phase 6

**Hybrid Approach:**

1. **Use Server Pipeline** for initial availability generation:
   - Real calendar integration
   - Comprehensive filtering
   - Timezone handling
   - Lead time, work hours, etc.

2. **Add Differential Scheduling** to server pipeline:
   - After finding inspector slots, calculate client slots
   - Client slot = inspector start + (dataCollection + reportWriting)
   - Filter out slots where client slot doesn't fit

3. **Client-Side Enhancement** (optional):
   - Use server-generated slots as base
   - Apply additional client-side filtering if needed
   - Handle differential display logic

**Proposed Integration:**
```typescript
// Server: Generate base availabilities
const inspectorSlots = await makeAvailabilities(...);

// Server: Add differential scheduling
const differentialSlots = inspectorSlots.map(slot => {
  const clientStart = addMinutes(slot.slotStart, dataCollectionMinutes + reportWritingMinutes);
  const clientEnd = addMinutes(clientStart, clientPresentationMinutes);
  
  return {
    inspectorSlot: slot,
    clientSlot: { start: clientStart, end: clientEnd }
  };
});

// Filter: Remove slots where client slot doesn't fit in working hours
const validSlots = differentialSlots.filter(({ clientSlot }) => 
  isWithinWorkingHours(clientSlot, workingHoursInterval)
);
```

**Benefits:**
- ✅ Real calendar integration
- ✅ Comprehensive filtering
- ✅ Differential scheduling
- ✅ Timezone support
- ✅ All server-side features

---

## 3. Fee Calculation Analysis

### 3.1 Commented Pattern (`appointmentTransformer.ts`)

**Pattern Found:**
```typescript
static calculateFee(
  time_overages: number,
  rate_over_base_fee: number,
  base_fee: number
): number {
  return base_fee + time_overages * rate_over_base_fee;
}
```

**Aggregation Pattern:**
```typescript
// Aggregate across parts
totalBaseFee += part.baseFee;
totalRateOverBaseFee += part.rateOverBaseFee;
totalTimeOverage += overage;

// Calculate fee
feeTotal = calculateFee(totalTimeOverage, totalRateOverBaseFee, totalBaseFee);
```

**Characteristics:**
- ✅ Simple formula: `base + (timeOverage * rate)`
- ✅ Aggregates across parts
- ✅ Includes memoization
- ⚠️ Commented out (not implemented)
- ⚠️ Doesn't match USER_STORY spec

---

### 3.2 USER_STORY Specification

**Specification (USER_STORY.md):**
```
For each appointment time block: 
  1. Add all bases for the service and each additional service and option, 
  2. Multiply all rates for the service and each additional service and option, 
  3. Multiply the total rate by property sqft, 
  4. Then add bases to rate*sqft,
  5. Round up to the nearest :15
```

**Interpretation:**
1. Sum all `baseFee` values
2. Multiply all `rateOverBaseFee` values together (not sum!)
3. Multiply combined rate by sqft
4. Add sum of bases to (rate * sqft)
5. Round to nearest 15 minutes

**Formula:**
```
totalBaseFee = sum(baseFees)
combinedRate = product(rateOverBaseFees)  // Multiply, not add!
fee = totalBaseFee + (combinedRate * sqft)
feeRounded = roundUpToNearest15(fee)
```

---

#### Comparison

| Aspect | Commented Pattern | USER_STORY Spec |
|--------|------------------|-----------------|
| **Base Fee** | Sum | Sum ✅ |
| **Rate Handling** | Sum | Multiply ❌ |
| **Sqft Application** | Applied to time overage | Applied to rate ❌ |
| **Rounding** | None | Round to :15 ❌ |
| **Time Overage** | Used in calculation | Not mentioned ❌ |

**Key Differences:**
1. **Rate Aggregation:** Pattern sums rates, spec multiplies them
2. **Sqft Application:** Pattern uses time overage, spec uses sqft directly
3. **Rounding:** Spec requires rounding, pattern doesn't
4. **Time Overage:** Pattern uses it, spec doesn't mention it

---

#### Recommendation for Phase 6

**Implement USER_STORY Specification:**

The USER_STORY spec is more explicit and should be the source of truth. However, we need to clarify:

1. **Rate Multiplication:** Multiply rates together (compound effect)
2. **Sqft Application:** Apply directly to rate, not to time overage
3. **Base Fee:** Sum all base fees
4. **Rounding:** Round final fee to nearest 15-minute increment

**Proposed Implementation:**
```typescript
function calculateFee(
  partProfiles: Array<{ baseFee: number; rateOverBaseFee: number }>,
  sqft: number,
  increment: number = 15
): number {
  // Step 1: Add all bases
  const totalBaseFee = partProfiles.reduce((sum, part) => sum + part.baseFee, 0);
  
  // Step 2: Multiply all rates (compound)
  const combinedRate = partProfiles.reduce((product, part) => product * part.rateOverBaseFee, 1);
  
  // Step 3: Multiply rate by sqft
  const rateSqft = combinedRate * sqft;
  
  // Step 4: Add bases to rate*sqft
  const fee = totalBaseFee + rateSqft;
  
  // Step 5: Round up to nearest increment
  return Math.ceil(fee / increment) * increment;
}
```

**Note:** This differs significantly from the commented pattern. Need to confirm with business logic whether:
- Rates should multiply (compound) or sum (additive)
- Sqft applies to rate or time overage
- Time overage should factor into fee calculation

---

## 4. Summary of Recommendations

### 4.1 Time Calculation
- ✅ **Use React's aggregation approach** (database-driven)
- ✅ **Add rounding** from Jose's approach
- ✅ **Support per-part baseSqFt** from block profiles
- ✅ **Create unified utility functions**

### 4.2 Availability Generation
- ✅ **Use server-side pipeline** for comprehensive filtering
- ✅ **Add differential scheduling** to server pipeline
- ✅ **Keep client-side for display** logic only
- ✅ **Integrate drive time filtering** (currently commented out)

### 4.3 Fee Calculation
- ⚠️ **Clarify specification** - USER_STORY differs from commented pattern
- ✅ **Implement USER_STORY spec** as written
- ⚠️ **Confirm business logic** for rate multiplication vs addition
- ✅ **Add rounding** to nearest 15 minutes

### 4.4 Data Sources
- ✅ **Prefer database-driven** over hardcoded configs
- ✅ **Use part profiles** from scheduler transformation
- ✅ **Use block profiles** for baseSqFt and relationships
- ⚠️ **Migrate Jose's PartTypeMap** to database if needed

---

## 5. Integration Priority

### High Priority (Phase 6 Core)
1. ✅ Unified time calculation with rounding
2. ✅ Fee calculation implementation
3. ✅ Differential scheduling in availability pipeline
4. ✅ Connect real data sources (replace mocks)

### Medium Priority (Phase 6 Enhancement)
5. ⚠️ Drive time filtering integration
6. ⚠️ Complete stubbed filters (availableDays, workHours)
7. ⚠️ Timezone handling in client-side

### Low Priority (Future)
8. ⚠️ Client-side availability caching
9. ⚠️ Performance optimizations
10. ⚠️ Additional filtering options

---

## 6. Conflicts and Resolutions

### Conflict 1: Time Calculation Rounding
- **Jose:** Rounds to 30min increment
- **React:** No rounding
- **Resolution:** Add rounding to React approach, make increment configurable

### Conflict 2: Fee Calculation Formula
- **Commented Pattern:** `baseFee + (timeOverage * rate)`
- **USER_STORY:** `sum(bases) + (product(rates) * sqft)`
- **Resolution:** Implement USER_STORY spec, clarify with business if needed

### Conflict 3: Availability Generation Location
- **Jose:** Client-side, simple
- **Server:** Server-side, comprehensive
- **Resolution:** Use server pipeline, add differential scheduling to it

### Conflict 4: Data Source
- **Jose:** Hardcoded PartTypeMap
- **React:** Database part profiles
- **Resolution:** Use database profiles, migrate Jose's configs if needed

---

## 7. Next Steps

1. **Review and Confirm:** Validate USER_STORY fee calculation spec with business
2. **Create Unified Utilities:** Build shared calculation functions
3. **Integrate Differential Scheduling:** Add to server pipeline
4. **Implement Fee Calculation:** Build according to spec
5. **Test Integration:** Verify calculations match expected results
6. **Document API:** Create clear interfaces for calculation functions

