# Session-Start Response Template

/**
 * SEE: *Reference:** Based on successful Session 2.1 response format
 */
---

## Standard Response Format

When responding to a `/session-start` command, follow this concise, focused structure:

**Workflow:** Start commands first run in plan mode: they create the planning doc and return with `context_gathering`. Present the plan and message; when the user is ready they run **/accepted-proceed** to continue. Execute (branch, docs, audit, cascade) runs only when the user runs that command. See START_END_PLAYBOOK_STRUCTURE.md for the full procedure.

```
## Session: [X.Y] - [Description]

### Plan and next steps

- ✅ Safe operations completed (branch setup, validation, context loading)
- 📋 Plan generation next
- ⏸️ Implementation runs after the user approves (e.g. runs /accepted-proceed)

**Next steps:** Review the plan below; when the user approves, run the next command as specified in the playbook (e.g. /accepted-proceed), then continue with implementation.

### Current State

**What's already done:**
- ✅ [Item 1 - specific, concrete]
- ✅ [Item 2 - specific, concrete]

**What's missing (compared to React version):**
- ❌ [Item 1 - specific, concrete]
- ❌ [Item 2 - specific, concrete]

### Phase [X].Y Objectives

1. [Objective 1 - clear, actionable]
2. [Objective 2 - clear, actionable]
3. [Objective 3 - clear, actionable]

### Files to Work With

**Source (React):**
- `frontend-root/src/[path]` - [Brief description]

**Target (Vue):**
- `frontend-root/src/[path]` - [Brief description]

### Pattern Inventory (Required)

Reference these canonical contracts before planning implementation:

- `.cursor/project-manager/patterns/vue-architecture-contract.md`
- `.cursor/project-manager/patterns/composable-taxonomy.md`

**Existing patterns to reuse (search first):**

- Existing components: [list]
- Existing composables/stores/services: [list]
- Similar prior implementations (2+ indicates “generic-first” refactor): [list]

### Placement Decision (Required)

For each major responsibility, declare where it will live:

- UI behavior: Component
- Domain rules/orchestration: Composables/stores/services
- Data fetching/caching: Stores/services (or `use*Query`)

### Implementation Plan

1. [Step 1 - high-level, not detailed]
2. [Step 2 - high-level, not detailed]
3. [Step 3 - high-level, not detailed]

### Key Differences: React vs Vue

- React: [How React does it - brief]
- Vue: [How Vue does it - brief]

### Key Focus

- [Focus area 1 - what to verify/understand]
- [Focus area 2 - what to verify/understand]

Should I proceed with implementing these changes, or do you want to review the plan first? I can provide code snippets for each step if you prefer to implement incrementally.
```

---

## Guidelines

### ✅ DO:

1. **Present the plan first** - Show the plan and deliverables; when the user approves (e.g. runs /accepted-proceed), continue with the next step per playbook.
2. **Keep it concise** - Focus on what's needed to start, not exhaustive details
3. **Show current state** - What's done ✅ vs what's missing ❌ (be specific)
4. **Clear objectives** - Numbered list of what needs to be accomplished
5. **Implementation plan** - High-level steps, not detailed task breakdowns
6. **Key differences** - React vs Vue patterns (brief, focused)
7. **Key focus** - What to verify or understand (brief)
8. **Explicit approval** - Always end with: "Should I proceed with implementing these changes, or do you want to review the plan first?" Direct the user to run /accepted-proceed when ready.

### ❌ DON'T:

- Implement or run execute steps before the user has approved (e.g. run /accepted-proceed)
- Skip presenting the plan and choices
- Redundant sections (e.g., multiple "Session Overview" sections)
- Excessive detail in task breakdowns (save detailed task info for actual task work)
- Long code examples in initial response (provide snippets only if user requests)
- Multiple overview sections
- Vague approval requests (e.g., "Ready to begin?")
- Verbose explanations upfront (keep it focused)

---

## Example: Good Response (Session 2.1 Style)

```
## Session: 2.1 - Vue Query Setup

### Current State

**What's already done:**
- ✅ Vue Query plugin configured (`frontend-root/src/plugins/vue-query.ts`)
- ✅ Basic QueryClient with retry logic and stale time
- ✅ `fetchToPropertyTransformer` exists in Vue
- ✅ `globalTransformer` exists in Vue

**What's missing (compared to React version):**
- ❌ Extended QueryClient with custom `refreshGlobalData` method
- ❌ Prefetching logic that initializes properties and fetches global data before app mounts
- ❌ Loading component for Vue (React uses Ant Design's `Spin`)
- ❌ App-level prefetching coordination (React has `QueryProvider` wrapper)

### Phase 2.1 Objectives

1. Extend QueryClient with refresh methods
2. Create Vue LoadingIndicator component
3. Implement prefetching logic
4. Integrate prefetching into app initialization

### Files to Work With

**Source (React):**
- `frontend-root/src/global/contexts/queryProvider.tsx` - React QueryProvider with prefetching
- `frontend-root/src/global/components/loadingIndicator.tsx` - React loading component

**Target (Vue):**
- `frontend-root/src/plugins/vue-query.ts` - Extend QueryClient
- `frontend-root/src/components/LoadingIndicator.vue` - Create new loading component
- `frontend-root/src/App.vue` - Add prefetching logic

### Implementation Plan

1. Extend QueryClient (`vue-query.ts`) - Add TypeScript interface and `refreshGlobalData()` method
2. Create LoadingIndicator component - Use Vuetify's `v-progress-circular` for full-screen centered layout
3. Add prefetching to App.vue - Use `onBeforeMount`, track state with `ref`, call transformers, set query data
4. Export extended queryClient - Export from `vue-query.ts` for use in composables/stores

### Key Differences: React vs Vue

- React: Uses `useState` + `useEffect` for prefetch tracking
- Vue: Use `ref()` + `onBeforeMount` for prefetch tracking
- React: `QueryClientProvider` wrapper component
- Vue: Plugin-based setup, prefetch in `App.vue` or a composable
- React: JSX conditional rendering (`{!isPrefetched && <LoadingIndicator />}`)
- Vue: `v-if` directive for conditional rendering

### Key Focus

- Why prefetch before mount? Ensures global data is available immediately, avoiding loading states in child components.
- Why extend QueryClient? Provides app-level refresh methods without prop drilling.
- When to use composables vs components? Composables for logic reuse; components for UI.

**Next:** When the user is ready, they run **/accepted-proceed** (or reply with approval). Then present the result and continue with implementation per the playbook.

Should I proceed with implementing these changes, or do you want to review the plan first? I can provide code snippets for each step if you prefer to implement incrementally.
```

---

## Example: Bad Response (What to Avoid)

**❌ Too verbose, redundant sections, excessive detail:**

```
## Session: 2.2 - Pinia Stores

**Date:** 2025-01-XX  
**Status:** In Progress  
**Agent:** Current

---

## Session Overview

**Session ID:** 2.2  
**Session Name:** Pinia Stores  
**Description:** Create Pinia stores for global, admin, scheduler, and SchemaProp state management...

[Multiple redundant sections...]

### Task 2.2.1: Global Store

**Goal:** Create Pinia store for global data...

**Files:**
- Source: `frontend-root/src/global/contexts/globalContext.tsx`
- Target: `frontend-root/src/stores/globalStore.ts`

**Approach:**
- Use Pinia `defineStore` with setup syntax
- Read global data from Vue Query cache...
[Excessive detail that should be saved for actual task work...]

### Key Concepts to Understand

```typescript
import { defineStore } from 'pinia'
// [Long code example that's too much upfront...]
```

**Ready to begin Task 2.2.1?** [Vague approval request]
```

**Problems:**
- Redundant "Session Overview" sections
- Too much detail in task breakdowns (save for actual task work)
- Long code examples upfront
- Vague approval request

---

## Related Documents

- Session Guide Template: `.cursor/commands/tiers/session/templates/session-guide.md`
- Session Start Command: `.cursor/commands/tiers/session/composite/session.ts` (exports `sessionStart`). Invoke `sessionStart(sessionId, description?, options)`. First run creates the planning doc and returns `context_gathering`; execute runs when the user runs **/accepted-proceed**. See START_END_PLAYBOOK_STRUCTURE.md.
- Workflow Rules: `.cursor/rules/USER_CODING_RULES.md` (Rule 19)

