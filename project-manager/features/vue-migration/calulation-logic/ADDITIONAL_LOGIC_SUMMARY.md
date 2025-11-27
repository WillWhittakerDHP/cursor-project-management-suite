# Additional Logic Summary - Jose & Marcel

## Overview
This document captures additional calculation logic and patterns from Jose's wizard hook and Marcel's components that need to be preserved for Phase 6 integration.

---

## 1. Jose's `useAppointment` Hook - Reactive Calculation Pattern

### Location
`/Users/districthomepro/Bonsai/Jose-Scheduler-Reference/src/hooks/useAppointment.js`

### Purpose
This React hook manages the complete appointment state and implements **reactive calculation patterns** that automatically recalculate appointment details when service type or property details change.

### Key Calculation Logic

#### 1.1 Dynamic Appointment Details Calculation (Lines 71-87)

**Pattern:** Reactive calculation that runs whenever `serviceType` or `dwellingSize` changes.

```javascript
useEffect(() => {
    const {appointmentParts} = ServiceTypes[serviceType];
    const onsiteLength = appointmentParts.reduce((acc, partType) => {
        const slotPart = getSlotPart(dwellingSize, partType, serviceType);
        acc.appointmentLength.minutes += slotPart;
        acc[`${partType}Length`] = {minutes: slotPart};
        return acc;
    }, {appointmentLength: {minutes: 0}})
    
    setAppointmentDetails(onsiteLength);
}, [serviceType, dwellingSize]);
```

**What It Does:**
1. Gets the `appointmentParts` array for the selected service type
2. Iterates through each part type (dataCollection, reportWriting, clientPresentation)
3. Calculates each part's time using `getSlotPart(dwellingSize, partType, serviceType)`
4. Accumulates into `appointmentDetails` object:
   - `appointmentLength.minutes` - total time
   - `dataCollectionLength.minutes` - individual part time
   - `reportWritingLength.minutes` - individual part time
   - `clientPresentationLength.minutes` - individual part time

**Output Structure:**
```javascript
appointmentDetails = {
    appointmentLength: {minutes: 120},  // Total
    dataCollectionLength: {minutes: 45},
    reportWritingLength: {minutes: 30},
    clientPresentationLength: {minutes: 45}
}
```

**Key Characteristics:**
- ✅ **Reactive:** Automatically recalculates when inputs change
- ✅ **Service-specific:** Uses service type to determine which parts to include
- ✅ **Individual part tracking:** Stores each part's time separately
- ✅ **Total aggregation:** Sums all parts into total appointment length

---

#### 1.2 Client Presence Detection (Lines 64-69)

**Pattern:** Determines if client presentation is needed based on service type.

```javascript
useEffect(() => {
    const {appointmentParts} = ServiceTypes[serviceType];
    const isClientPresent = appointmentParts.includes(PartTypes.CLIENT_PRESENTATION);
    setIsClientPresent(isClientPresent);
}, [serviceType])
```

**What It Does:**
- Checks if the service type includes `CLIENT_PRESENTATION` part
- Sets `isClientPresent` flag accordingly
- Used to determine if differential scheduling is needed

---

#### 1.3 Time Slot Generation (Lines 89-95)

**Pattern:** Generates available time slots when date or appointment details change.

```javascript
useEffect(() => {
    setTimeSlots(getTimeSlots(day, {
        startTime: [7, 0],      // 7:00 AM
        endTime: [21, 0],      // 9:00 PM
        appointmentDetails     // Contains calculated part lengths
    }))
}, [day, appointmentDetails]);
```

**What It Does:**
- Calls `getTimeSlots()` with selected date and calculated appointment details
- Uses hardcoded working hours (7 AM - 9 PM)
- Passes `appointmentDetails` which includes individual part lengths for differential scheduling

**Dependencies:**
- `day` - Selected date
- `appointmentDetails` - Calculated from service type and dwelling size

---

#### 1.4 Time Slot Selection Helpers (Lines 97-113)

**Pattern:** Helper functions to find and set time slot pairs (inspector + client).

```javascript
const getInspectorTimeSlot = useCallback(inspectorTimeStart => {
    return timeSlots.find(({inspectorAppointment}) => 
        inspectorAppointment.startLabel === inspectorTimeStart
    );
}, [timeSlots]);

const getClientTimeSlot = useCallback(clientTimeStart => {
    return timeSlots.find(({clientAppointment}) => 
        clientAppointment.startLabel === clientTimeStart
    );
}, [timeSlots]);

const setTimeSlot = useCallback(({inspectorStart, clientStart}) => {
    const timeSlotPair = inspectorStart
        ? getInspectorTimeSlot(inspectorStart)
        : getClientTimeSlot(clientStart)
    
    setSelectedTimeSlotPair(timeSlotPair);
    setInspectorTimeSlot(timeSlotPair.inspectorAppointment.startLabel)
    setClientTimeSlot(timeSlotPair.clientAppointment.startLabel);
}, [inspectorTimeSlot, clientTimeSlot, timeSlots]);
```

**What It Does:**
- Finds time slot pairs by inspector start time OR client start time
- Sets both inspector and client slots when either is selected
- Maintains synchronization between inspector and client slots

---

### State Management Pattern

**Complete State Structure:**
```javascript
{
    // Service Selection
    requester: RequesterTypes.BUYER,
    serviceType: ServiceTypeNames.BUYERS_INSPECTION,
    additionalServices: [],
    isClientPresent: true,
    
    // Property Details
    dwellingType: DwellingType.CONDO,
    dwellingSize: 0,
    address: '',
    // ... other property fields
    
    // Calculated Appointment Details (REACTIVE)
    appointmentDetails: {
        appointmentLength: {minutes: 0},
        dataCollectionLength: {minutes: 0},
        reportWritingLength: {minutes: 0},
        clientPresentationLength: {minutes: 0}
    },
    
    // Time Slots (REACTIVE)
    timeSlots: [],
    selectedTimeSlotPair: null,
    inspectorTimeSlot: '',
    clientTimeSlot: '',
    day: '',
    
    // Feature Flags (Future)
    minimizeInspectionTime: false,
    additionalPresentationTime: false
}
```

---

### Integration Points for Phase 6

**Vue.js Equivalent Pattern:**

```typescript
// In Vue composable (useAppointment.ts)
import { ref, computed, watch } from 'vue';
import { calculatePartTime } from '@/utils/scheduler/calculations/timeCalculation';
import { getTimeSlots } from '@/utils/scheduler/calculations/availabilityUtils';

export function useAppointment() {
    const serviceType = ref<ServiceType>(ServiceTypeNames.BUYERS_INSPECTION);
    const dwellingSize = ref<number>(0);
    
    // Reactive appointment details calculation
    const appointmentDetails = computed(() => {
        const serviceConfig = ServiceTypes[serviceType.value];
        const appointmentParts = serviceConfig.appointmentParts;
        
        return appointmentParts.reduce((acc, partType) => {
            const slotPart = calculatePartTime(
                dwellingSize.value,
                partType,
                serviceType.value
            );
            acc.appointmentLength.minutes += slotPart;
            acc[`${partType}Length`] = { minutes: slotPart };
            return acc;
        }, { appointmentLength: { minutes: 0 } });
    });
    
    // Reactive time slot generation
    const timeSlots = computed(() => {
        if (!selectedDay.value) return [];
        return getTimeSlots(selectedDay.value, {
            startTime: [7, 0],
            endTime: [21, 0],
            appointmentDetails: appointmentDetails.value
        });
    });
    
    return {
        serviceType,
        dwellingSize,
        appointmentDetails,
        timeSlots
    };
}
```

---

### Key Takeaways

1. **Reactive Calculation Chain:**
   ```
   Service Type + Dwelling Size 
     → Appointment Details (individual parts + total)
     → Time Slots (with differential scheduling)
   ```

2. **Individual Part Tracking:** Stores each part's time separately, not just total
3. **Service-Specific Parts:** Uses service type to determine which parts to calculate
4. **Automatic Recalculation:** Changes to inputs automatically trigger recalculation
5. **Differential Scheduling Support:** Calculates separate inspector and client slots

---

## 2. Marcel's Time Slot Calculation Logic

### Location
**GitHub Repository:** https://github.com/WillWhittakerDHP/Differential_Scheduler.git  
**Forked from:** marcelpeyton/Differential_Scheduler

**Key Files:**
- `server/src/utils/timeslots.ts` - Main TimeSlots class with calculation logic
- `client/src/data/timeData.ts` - Time data utilities
- `client/src/components/AvailableTimes.tsx` - Time slot display component

---

### 2.1 TimeSlots Class - Core Calculation Logic

**Location:** `server/src/utils/timeslots.ts`

**Purpose:** Manages available time periods, converts them to 15-minute time slots, and handles marking periods as busy.

**Class Structure:**
```typescript
export class TimeSlots {
  totalSchedule: TimePeriod;      // Initial time window
  occupiedTimes: TimePeriod[];     // Busy periods
  availableTimes: TimePeriod[];    // Available periods
}
```

**Key Interfaces:**
```typescript
export interface ClockTime {
  hours: number;
  minutes: number;
}

export interface TimePeriod {
  start: ClockTime;
  end: ClockTime;
  availability?: boolean;
}

interface TimeSlot {
  timeLeft: number;   // Minutes from midnight
  timeRight: number;  // Minutes from midnight
}
```

---

### 2.2 Core Calculation Methods

#### 2.2.1 Round Up to 15-Minute Increment

**Method:** `roundUpTo15Mark(time: ClockTime): ClockTime`

**Purpose:** Rounds a clock time up to the nearest 15-minute mark.

**Logic:**
```typescript
private roundUpTo15Mark(time: ClockTime): ClockTime {
  const minutes = this.clockTimeToMinutes(time);
  const hourMinutes = minutes - Math.floor(minutes/60)*60;
  const remainder = hourMinutes % 15;
  
  let roundedUp: number;
  if (remainder === 0) {
    roundedUp = hourMinutes;
  } else {
    roundedUp = hourMinutes + 15 - remainder;
  }
  
  if (roundedUp >= 60) {
    return {hours: Math.floor(minutes/60) + 1, minutes: 0};
  } else {
    return {hours: Math.floor(minutes/60), minutes: roundedUp};
  }
}
```

**Key Characteristics:**
- ✅ Rounds UP (never down)
- ✅ Always rounds to :00, :15, :30, or :45
- ✅ Handles hour rollover correctly

---

#### 2.2.2 Convert Time Period to 15-Minute Slots

**Method:** `convertTimePeriodToTimeSlots(period: TimePeriod): TimeSlot[]`

**Purpose:** Converts a time period into an array of 15-minute time slots.

**Logic:**
```typescript
public convertTimePeriodToTimeSlots(period: TimePeriod): TimeSlot[] {
  let timeSlots: TimeSlot[] = [];
  const start = this.roundUpTo15Mark(period.start);  // Round up start
  const end = this.roundUpTo15Mark(period.end);      // Round up end
  
  const differenceClockTime = {
    hours: Math.abs(end.hours - start.hours),
    minutes: Math.abs(end.minutes - start.minutes)
  };
  
  // Calculate number of 15-minute segments
  const numSeg = differenceClockTime.hours * 4 + differenceClockTime.minutes / 15;
  
  for (let x = 0; x <= numSeg; x++) {
    // Ensure slot doesn't go over period end
    if ((x + 1) * 15 + start.hours * 60 <= end.hours * 60 + end.minutes) {
      timeSlots.push({
        timeLeft: x * 15 + start.hours * 60,
        timeRight: (x + 1) * 15 + start.hours * 60
      });
    }
  }
  
  return timeSlots;
}
```

**Key Characteristics:**
- ✅ Rounds both start and end to nearest 15 minutes
- ✅ Creates 15-minute intervals
- ✅ Prevents slots from exceeding period end
- ✅ Returns slots as minutes from midnight

---

#### 2.2.3 Get Available Time Slots

**Method:** `getAvailableTimeSlots(): TimeSlot[]`

**Purpose:** Returns all available 15-minute time slots from `availableTimes` periods.

**Logic:**
```typescript
public getAvailableTimeSlots(): TimeSlot[] {
  let availability: TimeSlot[] = [];
  this.availableTimes.forEach((period) => {
    availability = availability.concat(
      this.convertTimePeriodToTimeSlots(period)
    );
  });
  return availability;
}
```

**Key Characteristics:**
- ✅ Aggregates slots from all available periods
- ✅ Returns flat array of 15-minute slots

---

#### 2.2.4 Mark Time Period as Busy

**Method:** `markTimePeriodBusy(period: TimePeriod)`

**Purpose:** Marks a time period as busy and updates available times accordingly.

**Logic:**
```typescript
public markTimePeriodBusy(period: TimePeriod) {
  if (!this.validateTimePeriodCanBeMarked(period)) {
    console.log("Validation failed! Overlapping times");
    return; // Do nothing if validation fails
  } else {
    this.occupiedTimes.push(period);
    this.changeAvailabilityArray(period);
  }
}
```

**Validation:** Checks for overlaps with existing occupied times before marking.

---

#### 2.2.5 Update Availability Array

**Method:** `changeAvailabilityArray(occupiedPeriod: TimePeriod)`

**Purpose:** Removes occupied period from available times, splitting periods if needed.

**Logic:**
1. Find all available periods that overlap with occupied period
2. For each overlapping period:
   - If period starts before occupied: create new period from period start to occupied start
   - If period ends after occupied: create new period from occupied end to period end
3. Remove original overlapping period
4. Insert new periods in correct order

**Key Characteristics:**
- ✅ Handles partial overlaps correctly
- ✅ Maintains sorted order of available periods
- ✅ Splits periods when needed

---

#### 2.2.6 Overlap Detection

**Method:** `doesTimePeriodsOverlap(period1: TimePeriod, period2: TimePeriod): boolean`

**Purpose:** Determines if two time periods overlap.

**Logic:**
```typescript
public doesTimePeriodsOverlap(period1: TimePeriod, period2: TimePeriod): boolean {
  const x1 = this.clockTimeToMinutes(period1.start) + 1;  // +1 to exclude edge collisions
  const x2 = this.clockTimeToMinutes(period1.end) - 1;
  
  const y1 = this.clockTimeToMinutes(period2.start);
  const y2 = this.clockTimeToMinutes(period2.end);
  
  // Check if ranges overlap
  return Math.max(x1, y1) <= Math.min(x2, y2);
}
```

**Key Characteristics:**
- ✅ Uses +1/-1 to exclude edge collisions (periods touching at edges don't overlap)
- ✅ Converts to minutes for easier comparison

---

#### 2.2.7 Duration Calculation

**Function:** `durationTimePeriod(period: TimePeriod): number`

**Purpose:** Calculates duration of a time period in minutes.

**Logic:**
```typescript
export const durationTimePeriod = function (period: TimePeriod): number {
  let { hours: h1, minutes: m1 } = period.start;
  let { hours: h2, minutes: m2 } = period.end;
  
  return Math.abs(h2 * 60 + m2 - (h1 * 60 + m1));
}
```

**Key Characteristics:**
- ✅ Returns duration in minutes
- ✅ Uses absolute value to handle edge cases

---

### 2.3 Helper Functions

#### Clock Time Conversions

**`clockTimeToMinutes(time: ClockTime): number`**
- Converts hours + minutes to total minutes
- Used internally for calculations

**`convertMinutesToClockTime(minutes: number): ClockTime`**
- Converts total minutes back to hours + minutes
- Used to convert calculated minutes back to clock time

**`formatClockTime(clockTime: ClockTime): string`**
- Formats clock time as "H:MM AM/PM"
- Used for display

---

### 2.4 Usage Pattern

**Example:**
```typescript
// Create time slots for a day (7 AM - 9 PM)
const testSchedule = {
  start: {hours: 7, minutes: 10},
  end: {hours: 21, minutes: 5}
};

const timeSlots = new TimeSlots(testSchedule);

// Mark busy periods
timeSlots.markTimePeriodBusy({
  start: {hours: 10, minutes: 0},
  end: {hours: 13, minutes: 0}
});

timeSlots.markTimePeriodBusy({
  start: {hours: 15, minutes: 0},
  end: {hours: 20, minutes: 0}
});

// Get available 15-minute slots
const availableSlots = timeSlots.getAvailableTimeSlots();
// Returns: Array of TimeSlot objects with timeLeft/timeRight in minutes
```

---

### 2.5 Key Differences from Other Approaches

| Aspect | Marcel's Approach | Jose's Approach | Server Approach |
|--------|------------------|-----------------|-----------------|
| **Time Format** | ClockTime (hours/minutes) | Date objects | Date objects |
| **Slot Size** | Fixed 15 minutes | Configurable (30 min default) | Configurable |
| **Rounding** | Round UP to :15 | Round UP to increment | Round UP to increment |
| **Storage** | Minutes from midnight | Date objects | Date objects |
| **Overlap Handling** | Edge-exclusive (+1/-1) | 30min padding | Real calendar data |
| **Complexity** | Medium | Low | High |

---

### 2.6 Integration Points for Phase 6

**Vue.js Equivalent Pattern:**
```typescript
// client-vue/src/utils/scheduler/calculations/timeSlotUtils.ts

export interface ClockTime {
  hours: number;
  minutes: number;
}

export interface TimePeriod {
  start: ClockTime;
  end: ClockTime;
}

export interface TimeSlot {
  timeLeft: number;   // Minutes from midnight
  timeRight: number;  // Minutes from midnight
}

export function roundUpTo15Minutes(time: ClockTime): ClockTime {
  // Marcel's rounding logic
}

export function convertTimePeriodToSlots(period: TimePeriod): TimeSlot[] {
  // Marcel's slot conversion logic
}

export function doesPeriodsOverlap(period1: TimePeriod, period2: TimePeriod): boolean {
  // Marcel's overlap detection logic
}
```

---

### 2.7 Marcel's Client-Side Components

**Location:** `client/src/components/` and `client/src/data/`

**Purpose:** React components and utilities for displaying available time slots and calendar integration in the UI.

**Key Files:**
- `client/src/components/AvailableTimes.tsx` - Main time slot display component
- `client/src/components/calendar.tsx` - Calendar date selection component
- `client/src/components/calendar.css` - Calendar styling
- `client/src/data/timeData.ts` - Time data utilities and test data generation

---

#### 2.7.1 AvailableTimes Component

**Location:** `client/src/components/AvailableTimes.tsx`

**Purpose:** Displays available time slots for inspector and client, with toggle between views and time slot selection.

**Component Structure:**
```typescript
interface AvailableTimesProps {
  activeView: "Inspector" | "Client";
  inspectorTimes: DaysWithRanges;
  clientTimes: DaysWithRanges;
  selectedDate: Date | null;
}
```

**Key Features:**

1. **Inspector/Client View Toggle:**
   - Toggle button to switch between Inspector and Client time views
   - Each view displays time slots specific to that role
   - Active view state managed with `useState`

2. **Time Slot Display:**
   - Retrieves time periods from `DaysWithRanges` map using selected date
   - Formats time periods using `formatClockTime()` from server utils
   - Displays time slots in a responsive grid layout
   - Dynamic column count (default: 5 columns)

3. **Time Selection:**
   - Click handler for selecting time slots
   - Stores selected `TimePeriod` in component state
   - Calculates duration of selected time period using `durationTimePeriod()`

4. **Duration Visualization:**
   - Shows duration bar when a time slot is selected
   - Displays inspector and client duration bars separately
   - Visual representation of appointment length

**Key Logic:**
```typescript
// Get time periods for selected date
const selDay = times.daysMap.get(selectedDate.toISOString())
const periods: TimePeriod[] = []
selDay?.forEach((period) => {
  time.push(`${formatClockTime(period.start)} - ${formatClockTime(period.end)}`)
  periods.push(period)
})

// Calculate duration
const duration = selectedTime && selectedTime.start && selectedTime.end
  ? durationTimePeriod(selectedTime)
  : 0;
```

**Dependencies:**
- Uses `TimePeriod`, `formatClockTime`, `durationTimePeriod` from `server/src/utils/timeslots`
- Uses `DaysWithRanges` interface from `calendar.tsx`
- Integrates with calendar component for date selection

**Key Characteristics:**
- ✅ **Dual View Support:** Separate inspector and client time displays
- ✅ **Date-Based Filtering:** Uses selected date to filter available times
- ✅ **Visual Feedback:** Highlights selected time slot and shows duration
- ✅ **Responsive Grid:** Dynamic column layout based on number of slots
- ✅ **Server Integration:** Uses server-side TimeSlots utilities for formatting

---

#### 2.7.2 Calendar Component

**Location:** `client/src/components/calendar.tsx`

**Purpose:** Calendar date picker that displays available dates and integrates with AvailableTimes component.

**Component Structure:**
```typescript
interface CalendarProps {
  inspectorTimes: DaysWithRanges;
  clientTimes: DaysWithRanges;
}

interface DaysWithRanges {
  daysMap: Map<string, TimePeriod[]>
}
```

**Key Features:**

1. **Month Navigation:**
   - Previous/Next month buttons
   - Displays current month and year
   - Prevents navigation to past months

2. **Date Selection:**
   - Click handler for selecting dates
   - Highlights selected date
   - Passes selected date to AvailableTimes component

3. **Availability Indicators:**
   - Checks `inspectorTimes.daysMap` for available time periods
   - Marks days with available times visually
   - Prevents selection of past dates

4. **Calendar Rendering:**
   - Renders calendar grid with proper day alignment
   - Handles empty cells for days before month start
   - Applies CSS classes for styling (past, available, selected)

**Key Logic:**
```typescript
// Check if day has available times
let hasAvailableTime: boolean;
let valid = inspectorTimes.daysMap.get(cellDate.toISOString())
if(valid?.length && !isPastDay){
  hasAvailableTime = valid.length > 0
} else {
  hasAvailableTime = false
}

// Render calendar cells
calendarDays.push(
  <div
    className={`calendar-cell 
      ${isPastDay ? "past" : ""} 
      ${hasAvailableTime ? "available" : ""} 
      ${isSelected ? "selected" : ""}`}
    onClick={!isPastDay ? () => handleSelectDay(day) : undefined}
  >
    {day}
  </div>
);
```

**Key Characteristics:**
- ✅ **Availability Integration:** Uses DaysWithRanges to show available dates
- ✅ **Date Validation:** Prevents selection of past dates
- ✅ **Visual Indicators:** CSS classes for past/available/selected states
- ✅ **Month Navigation:** Handles month/year changes correctly

---

#### 2.7.3 Time Data Utilities

**Location:** `client/src/data/timeData.ts`

**Purpose:** Utility functions for generating and managing time data, including test data generation.

**Key Functions:**

1. **`getRandomData()`:**
   - Generates random time periods for testing
   - Creates 31 days of random availability data
   - Returns `Map<string, TimePeriod[]>` keyed by ISO date strings

**Logic:**
```typescript
export const getRandomData = () => {
  const days_keys: Date[] = []
  for(let x = 1; x<=31; x++){
    days_keys.push(new Date(2024, 11, x))
  }
  
  const values: [TimePeriod[]] = [[]];
  
  for (let i = 0; i < 31; i++) {
    const periods: TimePeriod[] = [];
    const length = Math.floor(Math.random() * 16); // 0-15 periods
    
    let currentHours = 0;
    let currentMinutes = 0;
    
    for (let j = 0; j < length; j++) {
      const durationHours = Math.floor(Math.random() * 6); // 0-5 hours
      const durationMinutes = Math.floor(Math.random() * 60); // 0-59 minutes
      
      const start = { hours: currentHours, minutes: currentMinutes };
      
      let endMinutes = currentMinutes + durationMinutes;
      let endHours = currentHours + durationHours;
      
      if (endMinutes >= 60) {
        endMinutes -= 60;
        endHours += 1;
      }
      
      if (endHours >= 24) break;
      
      const end = { hours: endHours, minutes: endMinutes };
      periods.push({ start, end });
      
      currentHours = endHours;
      currentMinutes = endMinutes;
    }
    
    values.push(periods);
  }
  
  const scheduleMap: Map<string, TimePeriod[]> = new Map();
  days_keys.forEach((key, index) => {
    scheduleMap.set(key.toISOString(), values[index]);
  });
  
  return scheduleMap
}
```

2. **Exported Data:**
   - `inspectorTimes: DaysWithRanges` - Test data for inspector availability
   - `clientTimes: DaysWithRanges` - Test data for client availability

**Key Characteristics:**
- ✅ **Test Data Generation:** Creates realistic random time periods
- ✅ **Map Structure:** Uses Map for efficient date lookups
- ✅ **Time Period Creation:** Generates sequential, non-overlapping periods
- ✅ **Boundary Handling:** Prevents periods from exceeding 24 hours

---

#### 2.7.4 Component Integration Pattern

**Data Flow:**
```
Server TimeSlots Class
  └─> Generates TimePeriod[] arrays
       └─> Stored in DaysWithRanges.daysMap
            └─> Calendar Component
                 └─> Displays available dates
                      └─> User selects date
                           └─> AvailableTimes Component
                                └─> Displays time slots for selected date
                                     └─> User selects time slot
                                          └─> Duration calculated and displayed
```

**Integration Points:**

1. **Calendar → AvailableTimes:**
   - Calendar passes `selectedDate` to AvailableTimes
   - AvailableTimes uses date to look up time periods from `DaysWithRanges`

2. **Server Utils → Client Components:**
   - Client components import `TimePeriod`, `formatClockTime`, `durationTimePeriod` from server
   - Ensures consistent time formatting across server and client

3. **Data Structure:**
   - `DaysWithRanges` interface connects calendar and time display
   - Map structure allows efficient date-based lookups
   - ISO date strings used as keys for consistency

---

#### 2.7.5 Vue.js Migration Notes

**Component Equivalents:**

**React (Marcel's Components):**
```typescript
// AvailableTimes.tsx
const [selectedTime, setSelectedTime] = useState<TimePeriod | null>(null);
const [activeView, setActiveView] = useState<"Inspector" | "Client">("Inspector");
```

**Vue.js Equivalent:**
```typescript
// AvailableTimes.vue
const selectedTime = ref<TimePeriod | null>(null);
const activeView = ref<"Inspector" | "Client">("Inspector");
```

**Calendar Integration:**
```typescript
// Vue composable pattern
export function useCalendar() {
  const selectedDate = ref<Date | null>(null);
  const currentDate = ref(new Date());
  
  const hasAvailableTime = computed((date: Date) => {
    const periods = inspectorTimes.value.daysMap.get(date.toISOString());
    return periods && periods.length > 0;
  });
  
  return {
    selectedDate,
    currentDate,
    hasAvailableTime
  };
}
```

**Key Migration Considerations:**
- ✅ Replace `useState` with `ref` for reactive state
- ✅ Use `computed` for derived values (hasAvailableTime)
- ✅ Use Vuetify calendar components or custom calendar
- ✅ Maintain `DaysWithRanges` interface structure
- ✅ Keep server utility imports for time formatting

---

## 3. Cascading Filter Logic (listMaker.tsx)

### Location
`client/src/scheduler/components/listMaker.tsx`

### Purpose
Implements cascading filter logic that connects parent/child block profiles. When a parent block is selected, only its child blocks are shown.

### Key Logic

#### 3.1 Two-Stage Filtering

**Stage 1: Filter by Block Type**
```typescript
const filteredByType = useMemo(() => {
  return schedulerEntities.filter(entity => 
    entity.blockType === blockType
  );
}, [blockType, schedulerEntities]);
```

**Stage 2: Cascading Filter (Lines 36-70)**
```typescript
const formBlocks = useMemo(() => {
  // If cascading not required, show all blocks of this type
  if (!activeChildRequired) {
    return filteredByType;
  }
  
  // Get relevant parent blocks
  const relevantParents = parentBlockType
    ? selectedBlocks.filter(block => block.blockType === parentBlockType)
    : selectedBlocks;
  
  // If no parents selected, show nothing
  if (relevantParents.length === 0) {
    return [];
  }
  
  // Collect all allowed child IDs from parent blocks
  const allowedIds = new Set(
    relevantParents.flatMap(block => block.activeBlockIds)
  );
  
  // Filter to only show blocks in allowedIds
  return filteredByType.filter(block => allowedIds.has(block.id));
}, [activeChildRequired, selectedBlocks, filteredByType, blockType, parentBlockType]);
```

### Use Cases

**Example 1: User Type → Service Type**
- User selects "Buyer" (parent block)
- Service types (child blocks) populate based on `activeBlockIds` from "Buyer"
- Only services available to buyers are shown

**Example 2: Service Type → Additional Services**
- User selects "Buyer's Inspection" (parent block)
- Additional services (child blocks) populate based on `activeBlockIds`
- Only additional services compatible with "Buyer's Inspection" are shown

### Key Characteristics

- ✅ **Reactive:** Uses `useMemo` to recalculate when dependencies change
- ✅ **Parent-Child Relationships:** Uses `activeBlockIds` from `SchedulerBlockProfile`
- ✅ **Optional Cascading:** Can be disabled with `activeChildRequired={false}`
- ✅ **Type-Specific Parents:** Can filter by specific parent type with `parentBlockType` prop
- ✅ **Empty State Handling:** Shows nothing if no parents selected

### Data Flow

```
User selects parent block
  └─> selectedBlocks updated in context
       └─> listMaker recalculates formBlocks
            └─> Filters by blockType (Stage 1)
                 └─> Filters by activeBlockIds from parents (Stage 2)
                      └─> Only child blocks shown
```

### Integration Points for Phase 6

**Vue.js Equivalent:**
```typescript
// client-vue/src/composables/useCascadingFilter.ts
import { computed, Ref } from 'vue';
import { SchedulerBlockProfile } from '@/types/scheduler';

export function useCascadingFilter(
  blockType: Ref<string>,
  selectedBlocks: Ref<SchedulerBlockProfile[]>,
  allBlocks: Ref<SchedulerBlockProfile[]>,
  options: {
    activeChildRequired?: boolean;
    parentBlockType?: string;
  }
) {
  // Stage 1: Filter by type
  const filteredByType = computed(() => {
    return allBlocks.value.filter(block => 
      block.blockType === blockType.value
    );
  });
  
  // Stage 2: Cascading filter
  const formBlocks = computed(() => {
    if (!options.activeChildRequired) {
      return filteredByType.value;
    }
    
    const relevantParents = options.parentBlockType
      ? selectedBlocks.value.filter(b => b.blockType === options.parentBlockType)
      : selectedBlocks.value;
    
    if (relevantParents.length === 0) {
      return [];
    }
    
    const allowedIds = new Set(
      relevantParents.flatMap(block => block.activeBlockIds)
    );
    
    return filteredByType.value.filter(block => 
      allowedIds.has(block.id)
    );
  });
  
  return { formBlocks };
}
```

---

## 4. Summary of All Logic

### Jose's Work
- ✅ Reactive appointment details calculation
- ✅ Service-specific part selection
- ✅ Individual part time tracking
- ✅ Time slot generation with differential scheduling

### Marcel's Work
- ✅ TimeSlots class for managing available/occupied periods (server-side)
- ✅ 15-minute slot conversion with rounding
- ✅ Overlap detection and busy period marking
- ✅ Duration calculations
- ✅ Clock time utilities
- ✅ AvailableTimes component for time slot display (client-side)
- ✅ Calendar component for date selection (client-side)
- ✅ Time data utilities for test data generation
- ✅ Inspector/Client view toggle pattern
- ✅ DaysWithRanges interface for date-based time lookups

### Cascading Filter Logic (listMaker)
- ✅ Parent-child block filtering
- ✅ Two-stage filtering (type → cascading)
- ✅ Reactive recalculation

---

## 5. Integration Checklist for Phase 6

### From Jose's Hook
- [ ] Implement reactive calculation pattern in Vue composable
- [ ] Track individual part times separately
- [ ] Service-specific part selection
- [ ] Time slot generation integration

### From Marcel's TimeSlots Class (Server-Side)
- [ ] Implement 15-minute rounding function
- [ ] Implement time period to slots conversion
- [ ] Implement overlap detection
- [ ] Implement busy period marking logic
- [ ] Clock time conversion utilities

### From Marcel's Client-Side Components
- [ ] Implement AvailableTimes component in Vue
- [ ] Implement Calendar component with date selection
- [ ] Implement DaysWithRanges interface
- [ ] Implement Inspector/Client view toggle
- [ ] Implement time slot selection and duration display
- [ ] Integrate calendar with time slot display
- [ ] Port time data utilities for testing

### From Cascading Filter Logic
- [ ] Implement two-stage filtering (type → cascading)
- [ ] Use `activeBlockIds` for parent-child relationships
- [ ] Handle empty state when no parents selected
- [ ] Support optional cascading

---

## 6. Code Examples for Phase 6

### Example: Combined Approach

```typescript
// client-vue/src/utils/scheduler/calculations/timeSlotCalculation.ts

import { ClockTime, TimePeriod, TimeSlot } from './types';

/**
 * Marcel's rounding logic - rounds UP to nearest 15 minutes
 */
export function roundUpTo15Minutes(time: ClockTime): ClockTime {
  const totalMinutes = time.hours * 60 + time.minutes;
  const hourMinutes = totalMinutes % 60;
  const remainder = hourMinutes % 15;
  
  const roundedUp = remainder === 0 
    ? hourMinutes 
    : hourMinutes + 15 - remainder;
  
  if (roundedUp >= 60) {
    return { hours: Math.floor(totalMinutes / 60) + 1, minutes: 0 };
  } else {
    return { hours: Math.floor(totalMinutes / 60), minutes: roundedUp };
  }
}

/**
 * Marcel's slot conversion - creates 15-minute slots from time period
 */
export function convertTimePeriodToSlots(period: TimePeriod): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const start = roundUpTo15Minutes(period.start);
  const end = roundUpTo15Minutes(period.end);
  
  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;
  const numSegments = Math.floor((endMinutes - startMinutes) / 15);
  
  for (let i = 0; i <= numSegments; i++) {
    const slotStart = startMinutes + (i * 15);
    const slotEnd = slotStart + 15;
    
    if (slotEnd <= endMinutes) {
      slots.push({
        timeLeft: slotStart,
        timeRight: slotEnd
      });
    }
  }
  
  return slots;
}

/**
 * Marcel's overlap detection
 */
export function doesPeriodsOverlap(
  period1: TimePeriod,
  period2: TimePeriod
): boolean {
  const p1Start = period1.start.hours * 60 + period1.start.minutes + 1;
  const p1End = period1.end.hours * 60 + period1.end.minutes - 1;
  const p2Start = period2.start.hours * 60 + period2.start.minutes;
  const p2End = period2.end.hours * 60 + period2.end.minutes;
  
  return Math.max(p1Start, p2Start) <= Math.min(p1End, p2End);
}
```

---

## 7. References

### Jose's Work
- **Hook:** `/Users/districthomepro/Bonsai/Jose-Scheduler-Reference/src/hooks/useAppointment.js`
- **Utils:** `getSlotPart.js`, `getTimeSlots.js`
- **Constants:** `constants/Appointment.js`

### Marcel's Work
- **GitHub Repository:** https://github.com/WillWhittakerDHP/Differential_Scheduler.git
- **Forked from:** https://github.com/marcelpeyton/Differential_Scheduler

**Server-Side:**
- **TimeSlots Class:** `server/src/utils/timeslots.ts` - Core calculation logic

**Client-Side Components:**
- **AvailableTimes Component:** `client/src/components/AvailableTimes.tsx` - Time slot display
- **Calendar Component:** `client/src/components/calendar.tsx` - Date selection
- **Calendar Styles:** `client/src/components/calendar.css` - Calendar styling

**Client-Side Utilities:**
- **Time Data:** `client/src/data/timeData.ts` - Test data generation utilities

### Cascading Filter
- **Component:** `client/src/scheduler/components/listMaker.tsx`
- **Context:** `client/src/scheduler/contexts/schedulerContext.tsx`

---

## 8. Next Steps

1. **Review Marcel's TimeSlots Class (Server-Side):**
   - Understand all methods and edge cases
   - Identify what to port vs what to adapt

2. **Review Marcel's Client-Side Components:**
   - Understand AvailableTimes component structure and props
   - Review Calendar component date selection logic
   - Understand DaysWithRanges interface and Map structure
   - Review time data utilities for testing

3. **Integrate Rounding Logic:**
   - Use Marcel's `roundUpTo15Minutes` for time calculations
   - Consider making increment configurable (15, 30, etc.)

4. **Port Client Components to Vue:**
   - Convert AvailableTimes component to Vue with Vuetify
   - Convert Calendar component or use Vuetify calendar
   - Implement DaysWithRanges interface in TypeScript
   - Create Vue composables for calendar and time selection

5. **Implement Cascading Filters:**
   - Port listMaker logic to Vue composable
   - Test parent-child relationships

6. **Combine Approaches:**
   - Use Jose's reactive pattern for appointment details
   - Use Marcel's slot conversion for availability
   - Use cascading filters for service selection

7. **Phase 6 Implementation:**
   - Create unified calculation utilities
   - Integrate into Vue wizard components
   - Test end-to-end flow

---

**Last Updated:** 2025-01-19  
**Status:** 
- ✅ Jose's hook documented
- ✅ Marcel's TimeSlots class documented (server-side)
- ✅ Marcel's client-side components documented (AvailableTimes, Calendar, timeData)
- ✅ Cascading filter logic documented
- ✅ Ready for Phase 6 integration


