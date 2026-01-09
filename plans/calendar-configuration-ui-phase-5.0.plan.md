# Calendar Configuration UI - Phase 5.0 Implementation Plan

## Overview

Build admin interface for configuring which calendars the app checks for free-busy calculations. This phase establishes the configuration foundation before Google Calendar API integration (Phase 5.1).

**Feature:** Google APIs Integration (Feature 5)  
**Phase:** 5.0 (Prerequisite)  
**Status:** Planning  
**Created:** 2025-01-07

## Problem Statement

The scheduler needs to check multiple calendars (inspector, assistant, etc.) for free-busy information when calculating available time slots. Before implementing the Google Calendar API integration, we need:

1. A way for admins to configure which calendar email addresses to check
2. A toggle to enable/disable calendar integration
3. A provider selection for future multi-provider support (Google, Outlook)
4. Settings persistence that integrates with existing availability settings

## Architecture Decisions

### Calendar Configuration Storage

**Decision:** Extend existing `AvailabilitySettings` interface with `CalendarConfig`

**Rationale:**
- Leverages existing settings infrastructure (business-settings API)
- Single source of truth for availability configuration
- Consistent with existing admin settings patterns
- Automatic persistence via existing API endpoints

**Alternative Considered:** Separate calendar settings table
- Rejected: Would fragment settings and require new API endpoints

### Provider Plugin Architecture

**Decision:** Design for multi-provider support from the start

**Rationale:**
- Google Calendar is primary but Outlook may be needed
- Clean separation allows adding providers without major refactoring
- Future-proofs the architecture

**Structure:**
```typescript
interface CalendarConfig {
  enabled: boolean
  provider: 'google' | 'outlook' | 'none'
  calendarEmails: string[]
}
```

### UI Location

**Decision:** Add Calendar Configuration section to Business Controls tab

**Rationale:**
- Consistent with existing availability settings location
- Admins already go here for scheduling configuration
- Logical grouping with business hours and time increments

## Data Structures

### CalendarConfig Interface

```typescript
// client-vue/src/configs/availabilitySettings.ts

/**
 * Calendar configuration for free-busy calculations
 * LEARNING: Configures which calendars to check for busy times
 * WHY: Enables admin to manage calendar integration settings
 * PATTERN: Provider-agnostic design for plugin system
 */
export interface CalendarConfig {
  /**
   * Whether calendar integration is enabled
   * LEARNING: Toggle to enable/disable calendar checking
   * WHY: Allows disabling without removing configuration
   */
  enabled: boolean
  
  /**
   * Calendar integration provider
   * LEARNING: Which calendar service to use
   * WHY: Enables plugin/extension architecture
   */
  provider: 'google' | 'outlook' | 'none'
  
  /**
   * Email addresses of calendars to check
   * LEARNING: List of calendar emails to query for busy times
   * WHY: Allows admin to configure which calendars affect availability
   */
  calendarEmails: string[]
}
```

### Extended AvailabilitySettings

```typescript
export interface AvailabilitySettings {
  // Existing fields...
  businessHours: {
    0: DayHours // Sunday
    1: DayHours // Monday
    2: DayHours // Tuesday
    3: DayHours // Wednesday
    4: DayHours // Thursday
    5: DayHours // Friday
    6: DayHours // Saturday
  }
  minuteIncrement: number
  leadTime: number
  
  // New field
  /**
   * Calendar configuration for free-busy calculations
   * LEARNING: Configures which calendars to check for busy times
   * WHY: Enables calendar integration for accurate availability
   */
  calendarConfig?: CalendarConfig
}
```

## Implementation Steps

### Session 5.0.1: Calendar Configuration Data Structure

**Goal:** Extend AvailabilitySettings with CalendarConfig type

**Files to Modify:**
- `client-vue/src/configs/availabilitySettings.ts`

**Tasks:**

1. **Define CalendarConfig Interface**
   - Add CalendarConfig type with enabled, provider, calendarEmails fields
   - Add JSDoc comments with LEARNING/WHY/PATTERN annotations
   - Export CalendarConfig type

2. **Extend AvailabilitySettings Interface**
   - Add optional calendarConfig field to AvailabilitySettings
   - Add JSDoc comments explaining the field

3. **Update Default Settings**
   - Add default calendarConfig to defaultAvailabilitySettings
   - Default: enabled: false, provider: 'none', calendarEmails: []

4. **Add Email Validation Utility**
   - Create isValidEmail() utility function
   - Create validateCalendarEmails() function for array validation

**Implementation:**

```typescript
// New CalendarConfig type
export interface CalendarConfig {
  enabled: boolean
  provider: 'google' | 'outlook' | 'none'
  calendarEmails: string[]
}

// Default calendar config
export const defaultCalendarConfig: CalendarConfig = {
  enabled: false,
  provider: 'none',
  calendarEmails: []
}

// Update default settings
export const defaultAvailabilitySettings: AvailabilitySettings = {
  // ... existing fields ...
  calendarConfig: { ...defaultCalendarConfig }
}

// Validation utilities
export function isValidCalendarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function validateCalendarEmails(emails: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = []
  const invalid: string[] = []
  for (const email of emails) {
    if (isValidCalendarEmail(email)) {
      valid.push(email.trim())
    } else {
      invalid.push(email.trim())
    }
  }
  return { valid, invalid }
}
```

**Success Criteria:**
- [ ] CalendarConfig interface defined and exported
- [ ] AvailabilitySettings includes optional calendarConfig field
- [ ] Default settings include calendarConfig with safe defaults
- [ ] Email validation utilities working
- [ ] TypeScript compiles without errors

---

### Session 5.0.2: Calendar Management UI

**Goal:** Add calendar configuration section to Business Controls tab

**Files to Modify:**
- `client-vue/src/views/admin/tabs/BusinessControlsTab.vue`

**Tasks:**

1. **Add Calendar Config to Form Data**
   - Initialize calendarConfig in formData ref
   - Handle loading calendarConfig from API response
   - Handle calendarConfig not existing in older settings

2. **Create Calendar Emails Text Ref**
   - Add calendarEmailsText ref for textarea binding
   - Create sync functions for textarea ↔ array conversion

3. **Add UI Section**
   - Add new VCard section after Lead Time
   - Add enable/disable VSwitch
   - Add provider VSelect (disabled when not enabled)
   - Add email textarea (disabled when not enabled or provider is 'none')
   - Add connected calendars chip display
   - Add informational VAlert about upcoming OAuth

4. **Add Validation**
   - Email format validation on textarea
   - Show validation errors

5. **Wire Up Save/Load**
   - Include calendarConfig in saveSettings()
   - Include calendarConfig in loadSettings()
   - Handle missing calendarConfig gracefully

**UI Template Structure:**

```vue
<!-- Calendar Configuration Section -->
<VCard variant="outlined" class="mb-4">
  <VCardTitle class="text-h6">Calendar Integration</VCardTitle>
  <VCardSubtitle class="text-caption">
    Configure which calendars to check for free-busy calculations
  </VCardSubtitle>
  <VCardText>
    <!-- Enable/Disable Toggle -->
    <VSwitch
      v-model="formData.calendarConfig.enabled"
      label="Enable Calendar Integration"
      class="mb-4"
    />
    
    <!-- Provider Selection -->
    <VSelect
      v-model="formData.calendarConfig.provider"
      :items="calendarProviderOptions"
      label="Calendar Provider"
      :disabled="!formData.calendarConfig.enabled"
      class="mb-4"
    />
    
    <!-- Calendar Emails (only when enabled and provider selected) -->
    <template v-if="formData.calendarConfig.enabled && formData.calendarConfig.provider !== 'none'">
      <div class="text-subtitle-2 mb-2">Calendar Email Addresses</div>
      <div class="text-caption mb-2 text-medium-emphasis">
        Enter email addresses of calendars to check for busy times (one per line)
      </div>
      
      <VTextarea
        v-model="calendarEmailsText"
        label="Calendar Emails"
        placeholder="inspector@example.com&#10;assistant@example.com"
        rows="4"
        :rules="calendarEmailRules"
        @update:model-value="syncCalendarEmailsToArray"
      />
      
      <!-- Connected Calendars Display -->
      <div v-if="formData.calendarConfig.calendarEmails.length > 0" class="mt-4">
        <div class="text-subtitle-2 mb-2">
          Connected Calendars ({{ formData.calendarConfig.calendarEmails.length }}):
        </div>
        <VChip
          v-for="(email, index) in formData.calendarConfig.calendarEmails"
          :key="index"
          class="ma-1"
          closable
          size="small"
          @click:close="removeCalendarEmail(index)"
        >
          {{ email }}
        </VChip>
      </div>
      
      <!-- OAuth Coming Soon Alert -->
      <VAlert
        type="info"
        variant="tonal"
        class="mt-4"
        density="compact"
      >
        <template #prepend>
          <VIcon size="small">mdi-information</VIcon>
        </template>
        <div class="text-caption">
          <strong>Coming Soon:</strong> OAuth connection for automatic calendar linking.
          For now, enter calendar email addresses manually.
        </div>
      </VAlert>
    </template>
  </VCardText>
</VCard>
```

**Script Logic:**

```typescript
// Provider options
const calendarProviderOptions = [
  { title: 'None', value: 'none' },
  { title: 'Google Calendar', value: 'google' },
  { title: 'Microsoft Outlook', value: 'outlook' }
]

// Calendar emails as text (for textarea binding)
const calendarEmailsText = ref('')

// Validation rules
const calendarEmailRules = [
  (v: string) => {
    if (!formData.value.calendarConfig?.enabled) return true
    if (!v || !v.trim()) return true // Empty is valid
    const lines = v.split('\n').filter(line => line.trim())
    const invalidEmails = lines.filter(line => 
      line.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line.trim())
    )
    return invalidEmails.length === 0 || `Invalid email format: ${invalidEmails.join(', ')}`
  }
]

// Sync textarea to array
const syncCalendarEmailsToArray = () => {
  if (!formData.value.calendarConfig) return
  formData.value.calendarConfig.calendarEmails = calendarEmailsText.value
    .split('\n')
    .map(e => e.trim())
    .filter(e => e.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
}

// Remove email chip
const removeCalendarEmail = (index: number) => {
  if (formData.value.calendarConfig) {
    formData.value.calendarConfig.calendarEmails.splice(index, 1)
    calendarEmailsText.value = formData.value.calendarConfig.calendarEmails.join('\n')
  }
}

// Initialize calendarConfig in loadSettings
const initializeCalendarConfig = () => {
  if (!formData.value.calendarConfig) {
    formData.value.calendarConfig = {
      enabled: false,
      provider: 'none',
      calendarEmails: []
    }
  }
  calendarEmailsText.value = formData.value.calendarConfig.calendarEmails.join('\n')
}
```

**Success Criteria:**
- [ ] Calendar configuration section displays in Business Controls tab
- [ ] Enable/disable toggle works
- [ ] Provider selection works (disabled when not enabled)
- [ ] Email textarea works with validation
- [ ] Chips display and can be removed
- [ ] Settings persist on save
- [ ] Settings load correctly on page load
- [ ] Informational alert displays

---

### Session 5.0.3: Integration Preparation

**Goal:** Update getCalendarAvailability to use settings and prepare plugin architecture

**Files to Modify:**
- `client-vue/src/utils/timeSlotCalculations.ts`
- `client-vue/src/utils/calendar/` (new directory)

**Tasks:**

1. **Update getCalendarAvailability**
   - Read calendarConfig from settings (via getAvailabilitySettings)
   - Log calendar configuration usage for debugging
   - Return empty array if calendar integration disabled
   - Add TODO comments for provider implementation

2. **Create Calendar Provider Interface Structure**
   - Create `client-vue/src/utils/calendar/` directory
   - Create `calendarProvider.ts` with abstract interface
   - Create `index.ts` for exports
   - Add documentation for future implementation

3. **Add Calendar Service Factory Placeholder**
   - Create factory function that returns appropriate provider
   - Currently returns null/stub provider
   - Document how to add new providers

**Updated getCalendarAvailability:**

```typescript
// client-vue/src/utils/timeSlotCalculations.ts

/**
 * Get calendar availability (busy times from configured calendars)
 * LEARNING: Structure for calendar integration
 * WHY: Enables filtering out busy times when generating slots
 * PATTERN: Reads from settings, ready for calendar provider integration
 * 
 * @param dateRange - Object with start and end ISO date strings
 * @returns Array of busy time ranges (currently empty - Phase 5.1 will implement)
 */
export async function getCalendarAvailability(
  dateRange: { start: string; end: string }
): Promise<Array<{ start: string; end: string }>> {
  // Get calendar configuration from settings
  const settings = await getAvailabilitySettings()
  const calendarConfig = settings.calendarConfig
  
  // If calendar integration is disabled, return empty (all times available)
  if (!calendarConfig?.enabled || calendarConfig.provider === 'none') {
    console.debug('[CalendarAvailability] Calendar integration disabled, all times available')
    return []
  }
  
  // If no calendar emails configured, return empty
  if (!calendarConfig.calendarEmails || calendarConfig.calendarEmails.length === 0) {
    console.debug('[CalendarAvailability] No calendars configured, all times available')
    return []
  }
  
  // Log configured calendars for debugging
  console.debug('[CalendarAvailability] Checking calendars:', {
    provider: calendarConfig.provider,
    emails: calendarConfig.calendarEmails,
    dateRange
  })
  
  // TODO: Phase 5.1 - Implement calendar provider factory and free-busy query
  // const provider = getCalendarProvider(calendarConfig.provider)
  // if (provider) {
  //   return await provider.getFreeBusy(calendarConfig.calendarEmails, dateRange)
  // }
  
  // For now, return empty array (all times available)
  // Phase 5.1 will implement actual calendar API integration
  return []
}
```

**Calendar Provider Interface:**

```typescript
// client-vue/src/utils/calendar/calendarProvider.ts

/**
 * Calendar Provider Interface
 * LEARNING: Abstract interface for calendar integrations
 * WHY: Enables plugin architecture for multiple providers (Google, Outlook)
 * PATTERN: Factory pattern with provider implementations
 * 
 * Phase 5.0: Interface definition only
 * Phase 5.1: Google Calendar implementation
 * Future: Outlook Calendar implementation
 */

export interface CalendarBusyTime {
  start: string  // ISO date string
  end: string    // ISO date string
}

export interface CalendarEvent {
  id?: string
  summary: string
  description?: string
  start: string  // ISO date string
  end: string    // ISO date string
  attendees?: string[]  // Email addresses
  location?: string
}

/**
 * Calendar Provider Interface
 * Implemented by each calendar service (Google, Outlook, etc.)
 */
export interface CalendarProvider {
  /**
   * Provider identifier
   */
  readonly provider: 'google' | 'outlook'
  
  /**
   * Check if provider is authenticated
   * @returns Promise<boolean> - True if authenticated
   */
  isAuthenticated(): Promise<boolean>
  
  /**
   * Initiate authentication flow
   * @returns Promise<boolean> - True if authentication successful
   */
  authenticate(): Promise<boolean>
  
  /**
   * Get free-busy information for calendars
   * @param calendarEmails - Email addresses of calendars to check
   * @param dateRange - Date range to check
   * @returns Promise<CalendarBusyTime[]> - Array of busy time ranges
   */
  getFreeBusy(
    calendarEmails: string[],
    dateRange: { start: string; end: string }
  ): Promise<CalendarBusyTime[]>
  
  /**
   * Create a calendar event
   * @param calendarEmail - Calendar to create event in
   * @param event - Event data
   * @returns Promise<CalendarEvent> - Created event with ID
   */
  createEvent(
    calendarEmail: string,
    event: CalendarEvent
  ): Promise<CalendarEvent>
}

/**
 * Get calendar provider for specified type
 * LEARNING: Factory function for calendar providers
 * WHY: Centralizes provider instantiation
 * PATTERN: Factory pattern
 * 
 * @param provider - Provider type ('google' | 'outlook')
 * @returns CalendarProvider | null
 */
export function getCalendarProvider(
  provider: 'google' | 'outlook' | 'none'
): CalendarProvider | null {
  // TODO: Phase 5.1 - Implement Google Calendar provider
  // TODO: Future - Implement Outlook Calendar provider
  
  switch (provider) {
    case 'google':
      // return new GoogleCalendarProvider()
      console.debug('[CalendarProvider] Google Calendar provider not yet implemented')
      return null
    case 'outlook':
      // return new OutlookCalendarProvider()
      console.debug('[CalendarProvider] Outlook Calendar provider not yet implemented')
      return null
    case 'none':
    default:
      return null
  }
}
```

**Success Criteria:**
- [ ] getCalendarAvailability reads from settings
- [ ] Logging shows calendar configuration when called
- [ ] Returns empty array when disabled or no calendars configured
- [ ] Calendar provider interface defined
- [ ] Factory function placeholder created
- [ ] Documentation for adding new providers

---

## Key Files to Modify

### Client-Side

| File | Change Type | Description |
|------|-------------|-------------|
| `client-vue/src/configs/availabilitySettings.ts` | MODIFY | Add CalendarConfig type, extend AvailabilitySettings |
| `client-vue/src/views/admin/tabs/BusinessControlsTab.vue` | MODIFY | Add calendar configuration UI section |
| `client-vue/src/utils/timeSlotCalculations.ts` | MODIFY | Update getCalendarAvailability to use settings |
| `client-vue/src/utils/calendar/calendarProvider.ts` | NEW | Calendar provider interface and factory |
| `client-vue/src/utils/calendar/index.ts` | NEW | Exports for calendar utilities |

### Server-Side

No server changes required - uses existing business-settings API.

---

## Testing Strategy

### Unit Tests

1. **CalendarConfig Validation**
   - Test isValidCalendarEmail with valid/invalid emails
   - Test validateCalendarEmails with mixed input

2. **Settings Integration**
   - Test defaultAvailabilitySettings includes calendarConfig
   - Test getAvailabilitySettings returns calendarConfig

### Integration Tests

1. **UI Functionality**
   - Test enable/disable toggle
   - Test provider selection
   - Test email input and validation
   - Test chip removal
   - Test save/load cycle

2. **Settings Persistence**
   - Test calendarConfig saves to API
   - Test calendarConfig loads from API
   - Test missing calendarConfig handled gracefully

### Manual Testing Checklist

- [ ] Open Business Controls tab
- [ ] Calendar Configuration section visible
- [ ] Toggle enable switch - provider dropdown enables/disables
- [ ] Select Google Calendar provider
- [ ] Enter email addresses in textarea
- [ ] Valid emails appear as chips
- [ ] Invalid emails show validation error
- [ ] Remove email by clicking chip X
- [ ] Save settings - success message shows
- [ ] Refresh page - settings persist
- [ ] Toggle disable - settings preserved but disabled

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Settings schema change breaks existing data | Low | Medium | Add calendarConfig as optional field, handle undefined |
| Email validation too strict | Low | Low | Use standard email regex, allow edge cases |
| UI complexity | Low | Low | Follow existing Business Controls patterns |

### Timeline Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Scope creep to OAuth implementation | Medium | Medium | Clear phase boundary - OAuth is Phase 5.1 |
| Settings API changes needed | Low | Medium | Use existing business-settings API |

---

## Success Criteria Summary

**Phase 5.0 Complete When:**
- [ ] CalendarConfig type defined with provider, enabled, calendarEmails
- [ ] AvailabilitySettings extended with calendarConfig field
- [ ] Default settings include empty calendar configuration
- [ ] Business Controls tab has Calendar Configuration section
- [ ] Admin can enable/disable calendar integration
- [ ] Admin can select provider (Google, Outlook, None)
- [ ] Admin can add/remove calendar emails
- [ ] Settings persist to database and load correctly
- [ ] Email validation working
- [ ] getCalendarAvailability reads from settings
- [ ] Calendar provider interface documented
- [ ] Ready for Phase 5.1 (Google Calendar API implementation)

---

## Related Documents

- **Feature Plan:** `project-manager/features/google-apis-integration/feature-plan.md`
- **Availability Settings:** `client-vue/src/configs/availabilitySettings.ts`
- **Business Controls Tab:** `client-vue/src/views/admin/tabs/BusinessControlsTab.vue`
- **Time Slot Calculations:** `client-vue/src/utils/timeSlotCalculations.ts`

---

## Notes

- Phase 5.0 focuses on configuration UI only - no actual calendar API calls
- OAuth authentication will be implemented in Phase 5.1
- Plugin architecture designed but providers implemented in subsequent phases
- Settings structure designed to be backward compatible (optional calendarConfig)

