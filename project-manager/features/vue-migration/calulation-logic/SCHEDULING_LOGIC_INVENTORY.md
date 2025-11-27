# Scheduling Logic Inventory

## Overview
This document provides a comprehensive catalog of all scheduling calculation logic found across the codebase, including inputs, outputs, data dependencies, and implementation status.

---

## 1. Jose's Wizard Logic (React/MUI)

### 1.1 Part Time Calculation (`getSlotPart.js`)

**Location:** `/Users/districthomepro/Bonsai/Jose-Scheduler-Reference/src/utils/getSlotPart.js`

**Purpose:** Calculate the time required for a specific part type (dataCollection, reportWriting, clientPresentation) based on dwelling size, part type, and service type.

**Function Signature:**
```javascript
getSlotPart(dwellingSize, partType, serviceType) => number (minutes)
```

**Inputs:**
- `dwellingSize` (number): Square footage of the property
- `partType` (string): One of `PartTypes.DATA_COLLECTION`, `PartTypes.REPORT_WRITING`, `PartTypes.CLIENT_PRESENTATION`
- `serviceType` (string): Service type name from `ServiceTypeNames` enum

**Output:** Number of minutes (rounded up to nearest increment)

**Calculation Logic:**
1. Look up `baseTime`, `baseSqft`, and `workRate` from `PartTypeMap[partType][serviceType]`
2. Calculate `overBaseDwellingSize = max(0, dwellingSize - baseSqft)`
3. Calculate `overBaseMinutes = overBaseDwellingSize * workRate`
4. Round up: `overBaseMinutesRounded = ceil(overBaseMinutes / DEFAULT_INCREMENT) * DEFAULT_INCREMENT`
5. Return: `baseTimeMinutes + overBaseMinutesRounded`

**Data Dependencies:**
- `PartTypeMap` constant from `constants/Appointment.js`
- `DEFAULT_INCREMENT = 30` minutes

**Example Configuration:**
```javascript
PartTypeMap[PartTypes.DATA_COLLECTION][ServiceTypeNames.BUYERS_INSPECTION] = {
  baseTime: {minutes: 30},
  baseSqft: 750,
  workRate: 0.06
}
```

**Status:** ✅ Complete and functional

---

### 1.2 Time Slot Generation (`getTimeSlots.js`)

**Location:** `/Users/districthomepro/Bonsai/Jose-Scheduler-Reference/src/utils/getTimeSlots.js`

**Purpose:** Generate available time slots for both inspector and client appointments, implementing differential scheduling.

**Function Signature:**
```javascript
getTimeSlots(date, {startTime, endTime, appointmentDetails}) => Array<{inspectorAppointment, clientAppointment}>
```

**Inputs:**
- `date` (Date): The date to generate slots for
- `startTime` (Array): `[hours, minutes]` - start of working hours
- `endTime` (Array): `[hours, minutes]` - end of working hours
- `appointmentDetails` (Object):
  - `appointmentLength` (Object): `{minutes: number}` - total inspector appointment duration
  - `dataCollectionLength` (Object): `{minutes: number}` - data collection part duration
  - `reportWritingLength` (Object): `{minutes: number}` - report writing part duration
  - `clientPresentationLength` (Object): `{minutes: number}` - client presentation duration

**Output:** Array of slot objects:
```javascript
{
  inspectorAppointment: {
    start: Date,
    startLabel: string,  // formatted as "h:mmaaa"
    end: Date,
    endLabel: string
  },
  clientAppointment: {
    start: Date,
    startLabel: string,
    end: Date,
    endLabel: string
  }
}
```

**Calculation Logic:**
1. Create day interval from `startTime` to `endTime`
2. Get mock appointment intervals (currently hardcoded)
3. Start with first slot at `dayInterval.start`
4. For each slot:
   - Check if slot end is within working hours
   - Check if slot conflicts with existing appointments (30min padding)
   - If available, calculate client slot:
     - Client starts after `dataCollectionLength + reportWritingLength`
     - Client duration is `clientPresentationLength`
   - Increment by `DEFAULT_INCREMENT` (30 minutes)
5. Return all valid slots

**Helper Functions:**
- `getSlot(date, {minutesIncrement, appointmentLength})`: Creates a single slot
- `getClientSlot(currentSlot, appointmentDetails)`: Calculates client presentation slot
- `isWithinWorkingHours(slot, dayInterval)`: Checks if slot end is within working hours
- `isAvailableSlot(candidateAppointment, appointmentIntervals)`: Checks for conflicts with 30min padding

**Data Dependencies:**
- `DEFAULT_INCREMENT = 30` minutes
- Mock appointment data (currently hardcoded)

**Status:** ✅ Complete but uses mock data for conflicts

---

### 1.3 Service Configuration (`constants/Appointment.js`)

**Location:** `/Users/districthomepro/Bonsai/Jose-Scheduler-Reference/src/constants/Appointment.js`

**Purpose:** Defines service types, part types, and their time calculation parameters.

**Key Constants:**

**Part Types:**
- `DATA_COLLECTION`: 'dataCollection'
- `REPORT_WRITING`: 'reportWriting'
- `CLIENT_PRESENTATION`: 'clientPresentation'

**Service Types:**
- `BUYERS_INSPECTION`, `WALK_AND_TALK`, `RE_INSPECTION`, etc.

**PartTypeMap Structure:**
```javascript
PartTypeMap[partType][serviceType] = {
  baseTime: {minutes: number},
  baseSqft: number,
  workRate: number  // minutes per sqft over base
}
```

**Example Values:**
- Data Collection: `baseSqft: 750`, `workRate: 0.06`
- Report Writing: `baseSqft: 750`, `workRate: 0.06`
- Client Presentation: `baseSqft: 800`, `workRate: 0.03`

**Status:** ✅ Complete configuration

---

## 2. Existing React Scheduler Logic

### 2.1 Time Calculation Utilities (`profileToFinalTimeUtils.ts`)

**Location:** `client/src/scheduler/profileToFinalTimeUtils.ts`

**Purpose:** Calculate total time and time overage from part profiles based on square footage.

**Function: `calculateTime()`**
```typescript
static calculateTime(
  home_sq_ft: number,
  partProfiles: Array<{ baseTime: number; rateOverBaseTime: number }>,
  base_sq_ft: number
): number
```

**Inputs:**
- `home_sq_ft` (number): Property square footage
- `partProfiles` (Array): Array of part profile objects with `baseTime` and `rateOverBaseTime`
- `base_sq_ft` (number): Base square footage threshold

**Output:** Total time in minutes (or same unit as `baseTime`)

**Calculation Logic:**
```typescript
partProfiles.reduce((totalTime, part) => {
  const overage = home_sq_ft > base_sq_ft 
    ? (home_sq_ft - base_sq_ft) * part.rateOverBaseTime 
    : 0;
  return totalTime + part.baseTime + overage;
}, 0);
```

**Function: `calculateTimeOverage()`**
```typescript
static calculateTimeOverage(
  home_sq_ft: number,
  partProfiles: Array<{ baseTime: number; rateOverBaseTime: number }>,
  base_sq_ft: number
): number
```

**Purpose:** Calculate only the overage portion (time above base)

**Calculation Logic:**
```typescript
partProfiles.reduce((totalOverage, part) => {
  return totalOverage + (
    home_sq_ft > base_sq_ft 
      ? (home_sq_ft - base_sq_ft) * part.rateOverBaseTime 
      : 0
  );
}, 0);
```

**Function: `getBoolean()`**
```typescript
static getBoolean(
  partProfiles: Array<{ onSite?: boolean; clientPresent?: boolean }>,
  booleanType: 'onSite' | 'clientPresent'
): boolean
```

**Purpose:** Aggregate boolean flags across part profiles (returns true only if ALL parts have the flag set)

**Calculation Logic:**
```typescript
partProfiles.every(part => part[booleanType])
```

**Data Dependencies:**
- Part profiles from scheduler data transformation
- Base square footage from block profiles

**Status:** ✅ Complete and functional

---

### 2.2 Fee Calculation Pattern (`appointmentTransformer.ts`)

**Location:** `client/src/scheduler/appointmentTransformer.ts`

**Purpose:** Calculate fees based on time overages and rates (currently commented out but shows pattern).

**Function: `calculateFee()` (commented)**
```typescript
static calculateFee(
  time_overages: number,
  rate_over_base_fee: number,
  base_fee: number
): number
```

**Calculation Logic:**
```typescript
return base_fee + time_overages * rate_over_base_fee;
```

**Function: `calculateBlockFinal()` (commented)**
- Aggregates `totalBaseFee` and `totalRateOverBaseFee` from all parts
- Calculates `totalTimeOverage`
- Calls `calculateFee()` with aggregated values

**Function: `calculateTotalFee()` (commented)**
- Sums fee totals from all block finals

**Memoization:** Includes memoization pattern with TTL (10 seconds default)

**Status:** ⚠️ Commented out - pattern exists but not implemented

---

### 2.3 Data Transformation (`globalToSchedulerTransformer.ts`)

**Location:** `client/src/scheduler/dataTransformation/globalToSchedulerTransformer.ts`

**Purpose:** Transform global entity data into scheduler-optimized format with embedded part profiles.

**Key Transformations:**
- Denormalizes `blockTypeRef` → `blockType` (name string)
- Denormalizes `partTypeRef` → `partType` (name string)
- Embeds `partProfiles` within `blockProfiles`
- Filters out disabled entities
- Sorts by `orderIndex`

**Output Structure:**
```typescript
SchedulerBlockProfile {
  id: string,
  entityKey: "blockProfile",
  blockType: string,  // denormalized name
  activeBlockIds: string[],
  partProfiles: SchedulerPartProfile[]  // embedded
}
```

**Status:** ✅ Complete and functional

---

## 3. Server-Side Availability Logic

### 3.1 Main Availability Generation (`newMakeAvailabilties.ts`)

**Location:** `server/src/utils/newMakeAvailabilties.ts`

**Purpose:** Generate available time slots from Google Calendar free/busy data with multiple filtering stages.

**Function Signature:**
```typescript
async function makeAvailabilities(
  freeBusyResponse: any,
  timeMin: string,
  timeMax: string,
  timezone: string,
  minuteIncrement: number,
  permissibleStartRule: string,
  duration: number,
  serviceId: string,
  adminSettings: {
    leadTime: number,
    freeHours: Record<string, { start: string; end: string }>,
    workHours: number
  }
): Promise<TimeSlot[]>
```

**Inputs:**
- `freeBusyResponse`: Google Calendar free/busy API response
- `timeMin`, `timeMax`: ISO string time range
- `timezone`: Timezone string (e.g., "America/New_York")
- `minuteIncrement`: Slot increment size (e.g., 15, 30)
- `permissibleStartRule`: Rule like "every :15", "every :30", "every :00"
- `duration`: Required appointment duration in minutes
- `serviceId`: Service identifier for available days lookup
- `adminSettings`: Configuration object

**Output:** Array of `TimeSlot` objects:
```typescript
class TimeSlot {
  duration: number,
  slotStart: Date,
  slotEnd: Date
}
```

**Processing Pipeline:**
1. **Normalize Times:** Convert to UTC
2. **Extract Busy Periods:** From freeBusyResponse
3. **Merge Busy Periods:** Combine overlapping periods
4. **Calculate Free Times:** Gaps between busy periods
5. **Filter by Available Days:** Based on serviceId
6. **Filter by Free Hours:** Working hours per day
7. **Split into Free Bits:** Increment-sized slots with permissible starts
8. **Filter by Lead Time:** Remove slots too soon
9. **Filter by Work Hours:** Daily work hour limits
10. **Find Availabilities:** Contiguous slots meeting duration
11. **Normalize Back:** Convert to target timezone

**Status:** ✅ Complete but some filters are stubbed (availableDays, workHours)

---

### 3.2 Time Normalization (`timeNormalization.ts`)

**Location:** `server/src/utils/availabilities/timeNormalization.ts` (commented out)

**Purpose:** Convert times between UTC and timezone-aware formats.

**Functions (commented):**
- `normalizeToUtc(time: string, timezone: string): Date`
- `normalizeToZone(time: Date, timezone: string): Date`

**Status:** ⚠️ Commented out - logic exists in `newMakeAvailabilties.ts`

---

### 3.3 Busy Period Processing (`busyPeriodsToFreeTimes.ts`)

**Location:** `server/src/utils/availabilities/busyPeriodsToFreeTimes.ts` (commented out)

**Purpose:** Merge overlapping busy periods and calculate free time gaps.

**Functions (commented):**
- `mergeBusyPeriods(busy, timezone)`: Merges overlapping periods
- `calculateFreeTimes(mergedBusy, timeMin, timeMax)`: Finds gaps

**Status:** ⚠️ Commented out - logic exists in `newMakeAvailabilties.ts`

---

### 3.4 Free Times to Valid Availabilities (`freeTimesToValidAvailabilities.ts`)

**Location:** `server/src/utils/availabilities/freeTimesToValidAvailabilities.ts` (commented out)

**Purpose:** Convert free time periods into increment-sized slots and find valid availabilities.

**Functions (commented):**
- `mapPermissibleStarts(rule: string)`: Maps rules to minute offsets
- `splitFreeTimesToFreeBits(freeTimes, minuteIncrement, permissibleStarts)`: Creates increment-sized slots
- `findAvailabilities(freeBits, duration)`: Finds contiguous slots meeting duration

**Status:** ⚠️ Commented out - logic exists in `newMakeAvailabilties.ts`

---

### 3.5 Drive Time Filtering (`filterByDriveTimes.ts`)

**Location:** `server/src/utils/availabilities/filterByDriveTimes.ts` (commented out)

**Purpose:** Filter free times based on drive time requirements between appointments.

**Function (commented):**
- `filterByDriveTime(freeTimes, mergedBusy, driveTimeCache, destinations, minuteIncrement)`

**Logic:**
- Excludes free times that start within `DriveTimeTo` after a busy period ends
- Excludes free times that end within `DriveTimeFrom` before next busy period starts

**Status:** ⚠️ Commented out - not integrated into main pipeline

---

### 3.6 Google Maps Drive Time API (`googleFetchRoutes.ts`)

**Location:** `server/src/routes/external/googleFetchRoutes.ts`

**Purpose:** Fetch drive times from Google Maps API with caching.

**Function Signature:**
```typescript
async function fetchDriveTimes(
  origin: string,
  busyStart: string,
  busyEnd?: string
): Promise<DriveTimes>
```

**Output:**
```typescript
interface DriveTimes {
  DriveTimeTo: number,    // minutes (rounded up)
  DriveTimeFrom: number   // minutes (rounded up)
}
```

**Features:**
- Caching with Map-based cache
- Rounds up to nearest minute
- Error handling with default values

**Status:** ✅ Complete and functional

---

## 4. User Story Requirements

### 4.1 Fee Calculator Specification

**Location:** `USER_STORY.md` lines 624-630

**Purpose:** Calculate total fee for an appointment based on service, additional services, and property square footage.

**Calculation Steps:**
1. Add all bases for the service and each additional service and option
2. Multiply all rates for the service and each additional service and option
3. Multiply the total rate by property sqft
4. Then add bases to rate*sqft
5. Round up to the nearest :15

**Status:** ⚠️ Not implemented - specification only

---

## 5. Data Model Summary

### 5.1 Block Profiles
- `id`: UUID
- `blockTypeRef`: Reference to blockType entity
- `baseSqFt`: Base square footage threshold
- `name`, `description`, `icon`: Display properties
- Relationships: `activeParts`, `activeBlocks`

### 5.2 Part Profiles
- `id`: UUID
- `partTypeRef`: Reference to partType entity
- `baseTime`: Base time in minutes
- `rateOverBaseTime`: Minutes per sqft over base
- `baseFee`: Base fee amount
- `rateOverBaseFee`: Fee rate per time unit
- `onSite`: Boolean flag
- `clientPresent`: Boolean flag
- `moveable`: Boolean flag

### 5.3 Service Configuration
- Available days (0-6, Sunday-Saturday)
- Free hours per day
- Work hours limit per day
- Lead time (minimum advance booking time)
- Timezone
- Minute increment
- Permissible start rules

---

## 6. Calculation Flow Summary

### 6.1 Time Calculation Flow
1. Select block profiles (services)
2. Get associated part profiles
3. For each part profile:
   - Calculate overage: `max(0, sqft - baseSqft) * rateOverBaseTime`
   - Add base time
4. Sum all part times
5. (Jose's approach) Round to nearest increment

### 6.2 Fee Calculation Flow (Specified but not implemented)
1. Aggregate all base fees
2. Aggregate all rate multipliers
3. Calculate time overages
4. Multiply rates together
5. Multiply by sqft
6. Add bases
7. Round to nearest :15

### 6.3 Availability Calculation Flow
1. Get busy periods from calendar
2. Merge overlapping periods
3. Calculate free time gaps
4. Apply filters (days, hours, lead time, work hours, drive times)
5. Split into increment-sized slots
6. Find contiguous slots meeting duration requirement
7. Return available slots

---

## 7. Implementation Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Jose's Part Time Calculation | ✅ Complete | Uses hardcoded PartTypeMap |
| Jose's Time Slot Generation | ✅ Complete | Uses mock appointment data |
| React Time Calculation Utils | ✅ Complete | Functional, uses part profiles |
| React Fee Calculation | ⚠️ Commented | Pattern exists, needs implementation |
| Server Availability Generation | ✅ Complete | Some filters stubbed |
| Drive Time API | ✅ Complete | Functional with caching |
| USER_STORY Fee Calculator | ⚠️ Not Implemented | Specification only |

---

## 8. Key Differences and Overlaps

### 8.1 Time Calculation Approaches

**Jose's Approach:**
- Uses hardcoded `PartTypeMap` with service-specific configurations
- Rounds to nearest increment (30 min) after calculation
- Calculates per part type individually

**React Approach:**
- Uses dynamic part profiles from database
- No rounding (returns raw minutes)
- Aggregates across all parts

**Overlap:** Both calculate `baseTime + (overage * rate)`, but Jose rounds and uses hardcoded configs.

### 8.2 Availability Generation Approaches

**Jose's Approach:**
- Client-side generation
- Simple working hours filtering
- 30-minute conflict padding
- Mock appointment data

**Server Approach:**
- Server-side generation
- Complex multi-stage filtering pipeline
- Real calendar integration
- Drive time considerations

**Overlap:** Both generate time slots, but server approach is more comprehensive.

---

## 9. Data Dependencies Map

```
Block Profiles
  └─> Part Profiles (via activeParts relationship)
       └─> baseTime, rateOverBaseTime, baseFee, rateOverBaseFee
  └─> baseSqFt

Service Configuration
  └─> Available Days
  └─> Free Hours
  └─> Work Hours
  └─> Lead Time
  └─> Timezone
  └─> Minute Increment
  └─> Permissible Start Rules

Calendar Data
  └─> Busy Periods
       └─> Drive Times (via Google Maps API)
```

---

## 10. Next Steps for Phase 6 Integration

1. **Unify Time Calculation:** Decide on rounding approach and data source (hardcoded vs database)
2. **Implement Fee Calculation:** Build according to USER_STORY specification
3. **Integrate Availability:** Choose client-side vs server-side approach or hybrid
4. **Connect Real Data:** Replace mock/hardcoded data with database queries
5. **Add Missing Filters:** Implement stubbed filters (availableDays, workHours)
6. **Drive Time Integration:** Integrate drive time filtering into main pipeline

