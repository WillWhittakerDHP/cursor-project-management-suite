# Phase 4 Guide

**Purpose:** Phase-level guide for planning and tracking major milestones

**Tier:** Phase (Tier 2 - High-Level)

---

## Phase Overview

**Phase Number:** 4
**Phase Name:** Vuexy Admin Panel Integration
**Description:** Build unified tabbed admin interface with Profiles tab (BlockProfile with nested PartProfiles grouped by BlockType) and Types tab (BlockType and PartType configuration). Integrate data layer and create CRUD interfaces using Vuexy components.

**Duration:** Estimated multiple sessions
**Status:** Not Started

---

## Phase Objectives

- Build unified admin interface with tabbed navigation (Profiles | Types)
- Create Profiles tab with BlockProfile management grouped by BlockType
- Display nested PartProfiles within each BlockProfile using activeParts relationship
- Create Types tab with BlockType and PartType configuration
- Integrate existing data layer (composables, API clients) into Vuexy components
- Build CRUD interfaces using Vuexy form components and dialogs
- Apply Vuexy styling and layout patterns throughout

---

## Key Deliverables

- Main AdminPanel.vue component with VTabs navigation
- ProfilesTab.vue with BlockProfile grouping and nested PartProfiles
- TypesTab.vue with BlockType and PartType sections
- Form dialogs for all entity types using Vuexy components
- Full CRUD operations working with Vuexy UI
- Single /admin route replacing separate entity routes

---

## Key Activities

- **Main Structure:** Create tabbed interface using Vuexy VTabs
- **Profiles Tab:** Build BlockProfile management with grouping and nesting
- **Types Tab:** Build simple BlockType and PartType configuration
- **Form Dialogs:** Create create/edit dialogs using Vuexy form components
- **Data Integration:** Connect existing composables to Vuexy components
- **Router Update:** Replace separate routes with unified /admin route

---

## Sessions Breakdown

- [ ] ### Session 4.1: Main Admin Panel Structure
**Description:** Create main admin page with tabbed interface structure
**Tasks:** Main page setup and tab navigation
**Learning Goals:**
- Understand Vuexy VTabs component
- Learn Vuexy layout patterns
- Set up main admin page structure

**Task Breakdown:**
- **4.1.1:** Create AdminPanel.vue with VTabs for Profiles and Types tabs
- **4.1.2:** Set up basic tab structure and navigation
- **4.1.3:** Create placeholder tab components (ProfilesTab, TypesTab)
- **4.1.4:** Update router to use single /admin route
- **4.1.5:** Verify tab navigation works correctly

- [ ] ### Session 4.2: Profiles Tab Implementation
**Description:** Build Profiles tab with BlockProfile grouping and nested PartProfiles
**Tasks:** Profiles tab components and data integration
**Learning Goals:**
- Learn Vuexy VExpansionPanels for grouping
- Understand nested component patterns
- Integrate relationship data (activeParts)

**Task Breakdown:**
- **4.2.1:** Create ProfilesTab.vue component structure
- **4.2.2:** Implement BlockProfile grouping by BlockType using VExpansionPanels
- **4.2.3:** Create BlockProfileCard.vue component for individual BlockProfiles
- **4.2.4:** Create PartProfileNestedList.vue to show nested PartProfiles
- **4.2.5:** Integrate useGlobalComp and useRelationshipCrud composables
- **4.2.6:** Add search functionality for BlockProfiles
- **4.2.7:** Test data loading and display

- [ ] ### Session 4.3: Types Tab Implementation
**Description:** Build Types tab with BlockType and PartType configuration
**Tasks:** Types tab components and simple CRUD
**Learning Goals:**
- Learn Vuexy VDataTable or VList components
- Build simple list/table views
- Create basic CRUD interfaces

**Task Breakdown:**
- **4.3.1:** Create TypesTab.vue component structure
- **4.3.2:** Create BlockTypeSection.vue component
- **4.3.3:** Create PartTypeSection.vue component
- **4.3.4:** Implement list/table views for both types
- **4.3.5:** Add create/edit/delete actions
- **4.3.6:** Integrate useGlobalComp composable
- **4.3.7:** Test Types tab functionality

- [ ] ### Session 4.4: Form Dialogs and CRUD Operations
**Description:** Create form dialogs for all entity types and complete CRUD operations
**Tasks:** Form dialogs and CRUD integration
**Learning Goals:**
- Learn Vuexy form components (AppTextField, AppSelect, etc.)
- Build reusable form dialogs
- Integrate mutations and API calls

**Task Breakdown:**
- **4.4.1:** Create BlockProfileDialog.vue with Vuexy form components
- **4.4.2:** Create PartProfileDialog.vue with Vuexy form components
- **4.4.3:** Create BlockTypeDialog.vue with Vuexy form components
- **4.4.4:** Create PartTypeDialog.vue with Vuexy form components
- **4.4.5:** Integrate create/edit mutations for all entities
- **4.4.6:** Add relationship management (activeParts) in dialogs
- **4.4.7:** Test full CRUD operations for all entities
- **4.4.8:** Apply Vuexy styling and polish

---

## Architecture

### Component Structure
```
AdminPanel.vue (main page with VTabs)
├── ProfilesTab.vue
│   ├── VExpansionPanels (BlockType groups)
│   │   └── BlockProfileCard.vue
│   │       └── PartProfileNestedList.vue
│   └── Search functionality
└── TypesTab.vue
    ├── BlockTypeSection.vue
    └── PartTypeSection.vue
```

### Form Dialogs
- BlockProfileDialog.vue
- PartProfileDialog.vue
- BlockTypeDialog.vue
- PartTypeDialog.vue

### Data Flow
- **Profiles Tab:** useGlobalComp() → group by BlockType → show nested PartProfiles via activeParts relationship
- **Types Tab:** useGlobalComp() → display BlockTypes and PartTypes in simple lists
- **CRUD:** Form dialogs → API mutations → Vue Query cache updates → reactive UI updates

---

## Dependencies

**Prerequisites:**
- Phase 1 complete (data layer, transformers)
- Phase 2 complete (state management)
- Phase 3 complete (data flow foundation verified)
- Vuexy already integrated (from plugin setup)

**Downstream Impact:**
- Provides admin interface for managing entities
- Establishes patterns for Phase 5 (Scheduler Wizard)

---

## Success Criteria

- [ ] Single /admin route with tabbed interface functional
- [ ] Profiles tab shows BlockProfiles grouped by BlockType
- [ ] Each BlockProfile displays nested PartProfiles correctly
- [ ] Types tab shows BlockType and PartType configuration
- [ ] Full CRUD operations working for all entities
- [ ] Uses Vuexy components and styling throughout
- [ ] Data loads from existing composables correctly
- [ ] Relationships managed via useRelationshipCrud
- [ ] Ready for Phase 5 (Scheduler Wizard)

---

## Notes

This phase builds a unified admin interface using Vuexy components. The Profiles tab is the main work area with BlockProfiles and their nested PartProfiles. The Types tab provides supporting configuration for BlockTypes and PartTypes. All components use existing composables (useGlobalComp, useRelationshipCrud) and Vuexy's component library.

---

## Related Documents

- Phase Log: `.cursor/project-manager/features/vue-migration/phases/phase-4-log.md`
- Phase Handoff: `.cursor/project-manager/features/vue-migration/phases/phase-4-handoff.md`
- Session Guides: `.cursor/project-manager/features/vue-migration/sessions/session-[X.Y]-guide.md`
