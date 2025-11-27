# DHP Differential Scheduler - Project Plan

**Purpose:** Single source of truth for Vue migration project planning

**Last Updated:** 2025-01-19
**Status:** Active Planning Document

---

## Overview

This document serves as the master project plan for the Vue.js migration. All phase guides, todos, and planning documents should align with this plan.

**Structure:** Feature → Phase → Session → Task

---

## Feature 0: Vue.js Migration

**Status:** In Progress
**Description:** Migrate entire application from React to Vue.js with full feature parity, improved type safety, and modern Vue 3 patterns

### Phase 1: Data Layer Foundation ✅ COMPLETE

**Status:** Complete
**Description:** Port type definitions, constants, API clients, and transformers

**Sessions:**
- Session 1.1: Type Definitions
- Session 1.2: Constants and Configuration
- Session 1.3: API Clients
- Session 1.4: Transformers

**Success Criteria:**
- ✅ All types compile without errors
- ✅ API clients working with Vue Query
- ✅ Transformers ported and tested

### Phase 2: State Management ✅ COMPLETE

**Status:** Complete
**Description:** Implement Pinia stores, Vue Query integration, composables layer

**Sessions:**
- Session 2.1: Vue Query Setup
- Session 2.2: Pinia Stores
- Session 2.3: Composables Layer

**Success Criteria:**
- ✅ Pinia stores implemented
- ✅ Composables layer established
- ✅ Clear naming pattern (useXComp vs useXStore)

### Phase 3: Data Flow Foundation ✅ COMPLETE

**Status:** Complete
**Description:** Establish complete data flow in Vue app ready for Vuexy overlay. Focus on verifying API integration, state management, routing, and placeholder pages (no UI polish).

**Sessions:**
- Session 3.1: API Integration Verification
- Session 3.2: State Management Verification
- Session 3.3: Routing & Placeholder Pages
- Session 3.4: Data Flow Testing & Validation

**Phase Objectives:**
- Verify all API endpoints working (CRUD operations for all entities)
- Ensure state management complete (Pinia stores, Vue Query)
- Create minimal routing structure
- Build placeholder pages that demonstrate data flow (no UI polish)
- Verify data transformations working correctly
- Ensure all composables functional

**Key Deliverables:**
- All API calls working and tested
- State management layer complete and verified
- Basic routing structure in place
- Placeholder pages showing data flow (list views, basic forms)
- Data transformations verified and working
- Ready for Vuexy overlay in Phase 4

**Session Breakdown:**

**Session 3.1: API Integration Verification**
- Task 3.1.1: Verify BlockType CRUD operations
- Task 3.1.2: Verify BlockProfile CRUD operations
- Task 3.1.3: Verify PartType CRUD operations
- Task 3.1.4: Verify PartProfile CRUD operations
- Task 3.1.5: Verify relationship CRUD operations (validBlocks, validParts, activeBlocks, activeParts)
- Task 3.1.6: Verify error handling and edge cases

**Session 3.2: State Management Verification**
- Task 3.2.1: Verify Pinia stores functional
- Task 3.2.2: Verify Vue Query caching
- Task 3.2.3: Verify composables working correctly
- Task 3.2.4: Test reactive state updates

**Session 3.3: Routing & Placeholder Pages**
- Task 3.3.1: Set up basic routing structure
- Task 3.3.2: Create placeholder list pages (no UI polish)
- Task 3.3.3: Create placeholder form pages (no UI polish)
- Task 3.3.4: Verify data displays correctly on pages

**Session 3.4: Data Flow Testing & Validation**
- Task 3.4.1: Test complete data flow (API → State → Components)
- Task 3.4.2: Verify data transformations working
- Task 3.4.3: Test all composables functional
- Task 3.4.4: Validate ready for Phase 4 (Vuexy integration)

**Success Criteria:**
- All API endpoints verified and working
- State management layer complete and tested
- Routing structure in place
- Placeholder pages demonstrate data flow
- Data transformations verified
- All composables functional
- Ready for Vuexy overlay in Phase 4

**Dependencies:**
- Phase 1 complete (data layer)
- Phase 2 complete (state management)

**Note:** Property keys are now derived from `GlobalEntity` type (API-driven), not hard-coded. The `GlobalPropertyKey<GE>` type is defined as `keyof GlobalEntity<GE>`, making property keys automatically available from the API response types.

### Phase 4: Vuexy Admin Panel Integration

**Status:** Not Started
**Description:** Build unified tabbed admin interface with Profiles tab (BlockProfile with nested PartProfiles grouped by BlockType) and Types tab (BlockType and PartType configuration). Integrate data layer and create CRUD interfaces using Vuexy components.

**⚠️ NOTE: Phase 4 has been REVISED. Old Session 4.1 (Vuexy Template Setup) was completed separately. New Session 4.1 focuses on building the admin UI.**

**Sessions:**
- Session 4.1: Main Admin Panel Structure (REVISED - create AdminPanel.vue with tabs, NOT legacy removal)
- Session 4.2: Profiles Tab Implementation
- Session 4.3: Types Tab Implementation
- Session 4.4: Form Dialogs and CRUD Operations

**Phase Objectives:**
- Build unified admin interface with tabbed navigation (Profiles | Types)
- Create Profiles tab with BlockProfile management grouped by BlockType
- Display nested PartProfiles within each BlockProfile using activeParts relationship
- Create Types tab with BlockType and PartType configuration
- Integrate existing data layer (composables, API clients) into Vuexy components
- Build CRUD interfaces using Vuexy form components and dialogs
- Apply Vuexy styling and layout patterns throughout

**Key Deliverables:**
- Main AdminPanel.vue component with VTabs navigation
- ProfilesTab.vue with BlockProfile grouping and nested PartProfiles
- TypesTab.vue with BlockType and PartType sections
- Form dialogs for all entity types using Vuexy components
- Full CRUD operations working with Vuexy UI
- Single /admin route replacing separate entity routes

**Success Criteria:**
- Single /admin route with tabbed interface functional
- Profiles tab shows BlockProfiles grouped by BlockType
- Each BlockProfile displays nested PartProfiles correctly
- Types tab shows BlockType and PartType configuration
- Full CRUD operations working for all entities
- Uses Vuexy components and styling throughout
- Data loads from existing composables correctly
- Relationships managed via useRelationshipCrud
- Ready for Phase 5 (Scheduler Wizard)

**Dependencies:**
- Phase 3 complete (verified data flow)
- Vuexy already integrated (from plugin setup)

### Phase 5: Scheduler Wizard Integration (REVISED)

**Status:** Not Started
**Description:** Use Jose's wizard work/appearance and integrate our data layer. Port wizard structure and ensure all scheduler functionality works with our data.

**Sessions:**
- Session 5.1: Review & Port Wizard Structure
- Session 5.2: Integrate Scheduler Data Layer
- Session 5.3: Build Wizard Steps
- Session 5.4: Scheduler Logic Integration

**Phase Objectives:**
- Review Jose's wizard implementation/appearance
- Port or adapt Jose's wizard structure to our Vue app
- Integrate our data layer (scheduler API, state management) into wizard
- Build scheduler wizard steps using Jose's patterns/components
- Ensure all scheduler functionality working with our data
- Apply consistent styling (Vuexy where appropriate, Jose's patterns where needed)

**Key Deliverables:**
- Jose's wizard structure ported/adapted
- Data layer integrated into wizard
- All wizard steps functional (Service Selection, Property Details, Availability, Contact, Confirmation)
- Scheduler logic working with our data
- Complete scheduling flow working
- Consistent UI styling

**Success Criteria:**
- Jose's wizard structure ported/adapted
- Data layer integrated into wizard
- All wizard steps functional
- Scheduler logic working with our data
- Complete scheduling flow working
- Consistent UI styling applied
- Ready for production use

**Dependencies:**
- Phase 4 complete (Vuexy admin integration)

**Jose's Wizard Reference:**
- Located at: `/Users/districthomepro/Bonsai/Jose-Scheduler-Reference/src/views/pages/wizard-examples/scheduler/`
- Focus on: Layout patterns, visual design, UX flows
- What NOT to borrow: Hardcoded data, simplified state management (use our data layer instead)

---

## Future Features Catalog

See `.cursor/project-manager/future-features-catalog.md` for comprehensive catalog of future features identified in USER_STORY.md and common commercial scheduler features for evaluation and prioritization.

---

## Related Documents

- **Feature Guide:** `.cursor/project-manager/features/vue-migration/feature-vue-migration-guide.md`
- **Feature Handoff:** `.cursor/project-manager/features/vue-migration/feature-vue-migration-handoff.md`
- **Phase Guides:** `.cursor/project-manager/features/vue-migration/phases/phase-[N]-guide.md`
- **Session Guides:** `.cursor/project-manager/features/vue-migration/sessions/session-[X.Y]-guide.md`
- **Future Features:** `.cursor/project-manager/future-features-catalog.md`

---

## Notes

- This is the single source of truth for Vue migration planning
- All phase guides and todos should align with this document
- Phase 3-5 have been revised to focus on data flow foundation and template integration
- Previous Phase 4 UI work has been rolled back

