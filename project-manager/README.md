# Project Manager Documentation Structure

**Purpose:** This README explains the project manager documentation structure and which documents are current.

**Last Updated:** 2025-01-18

---

## Directory Structure

```
.cursor/project-manager/
├── README.md (this file)
├── MASTER_FEATURE_INDEX.md (overview of all features)
├── PROJECT_MANAGER_HANDOFF.md (project-level handoff)
├── docs/ (architecture and reference docs)
├── features/ (feature-level documentation)
│   └── vue-migration/ (Vue migration feature)
│       ├── feature-vue-migration-guide.md (feature strategy)
│       ├── feature-vue-migration-handoff.md (current status) ⭐ CURRENT
│       ├── feature-vue-migration-log.md (historical log)
│       ├── phases/ (phase-level guides)
│       │   ├── phase-1-guide.md
│       │   ├── phase-2-guide.md
│       │   ├── phase-3-guide.md
│       │   ├── phase-4-guide.md ⭐ CURRENT (REVISED)
│       │   ├── phase-5-guide.md ⭐ CURRENT (REVISED)
│       │   └── phase-6-guide.md ⭐ CURRENT (REVISED)
│       └── sessions/ (session logs - historical)
└── project-plan.md.old (archived - for reference only)
```

---

## Source of Truth Documents

### Feature Level (Tier 1)
- **Strategy:** `features/vue-migration/feature-vue-migration-guide.md`
- **Current Status:** `features/vue-migration/feature-vue-migration-handoff.md` ⭐ **CURRENT**
- **Historical Log:** `features/vue-migration/feature-vue-migration-log.md`

### Phase Level (Tier 2)
- **Phase Guides:** `features/vue-migration/phases/phase-[N]-guide.md` ⭐ **CURRENT**
- **Phase Logs:** `features/vue-migration/phases/phase-[N]-log.md` (historical)
- **Phase Handoffs:** `features/vue-migration/phases/phase-[N]-handoff.md` (historical)

### Session Level (Tier 3)
- **Session Logs:** `features/vue-migration/sessions/session-[X.Y]-log.md` (historical)
- **Session Guides:** `features/vue-migration/sessions/session-[X.Y]-guide.md` (historical)
- **Session Handoffs:** `features/vue-migration/sessions/session-[X.Y]-handoff.md` (historical)

---

## Current Status (2025-01-18)

### Single Source of Truth
- **Master Plan:** `PROJECT_PLAN.md` ⭐ **CURRENT - Use this as source of truth**
- All phase guides and todos align with PROJECT_PLAN.md

### Vue Migration Feature
- **Status:** In Progress
- **Completed Phases:** 1, 2, 3 ✅
- **Current Phase:** Phase 4 (Vuexy Admin Panel Integration) - Ready to Start
- **Next Session:** Session 4.1 (Main Admin Panel Structure) - REVISED Phase 4
- **Note:** Phase 4 has been REVISED. Old Session 4.1 (Vuexy Template Selection) was completed separately. New Session 4.1 focuses on building the tabbed admin interface.

### Recent Changes
- **Phase 3-5 Revised:** Phases have been revised to focus on:
  - Phase 3: Data flow foundation (not UI building)
  - Phase 4: Vuexy admin template integration
  - Phase 5: Jose's wizard integration
- **Git Rollback:** Reset to Phase 3 end (commit `27181a4`)
- **Planning Docs:** Consolidated into single PROJECT_PLAN.md
- **Todos:** All todos reference PROJECT_PLAN.md as source

---

## Path References

**Important:** All path references should use `.cursor/project-manager/` (not `.cursor/workflow-manager/`).

Some older documents may reference `workflow-manager` - these are outdated and should be updated to `project-manager` when encountered.

---

## Document Types

### Guides
- **Purpose:** Planning and objectives
- **When to Update:** When phase/feature objectives change
- **Examples:** `phase-4-guide.md`, `feature-vue-migration-guide.md`

### Handoffs
- **Purpose:** Current status and transition context
- **When to Update:** After completing phases/sessions
- **Examples:** `feature-vue-migration-handoff.md`

### Logs
- **Purpose:** Historical record of work completed
- **When to Update:** After completing work
- **Examples:** `feature-vue-migration-log.md`, `session-1-1-log.md`

---

## Which Documents to Use

### For Current Planning
1. **Start with:** `PROJECT_PLAN.md` ⭐ **SINGLE SOURCE OF TRUTH**
2. **Current Status:** `feature-vue-migration-handoff.md` (where we are now)
3. **Phase Details:** `phases/phase-[N]-guide.md` (detailed phase guides)
4. **Overall Strategy:** `feature-vue-migration-guide.md` (feature-level strategy)

### For Historical Reference
- Session logs: `sessions/session-[X.Y]-log.md`
- Phase logs: `phases/phase-[N]-log.md`
- Feature log: `feature-vue-migration-log.md`

### For Architecture Reference
- See: `docs/` directory for architecture documents
- See: `MASTER_FEATURE_INDEX.md` for feature overview

---

## Notes

- **Archived Documents:** `project-plan.md.old` is archived and should not be modified
- **Path Consistency:** Always use `project-manager` (not `workflow-manager`) in new documents
- **Current Focus:** Vue migration Phase 3 (Data Flow Foundation)

---

## Root Planning Documents

The following documents are in the project-manager root:

- **PROJECT_PLAN.md** ⭐ **CURRENT** - Single source of truth for Vue migration planning
- **MASTER_FEATURE_INDEX.md** ⭐ **CURRENT** - Overview of all features
- **future-features-catalog.md** ⭐ **CURRENT** - Future features catalog (as requested)
- **PROJECT_MANAGER_HANDOFF.md** - Technical handoff for project manager system itself
- **README.md** - This document
- **archive/** - Historical/archived documents (project-plan.md.old, project-manager-cleanup.plan.md, SWITCHOVER_SUMMARY.md)

## Questions?

If you're unsure which document to use:
1. **Start with:** `PROJECT_PLAN.md` - Single source of truth
2. Check `feature-vue-migration-handoff.md` for current status
3. Review relevant `phase-[N]-guide.md` for detailed phase objectives
4. Consult `feature-vue-migration-guide.md` for overall strategy

