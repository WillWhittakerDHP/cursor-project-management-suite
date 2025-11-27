# Phase 5 Guide

**Purpose:** Phase-level guide for planning and tracking major milestones

**Tier:** Phase (Tier 2 - High-Level)

---

## Phase Overview

**Phase Number:** 5
**Phase Name:** Scheduler Wizard Integration
**Description:** Use Jose's wizard work/appearance and integrate our data layer. Port or adapt Jose's wizard structure to our Vue app and ensure all scheduler functionality works with our data.

**Duration:** Estimated multiple sessions
**Status:** Not Started

---

## Phase Objectives

- Review Jose's wizard implementation/appearance
- Port or adapt Jose's wizard structure to our Vue app
- Integrate our data layer (scheduler API, state management) into wizard
- Build scheduler wizard steps using Jose's patterns/components
- Ensure all scheduler functionality working with our data
- Apply consistent styling (Vuexy where appropriate, Jose's patterns where needed)

---

## Key Deliverables

- Jose's wizard structure ported/adapted
- Data layer integrated into wizard
- All wizard steps functional (Service Selection, Property Details, Availability, Contact, Confirmation)
- Scheduler logic working with our data
- Complete scheduling flow working
- Consistent UI styling

---

## Key Activities

- **Review Jose's Work:** Examine Jose's wizard code/appearance for patterns to reuse
- **Port Wizard Structure:** Adapt Jose's wizard structure to our Vue app
- **Integrate Scheduler Data:** Connect our scheduler API and state management
- **Build Wizard Steps:** Create all wizard steps using Jose's patterns
- **Test Complete Flow:** Verify end-to-end scheduling flow works

---

## Sessions Breakdown

- [ ] ### Session 5.1: Review & Port Wizard Structure
**Description:** Review Jose's wizard implementation and port structure to our Vue app
**Tasks:** Review and porting tasks
**Learning Goals:**
- Understand Jose's wizard patterns
- Learn wizard structure patterns
- Port structure to our app

**Task Breakdown:**
- **5.1.1:** Review Jose's wizard code/appearance
- **5.1.2:** Identify patterns to reuse
- **5.1.3:** Port wizard structure to our Vue app
- **5.1.4:** Set up wizard routing and navigation

- [ ] ### Session 5.2: Integrate Scheduler Data Layer
**Description:** Integrate our scheduler API and state management into wizard
**Tasks:** Integration tasks
**Learning Goals:**
- Understand scheduler data flow
- Integrate API clients into wizard
- Connect state management to wizard

**Task Breakdown:**
- **5.2.1:** Integrate scheduler API clients
- **5.2.2:** Connect scheduler state management
- **5.2.3:** Verify data flow in wizard context
- **5.2.4:** Test scheduler data integration

- [ ] ### Session 5.3: Build Wizard Steps
**Description:** Create all wizard steps using Jose's patterns and our data
**Tasks:** Step creation tasks
**Learning Goals:**
- Learn wizard step patterns
- Build multi-step form flow
- Apply Jose's styling patterns

**Task Breakdown:**
- **5.3.1:** Service Selection step
- **5.3.2:** Property Details step
- **5.3.3:** Availability step
- **5.3.4:** Contact step
- **5.3.5:** Confirmation step

- [ ] ### Session 5.4: Scheduler Logic Integration
**Description:** Integrate scheduler-specific logic (appointment transformer, time utilities)
**Tasks:** Logic integration tasks
**Learning Goals:**
- Understand scheduler business logic
- Integrate time calculations
- Test complete scheduling flow

**Task Breakdown:**
- **5.4.1:** Integrate appointment transformer
- **5.4.2:** Integrate time data utilities
- **5.4.3:** Integrate profile to final time utils
- **5.4.4:** Test complete scheduling flow

---

## Dependencies

**Prerequisites:**
- Phase 1 complete (data layer, transformers)
- Phase 2 complete (state management)
- Phase 3 complete (data flow foundation verified)
- Phase 4 complete (Vuexy admin integration - for patterns)
- Jose's wizard reference available

**Downstream Impact:**
- Completes core Vue migration
- Enables future React cleanup (if desired)

---

## Success Criteria

- [ ] Jose's wizard structure ported/adapted
- [ ] Data layer integrated into wizard
- [ ] All wizard steps functional
- [ ] Scheduler logic working with our data
- [ ] Complete scheduling flow working
- [ ] Consistent UI styling applied
- [ ] Ready for production use

---

## Notes

This phase focuses on leveraging Jose's wizard work/appearance rather than building from scratch. The goal is to reuse Jose's visual design and UX patterns while integrating our existing scheduler data layer and business logic. Where appropriate, Vuexy components can be used, but Jose's patterns should be preserved for consistency with the original design intent.

**Jose's Wizard Reference:**
- Located at: `/Users/districthomepro/Bonsai/Jose-Scheduler-Reference/src/views/pages/wizard-examples/scheduler/`
- Focus on: Layout patterns, visual design, UX flows
- What NOT to borrow: Hardcoded data, simplified state management (use our data layer instead)

---

## Related Documents

- Phase Log: `.cursor/project-manager/features/vue-migration/phases/phase-5-log.md`
- Phase Handoff: `.cursor/project-manager/features/vue-migration/phases/phase-5-handoff.md`
- Session Guides: `.cursor/project-manager/features/vue-migration/sessions/session-[X.Y]-guide.md`
- Jose's Wizard Reference: `/Users/districthomepro/Bonsai/Jose-Scheduler-Reference/src/views/pages/wizard-examples/scheduler/`

