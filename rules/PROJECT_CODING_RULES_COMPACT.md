---
alwaysApply: true
---

# Project Coding Rules - Compact Format for Settings Tab

Technical standards, architectural patterns, and code quality rules.

## CRITICAL PROJECT RULES

During refactors, do not introduce unnecessary fallbacks, filtering, new types, or new properties unless specifically directed. Always look for current property names and types.

Maintain generic patterns with runtime configurations over specific type definitions. Prefer EntityBase<GlobalEntityKey> with runtime ENTITY_CONFIGS over BlockTypeEntity, PartTypeEntity, etc. See: client/src/global/types/globalEntityTypes.ts, server/src/config/entityRegistry.ts

Create clear, typed, and well-documented data transformation functions instead of complex nested transformations or prop-drilling. See: client/src/admin/dataTransformation/bridgeToAdminTransformer.ts

## TYPE SAFETY RULES

Avoid unnecessary type assertions (as any, as unknown, as unknown as). Use keyof and typeof only when necessary for type constraints, not as workarounds. Prefer type guards (value is Type) over type assertions. See: client/src/admin/dataTransformation/typeAdapters.ts for examples.

Include explicit return types in function definitions to avoid type casting: function DoAThing(): ReturnType<Generic> { ... } instead of function DoAThing() { ... return aThing as ReturnType<Generic> }.

Title all generic typing and functions with descriptive names, not single letters: use GlobalEntityKey instead of K, GlobalPropertyKey instead of P. See: client/src/global/types/globalEntityTypes.ts

## CODE QUALITY RULES

Memoize components and computed values when they receive object/array props that change reference frequently, or when they perform expensive computations. Use Vue.js computed() and v-memo strategically. Vue automatically memoizes computed properties - only optimize when profiling shows performance issues.

Use functional approaches (map, reduce, filter) over mutations. Avoid forEach for transformations; use map instead. Use for...of only when you need early returns or side effects, not for transformations. Avoid mutating arrays/objects in loops.

Handle errors safely with explicit logging. Do not create silent fallbacks or filters that hide errors. Log errors explicitly and let them propagate appropriately.

## TESTING RULES

Every test file must begin with a descriptive header comment explaining what it covers, how it works, what it validates, and dependencies. See: client/src/admin/tests/activePartsStateCalculator.test.ts for example format.

Test files are immutable once they pass, lint, and function correctly. Only modify tests when the feature changes, the test has a bug, or refactoring requires updates. Never modify tests to make failing code pass - fix the code instead.

Use fine-grained unit tests for pure functions, utilities, and business logic. Use integration tests for context coordination, component integration, and user workflows. See: client/src/booking/__tests__/utils/feeCalculation.test.ts (unit) and client/src/admin/tests/integration/contextIntegration.test.tsx (integration).

Tests run in watch mode during development using npm run start:dev:testing. Use standard start:dev for development without test watching.

## RESPONSIVE DESIGN & IONIC VUE COMPATIBILITY RULES

Build responsiveness into Vue.js components from the start using mobile-first approach and Vuetify responsive utilities. Use Vuetify's responsive props (cols, sm, md, lg, xl) instead of fixed widths or custom CSS media queries. Each component should handle its own responsiveness at the component level, not as a retrofit. Ensure touch-friendly sizing: minimum 44x44px touch targets, adequate spacing between interactive elements, minimum 16px text size. Use Vuetify's grid system (VContainer, VRow, VCol) with responsive breakpoints. For Ionic Vue compatibility: use standard Vue 3 Composition API patterns, avoid direct browser API access (window, document) - use Vuetify composables like useDisplay() instead, build modular reusable components, design for touch interactions from the start. See: https://vuetifyjs.com/en/features/display-and-platform/, https://vuetifyjs.com/en/components/grids/. Applies to all Vue.js UI components and layouts. Exception: Utility functions and pure business logic don't need responsive design but should still avoid browser-specific APIs.

## DOCUMENTATION & PATTERN REUSE RULES

Check existing documentation, patterns, and reusable components before implementing similar functionality. Before creating new components: check for existing generic/reusable components (see: client/src/admin/components/generic/). Before creating transformers: review existing transformer patterns (see: client/src/admin/dataTransformation/, client-vue/src/api/transformers/). Before implementing similar functionality: search codebase for existing implementations. Before duplicating code patterns: identify if generic solution exists. Check architecture documentation (SCHEDULER_COMPONENT_SPECS.md, VUE_MIGRATION_HANDOFF.md), component documentation (README files), and migration guides. Applies to all new implementations and component creation.

Identify reusable patterns before duplicating code. When similar code structures appear 2+ times, create generic/reusable components or utilities. Build reusable solutions after identifying patterns, not before. Pattern identification process: 1) Recognize repetition (similar code 2+ times), 2) Identify common structure, 3) Create generic solution, 4) Refactor existing code to use generic solution. Create generic component when: similar code appears 2+ times with same structure, pattern is clear and well-understood, multiple use cases share common logic, pattern is stable. Don't create generic component when: only one use case exists (premature abstraction), pattern is unclear or still evolving, use cases are too different to generalize. Examples: Generic field components (FieldRenderer, BaseField), generic transformers (AdminTransformer, GlobalTransformer), generic instance components (GenericInstance, GenericCollection). See: client/src/admin/components/generic/ for examples. Applies to all code duplication scenarios and component creation. Exception: Don't create generic solutions prematurely - wait until pattern is clear from multiple implementations.

## EXCEPTIONS

Test files may use fallbacks and type assertions for test setup. Migration scripts may use more permissive patterns. When fixing legacy code, prefer gradual improvement over strict adherence.

