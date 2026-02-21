---
alwaysApply: true
---

# Project Coding Rules for Cursor Settings

Technical standards, architectural patterns, and code quality rules for the project.

## CRITICAL PROJECT RULES

### Rule 1: No Unnecessary Additions During Refactors
During refactors, do not introduce unnecessary fallbacks, filtering, new types, or new properties unless specifically directed to do so. Always look for the current property names and types.

**Bad Example:**
```typescript
// Adding fallback that wasn't there before
const value = entity.property || {}; // ❌ Don't add fallback
```

**Good Example:**
```typescript
// Use existing property as-is
const value = entity.property; // ✅ Use existing structure
```

**Scope:** Applies to refactoring existing code. New features may require new properties.

**Exception:** Test files may use fallbacks for test data setup.

---

### Rule 2: Generic Patterns with Runtime Configurations
Maintain generic patterns with runtime configurations over specific type definitions. Use const assertions and generic bases that can be specialized at runtime rather than creating individual interfaces for each entity type. Prefer `EntityBase<GlobalEntityKey>` with runtime `ENTITY_CONFIGS` over `BlockTypeEntity`, `PartTypeEntity`, etc.

**Bad Example:**
```typescript
// ❌ Specific interfaces for each entity
interface BlockTypeEntity { id: string; name: string; }
interface PartTypeEntity { id: string; name: string; }
```

**Good Example:**
```typescript
// ✅ Generic base with runtime config (see: frontend-root/src/global/types/globalEntityTypes.ts)
interface BaseGlobalEntity<GE extends GlobalEntityKey> {
  id: GlobalEntityId;
  entityKey: GE;
  name: string;
}

// Runtime config (see: server/src/config/entityRegistry.ts)
export const ENTITY_REGISTRY: Record<EntityType, EntityConfig> = { ... };
```

**Codebase Reference:** `frontend-root/src/global/types/globalEntityTypes.ts`, `server/src/config/entityRegistry.ts`

---

### Rule 3: Clear Transformation Functions Over Prop-Drilling
Create clear, typed, and well-documented data transformation functions instead of complex nested transformations or prop-drilling.

**Bad Example:**
```typescript
// ❌ Prop-drilling through multiple components
<ComponentA data={rawData} />
  <ComponentB data={rawData} />
    <ComponentC data={rawData} /> // Using raw data directly
```

**Good Example:**
```typescript
// ✅ Dedicated transformer class (see: frontend-root/src/admin/dataTransformation/bridgeToAdminTransformer.ts)
export class AdminTransformer {
  transformGlobalToAdmin(globalEntityMap: GlobalEntityMap): AdminEntityMap {
    // Clear, typed transformation logic
  }
}
```

**Codebase Reference:** `frontend-root/src/admin/dataTransformation/bridgeToAdminTransformer.ts`, `frontend-root/src/scheduler/dataTransformation/globalToSchedulerTransformer.ts`

---

## TYPE SAFETY RULES

### Rule 4: Type Safety - Avoid Assertions and Use Explicit Return Types
Avoid unnecessary type assertions including "as any", "as unknown", or "as unknown as". Use explicit function return types to avoid type casting. Use "keyof" and "typeof" only when necessary for type constraints, not as workarounds. Prefer type guards (`value is Type`) over type assertions.

**Bad Example:**
```typescript
// ❌ Unsafe type assertion
const value = (entity as any).property;
const typed = value as unknown as MyType;

// ❌ Type casting at return
function transformData(input: InputType) {
  const result = process(input);
  return result as OutputType; // ❌ Casting return
}
```

**Good Example:**
```typescript
// ✅ Type guard (see: frontend-root/src/admin/dataTransformation/typeAdapters.ts)
export function isAdminEntity<GE extends GlobalEntityKey>(
  entity: any
): entity is AdminEntity<GE> {
  return entity instanceof AdminEntity;
}

// ✅ Explicit return type (see: frontend-root/src/admin/dataTransformation/bridgeToAdminTransformer.ts)
private transformSingleEntity<GE extends GlobalEntityKey>(
  globalEntity: GlobalEntity<GE>,
  entityKey: GE
): AdminEntity<GE> { // ✅ Return type declared
  // ... transformation logic
  return adminEntity; // No casting needed
}

// ✅ Proper use of keyof for type constraints
type GlobalPropertyKey<GE extends GlobalEntityKey> = keyof GlobalEntity<GE>;
```

**Codebase Reference:** 
- Type guards: `frontend-root/src/admin/dataTransformation/typeAdapters.ts`
- Explicit return types: `frontend-root/src/admin/dataTransformation/bridgeToAdminTransformer.ts`
- Type constraints: `server/src/config/entityRegistry.ts` (isValidEntityType)

**Exception:** `keyof` and `typeof` are legitimate TypeScript utilities when used for type constraints (not workarounds).

---

### Rule 5: Descriptive Generic Type Names
Title all generic typing and functions with descriptive names, not single letters or abbreviations. Use `GlobalEntityKey` instead of `K`, and `GlobalPropertyKey` instead of `P`.

**Bad Example:**
```typescript
// ❌ Single letter generics
function process<K, V>(key: K, value: V) { }
type EntityMap<T> = Record<T, Entity>;
```

**Good Example:**
```typescript
// ✅ Descriptive names (see: frontend-root/src/global/types/globalEntityTypes.ts)
export type GlobalEntityKey = 'blockProfile' | 'blockType' | 'partProfile' | 'partType';
export type GlobalPropertyKey<GE extends GlobalEntityKey> = keyof GlobalEntity<GE>;

function processEntity<EntityKey extends GlobalEntityKey>(
  entityKey: EntityKey,
  propertyKey: GlobalPropertyKey<EntityKey>
) { }
```

**Codebase Reference:** `frontend-root/src/global/types/globalEntityTypes.ts`, `frontend-root/src/global/constants/entityConstants.ts`

---

## CODE QUALITY RULES

### Rule 6: Strategic Memoization
Memoize components and computed values when they receive object/array props that change reference frequently, or when they perform expensive computations. Use Vue.js memoization features strategically.

**When to Memoize:**
- Component receives object/array props that are recreated on each render
- Component performs expensive computations that should be cached
- Component is rendered frequently in lists (v-for)
- Computed property depends on expensive calculations

**Vue.js Memoization Patterns:**

**Bad Example:**
```typescript
// ❌ Recomputing on every render
<script setup lang="ts">
const expensiveValue = items.value.map(item => {
  // Expensive computation runs every time component updates
  return heavyCalculation(item);
});
</script>
```

**Good Example:**
```typescript
// ✅ Using computed() for expensive calculations
<script setup lang="ts">
import { computed } from 'vue';

const expensiveValue = computed(() => {
  // Only recomputes when items.value changes
  return items.value.map(item => heavyCalculation(item));
});
</script>
```

**Component Memoization:**
```vue
<!-- ✅ Using v-memo for list items that rarely change -->
<template>
  <div v-for="item in items" :key="item.id" v-memo="[item.id, item.name]">
    <!-- Component only re-renders if id or name changes -->
    <ExpensiveChildComponent :item="item" />
  </div>
</template>
```

**When NOT to Memoize:**
- Simple components with primitive props
- Components that need to update on every render
- Premature optimization without performance issues
- Computed values that are cheap to calculate

**Vue.js Specific Notes:**
- Vue automatically memoizes computed properties - they only recompute when dependencies change
- Use `computed()` instead of recalculating values in templates
- Use `v-memo` directive for expensive list items that rarely change
- Vue's reactivity system handles most memoization automatically - only optimize when profiling shows performance issues

**Codebase Reference:** During migration, see `clineDirectiveMarkdowns/vue-migration-reference/VUE_QUICK_REFERENCE.md` for React → Vue pattern conversions. After migration, check Vue component files for computed() usage patterns.

---

### Rule 7: Functional Approaches Over Mutations
Use functional approaches to mutations, like creating maps or accumulators, to avoid loop mutations. Prefer `map`, `reduce`, and `filter` over `forEach`. Avoid mutating arrays or objects in loops. Use `for...of` loops only when you need early returns or side effects, not for transformations.

**Bad Example:**
```typescript
// ❌ Mutating in forEach
const result = [];
items.forEach(item => {
  result.push(process(item)); // ❌ Mutation
});

// ❌ Mutating in for...of
for (const item of items) {
  item.processed = true; // ❌ Direct mutation
}
```

**Good Example:**
```typescript
// ✅ Functional map (see: frontend-root/src/admin/dataTransformation/bridgeToAdminTransformer.ts)
const result = items.map(item => process(item));

// ✅ Functional reduce for accumulation
const grouped = items.reduce((acc, item) => {
  const key = item.category;
  return { ...acc, [key]: [...(acc[key] || []), item] };
}, {} as Record<string, Item[]>);

// ✅ for...of only for early returns or side effects
for (const item of items) {
  if (item.isValid) {
    return item; // ✅ Early return is acceptable
  }
}
```

**Codebase Reference:** `frontend-root/src/admin/dataTransformation/bridgeToAdminTransformer.ts` (lines 28-38), `clineDirectiveMarkdowns/architectural-todo/implementation_notes.md`

**Exception:** `for...of` is acceptable for early returns, side effects, or when clarity is improved over functional alternatives.

---

### Rule 8: Explicit Error Handling
Handle errors safely with explicit logging. Do not create silent fallbacks or filters that hide errors. Log errors explicitly and let them propagate appropriately.

**Bad Example:**
```typescript
// ❌ Silent fallback hiding errors
try {
  const result = riskyOperation();
  return result || {}; // ❌ Hides the error
} catch (e) {
  return {}; // ❌ Silent failure
}
```

**Good Example:**
```typescript
// ✅ Explicit logging
try {
  const result = riskyOperation();
  return result;
} catch (error) {
  console.error('Failed to perform riskyOperation:', error); // ✅ Explicit logging
  throw error; // ✅ Propagate appropriately
}
```

**Scope:** Applies to error handling. Default values for optional properties are acceptable.

---

## TESTING RULES

### Rule 10: Test File Documentation
Every test file must begin with a descriptive header comment explaining:
- What the test file covers (unit tests for X, integration tests for Y)
- How it works (key patterns, mocks, setup requirements)
- What it validates (main scenarios and edge cases)
- Dependencies (what it mocks or requires)

**Bad Example:**
```typescript
// No header comment
import { calculateFee } from './utils';
describe('calculateFee', () => { ... });
```

**Good Example:**
```typescript
/**
 * FEE CALCULATION TESTS
 * 
 * Unit tests for appointment fee calculation logic.
 * Tests base fees, additional services, and edge cases.
 * 
 * Mocks: None (pure function)
 * Dependencies: feeCalculation utility
 */
import { calculateFee } from './utils';
describe('calculateFee', () => { ... });
```

**Codebase Reference:** See `frontend-root/src/admin/tests/activePartsStateCalculator.test.ts` for example format.

---

### Rule 11: Test File Immutability
Test files are immutable once they pass, lint, and function correctly. Only modify tests when:
- The feature being tested changes (update test to match new behavior)
- The test has a bug (fix the test, not the code to match a broken test)
- Refactoring requires test updates (update tests to match refactored code)

**Never modify tests to make failing code pass - fix the code instead.**

**Exception:** Test files may be modified during initial creation or when fixing test bugs.

---

### Rule 12: Testing Strategy - Hybrid Approach
Use fine-grained unit tests for pure functions, utilities, and business logic. Use integration tests for context coordination, component integration, and user workflows.

**Unit Tests For:**
- Pure utility functions (calculations, validations, transformations)
- Data transformation functions
- Business logic functions
- Type guards and validators

**Integration Tests For:**
- Context coordination (multiple contexts working together)
- Component integration (components with contexts)
- Data flow through multiple layers
- User workflows and end-to-end scenarios

**Codebase Reference:** 
- Unit tests: `frontend-root/src/booking/__tests__/utils/feeCalculation.test.ts`
- Integration tests: `frontend-root/src/admin/tests/integration/contextIntegration.test.tsx`

---

### Rule 13: Test Execution in Development
Tests run in watch mode during development using `npm run start:dev:testing`. Use standard `start:dev` for development without test watching.

**Rationale:** Test watching can slow down development. Make it optional so developers can choose when to run tests.

**Exception:** CI/CD pipelines always run full test suites.

---

## RESPONSIVE DESIGN & IONIC VUE COMPATIBILITY RULES

### Rule 20: Mobile-First Responsive Design
Build responsiveness into components from the start, not as a retrofit. Use Vuetify's responsive utilities, follow mobile-first principles, ensure touch-friendly sizing, and maintain Ionic Vue compatibility through standard Vue 3 patterns.

**Core Principles:**

1. **Mobile-First Approach** - Design for mobile constraints first, then enhance for larger screens
2. **Component-Level Responsiveness** - Each component handles its own responsiveness
3. **Built-In, Not Retrofit** - Responsiveness is part of initial component design, not added later
4. **Ionic Vue Compatibility** - Use standard Vue 3 patterns that convert smoothly to Ionic Vue

**Vuetify Responsive Utilities:**

Vuetify provides built-in responsive props and breakpoints. Use these instead of custom CSS media queries:

**Breakpoints:**
- `xs`: 0-599px (mobile)
- `sm`: 600-959px (tablet)
- `md`: 960-1263px (small desktop)
- `lg`: 1264-1903px (desktop)
- `xl`: 1904px+ (large desktop)

**Bad Example:**
```vue
<template>
  <!-- ❌ Fixed widths, no responsiveness -->
  <div class="container" style="width: 1200px;">
    <div class="sidebar" style="width: 300px;">Sidebar</div>
    <div class="content">Content</div>
  </div>
</template>

<style scoped>
/* ❌ Custom media queries instead of Vuetify utilities */
@media (max-width: 768px) {
  .container { width: 100%; }
}
</style>
```

**Good Example:**
```vue
<template>
  <!-- ✅ Using Vuetify's responsive grid system -->
  <VContainer>
    <VRow>
      <!-- ✅ Responsive columns: full width on mobile, 3 cols on tablet+, 2 cols on desktop+ -->
      <VCol cols="12" sm="4" md="3" lg="2">
        <VCard>Sidebar</VCard>
      </VCol>
      <VCol cols="12" sm="8" md="9" lg="10">
        <VCard>Content</VCard>
      </VCol>
    </VRow>
  </VContainer>
</template>
```

**Component-Level Responsive Patterns:**

**Bad Example:**
```vue
<template>
  <!-- ❌ Component assumes desktop layout -->
  <div class="desktop-layout">
    <div class="left-panel">...</div>
    <div class="right-panel">...</div>
  </div>
</template>
```

**Good Example:**
```vue
<template>
  <!-- ✅ Component adapts to screen size -->
  <VRow>
    <VCol cols="12" md="6">
      <LeftPanel />
    </VCol>
    <VCol cols="12" md="6">
      <RightPanel />
    </VCol>
  </VRow>
</template>
```

**Touch-Friendly Sizing:**

Mobile interfaces require larger touch targets. Follow these guidelines:

- **Minimum touch target:** 44x44px (48x48px preferred)
- **Button spacing:** Adequate padding between interactive elements
- **Text size:** Minimum 16px to prevent auto-zoom on iOS
- **Card padding:** Sufficient padding for easy tapping

**Bad Example:**
```vue
<template>
  <!-- ❌ Too small for touch, no spacing -->
  <VBtn size="x-small" style="margin: 2px;">Click</VBtn>
  <VBtn size="x-small" style="margin: 2px;">Click</VBtn>
</template>
```

**Good Example:**
```vue
<template>
  <!-- ✅ Adequate size and spacing for touch -->
  <VBtn size="default" class="ma-2">Click</VBtn>
  <VBtn size="default" class="ma-2">Click</VBtn>
</template>
```

**Ionic Vue Compatibility:**

To ensure smooth conversion to Ionic Vue, follow these patterns:

1. **Use Standard Vue 3 Patterns** - Avoid web-specific APIs
2. **Component Composition** - Build modular, reusable components
3. **Avoid Browser-Specific APIs** - Don't directly access `window` or `document` without guards
4. **Responsive Layouts** - Use Vuetify's responsive system (works in Ionic)
5. **Touch Interactions** - Design for touch from the start

**Bad Example:**
```vue
<script setup lang="ts">
// ❌ Direct browser API access (won't work in Ionic)
const width = window.innerWidth;
document.getElementById('element')?.scrollIntoView();
</script>
```

**Good Example:**
```vue
<script setup lang="ts">
import { useDisplay } from 'vuetify';
import { onMounted, ref } from 'vue';

// ✅ Using Vuetify's display composable (works in Ionic)
const { mobile, width } = useDisplay();
const elementRef = ref<HTMLElement>();

onMounted(() => {
  // ✅ Using Vue refs instead of direct DOM access
  elementRef.value?.scrollIntoView();
});
</script>
```

**Responsive Component Checklist:**

When creating a new component, ensure:

- [ ] Uses Vuetify responsive props (`cols`, `sm`, `md`, `lg`, `xl`) instead of fixed widths
- [ ] Touch targets meet minimum 44x44px size
- [ ] Text is readable on mobile (minimum 16px)
- [ ] Layout adapts gracefully from mobile to desktop
- [ ] No direct browser API access (`window`, `document`)
- [ ] Uses Vue 3 Composition API patterns
- [ ] Component is modular and reusable

**Codebase Reference:**
- Vuetify Responsive: https://vuetifyjs.com/en/features/display-and-platform/
- Vuetify Grid System: https://vuetifyjs.com/en/components/grids/
- Ionic Vue Compatibility: Standard Vue 3 components convert smoothly

**Scope:** Applies to all Vue.js components, especially UI components and layouts. Business logic and utilities may not need responsive design but should still avoid browser-specific APIs.

**Exception:** Utility functions and pure business logic don't need responsive design, but should still avoid browser-specific APIs for Ionic Vue compatibility.

---

## DOCUMENTATION & PATTERN REUSE RULES

### Rule 21: Documentation Checks at Critical Junctures
Check existing documentation, patterns, and reusable components before implementing similar functionality. This prevents duplication and ensures consistency with established patterns.

**Critical Junctures for Documentation Checks:**

1. **Before Creating New Components** - Check for existing generic/reusable components
2. **Before Creating Transformers** - Review existing transformer patterns and structure
3. **Before Implementing Similar Functionality** - Search for existing implementations
4. **Before Duplicating Code Patterns** - Identify if a generic solution exists
5. **When Migrating Between Frameworks** - Review migration guides and patterns

**Documentation Sources to Check:**

- **Architecture Documentation** - `SCHEDULER_COMPONENT_SPECS.md`, `SCHEDULER_ARCHITECTURE_DECISIONS.md`, `VUE_MIGRATION_HANDOFF.md`
- **Component Documentation** - README files in component directories
- **Pattern Documentation** - Learning guides, migration references
- **Codebase Search** - Search for similar patterns, generic components, reusable utilities

**Bad Example:**
```typescript
// ❌ Creating a new transformer without checking existing patterns
export class MyNewTransformer {
  transformData(input: any): any {
    // Custom transformation logic
    // Didn't check AdminTransformer or GlobalTransformer patterns
  }
}
```

**Good Example:**
```typescript
// ✅ Checking existing transformer patterns first
// Reviewed: frontend-root/src/admin/dataTransformation/bridgeToAdminTransformer.ts
// Reviewed: frontend-root/src/api/transformers/adminTransformer.ts
// Following established pattern: transformXToY method, generic entity handling

export class MyNewTransformer {
  // Following established transformer pattern
  transformSourceToTarget(sourceMap: SourceMap): TargetMap {
    // Uses same pattern as AdminTransformer.transformGlobalToAdmin
  }
}
```

**Component Reuse Check:**

**Bad Example:**
```vue
<!-- ❌ Creating a new field component without checking generic components -->
<template>
  <div class="custom-field">
    <input v-model="value" />
  </div>
</template>

<!-- Didn't check: FieldRenderer, BaseField, PrimitiveFieldFactory -->
```

**Good Example:**
```vue
<!-- ✅ Using existing generic field component -->
<template>
  <FieldRenderer 
    :field-key="fieldKey" 
    :is-field-expanded="true" 
  />
</template>

<!-- Checked: frontend-root/src/admin/components/generic/fields/fieldRenderer.tsx -->
<!-- Reusing: Generic field rendering pattern -->
```

**Documentation Check Checklist:**

Before implementing new functionality, verify:

- [ ] Checked architecture documentation for similar patterns
- [ ] Searched codebase for existing generic/reusable components
- [ ] Reviewed transformer patterns if creating data transformations
- [ ] Checked component documentation (README files)
- [ ] Reviewed migration guides if porting between frameworks
- [ ] Identified if existing pattern can be reused or extended

**Codebase References:**
- Generic Components: `frontend-root/src/admin/components/generic/`
- Transformer Patterns: `frontend-root/src/admin/dataTransformation/`, `frontend-root/src/api/transformers/`
- Architecture Docs: `frontend-root/src/scheduler/clineSchedulerWizardDirectives/README.md`
- Migration Guides: `VUE_MIGRATION_HANDOFF.md`, `clineDirectiveMarkdowns/vue-migration-reference/`

**Scope:** Applies to all new implementations, component creation, and code duplication scenarios.

---

### Rule 22: Pattern Reuse and Generic Component Creation
Identify reusable patterns before duplicating code. When similar code structures appear multiple times, create generic/reusable components or utilities. Build reusable solutions after identifying patterns, not before.

**Pattern Identification Process:**

1. **Recognize Repetition** - Notice when similar code appears 2+ times
2. **Identify Common Structure** - Extract the common pattern
3. **Create Generic Solution** - Build reusable component/utility
4. **Refactor Existing Code** - Replace duplicates with generic solution

**Example: Transformer Pattern Evolution**

**Stage 1: Individual Transformers (Before Pattern Recognition)**
```typescript
// ❌ Individual transformers with similar patterns
export class BlockTypeTransformer {
  transformToAdmin(blockType: any): AdminBlockType { /* ... */ }
}

export class PartTypeTransformer {
  transformToAdmin(partType: any): AdminPartType { /* ... */ }
}

// Notice: Both follow same pattern - transform single entity type
```

**Stage 2: Pattern Recognition**
```typescript
// ✅ Recognizing the pattern: All transformers follow same structure
// Pattern: transformXToY method, entity type handling, display config building
```

**Stage 3: Generic Solution**
```typescript
// ✅ Creating generic transformer (see: AdminTransformer)
export class AdminTransformer {
  // Generic method that works for all entity types
  transformGlobalToAdmin(globalEntityMap: GlobalEntityMap): AdminEntityMap {
    // Handles all entity types using same pattern
  }
  
  private transformSingleEntity<GE extends GlobalEntityKey>(
    globalEntity: GlobalEntity<GE>,
    entityKey: GE
  ): AdminEntity<GE> {
    // Generic transformation logic
  }
}
```

**Component Reuse Pattern:**

**Bad Example:**
```vue
<!-- ❌ Duplicating field rendering logic -->
<template>
  <!-- Component 1 -->
  <div class="field">
    <label>{{ fieldConfig.label }}</label>
    <input v-model="value" />
  </div>
</template>

<!-- Component 2 - Same pattern duplicated -->
<template>
  <div class="field">
    <label>{{ fieldConfig.label }}</label>
    <input v-model="value" />
  </div>
</template>
```

**Good Example:**
```vue
<!-- ✅ Creating reusable FieldRenderer component -->
<!-- See: frontend-root/src/admin/components/generic/fields/fieldRenderer.tsx -->

<template>
  <!-- Generic field renderer used everywhere -->
  <FieldRenderer 
    :field-key="fieldKey" 
    :is-field-expanded="isExpanded" 
  />
</template>

<!-- All field rendering now uses same component -->
```

**When to Create Generic Components:**

**Create Generic Component When:**
- ✅ Similar code appears 2+ times with same structure
- ✅ Pattern is clear and well-understood
- ✅ Multiple use cases share common logic
- ✅ Pattern is stable (won't change frequently)

**Don't Create Generic Component When:**
- ❌ Only one use case exists (premature abstraction)
- ❌ Pattern is unclear or still evolving
- ❌ Use cases are too different to generalize
- ❌ Abstraction would make code harder to understand

**Generic Component Checklist:**

When creating a generic/reusable component:

- [ ] Identified clear pattern from 2+ similar implementations
- [ ] Extracted common structure and behavior
- [ ] Made component flexible enough for all use cases
- [ ] Maintained type safety with generics
- [ ] Documented component purpose and usage
- [ ] Refactored existing code to use new component
- [ ] Verified all use cases still work correctly

**Examples from Codebase:**

1. **Generic Field Components** - `FieldRenderer`, `BaseField`, `PrimitiveFieldFactory`
   - Pattern: All fields need label, input, validation, error display
   - Solution: Generic field components with configuration

2. **Generic Transformers** - `AdminTransformer`, `GlobalTransformer`, `SchedulerTransformer`
   - Pattern: All transformers follow `transformXToY` pattern
   - Solution: Generic transformer classes with entity type generics

3. **Generic Instance Components** - `GenericInstance`, `GenericCollection`
   - Pattern: All entity instances need similar rendering and operations
   - Solution: Generic components with configuration-driven behavior

**Codebase References:**
- Generic Fields: `frontend-root/src/admin/components/generic/fields/`
- Generic Instances: `frontend-root/src/admin/components/generic/instances/`
- Transformers: `frontend-root/src/admin/dataTransformation/`, `frontend-root/src/api/transformers/`

**Scope:** Applies to all code duplication scenarios and component creation.

**Exception:** Don't create generic solutions prematurely - wait until pattern is clear from multiple implementations.

---

## SECURITY RULES

### Rule 23: SQL Injection Prevention
ALWAYS use Sequelize parameterized queries or prepared statements. NEVER concatenate user input into SQL strings.

**Required Pattern:**
```typescript
// ✅ CORRECT: Use Sequelize methods
const user = await User.findOne({ where: { id: userId } });
const users = await User.findAll({ where: { name: userName } });

// ✅ CORRECT: Parameterized raw queries if necessary
await sequelize.query('SELECT * FROM users WHERE id = :userId', {
  replacements: { userId },
  type: QueryTypes.SELECT
});

// ❌ FORBIDDEN: String concatenation
const query = `SELECT * FROM users WHERE id = ${userId}`; // NEVER DO THIS
```

**Scope:** All database queries in server code.

---

### Rule 24: XSS Prevention
React automatically escapes content. Vue requires explicit escaping for user content.

**React Pattern:**
```typescript
// ✅ CORRECT: React's default behavior escapes automatically
<div>{userInput}</div>

// ❌ FORBIDDEN: dangerouslySetInnerHTML with user input
<div dangerouslySetInnerHTML={{ __html: userInput }} /> // NEVER DO THIS
```

**Vue Pattern:**
```typescript
// ✅ CORRECT: Use v-text for user content
<div v-text="userInput"></div>

// ✅ CORRECT: Escaped interpolation (default)
<div>{{ userInput }}</div>

// ❌ FORBIDDEN: v-html with untrusted data
<div v-html="userInput"></div> // NEVER DO THIS without sanitization
```

**Scope:** All user-provided content rendering in React and Vue components.

---

### Rule 25: Input Validation
Validate ALL inputs on the server side using runtime validation schemas.

**Required Pattern:**
```typescript
// ✅ CORRECT: Server-side validation with Joi
const schema = Joi.object({
  userId: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(100).required()
});

const { error, value } = schema.validate(req.body);
if (error) {
  return res.status(400).json({ error: error.message });
}
```

**Scope:** All API endpoints receiving user input.

---

### Rule 26: Secure Configuration
Never hardcode secrets, credentials, or sensitive configuration in code.

**Required Pattern:**
```typescript
// ✅ CORRECT: Use environment variables
const dbPassword = process.env.DB_PASSWORD;

// ❌ FORBIDDEN: Hardcoded secrets
const dbPassword = "mySecretPassword"; // NEVER DO THIS
```

**Scope:** All configuration and credential management.

---

## SCOPE AND EXCEPTIONS

### Scope Clarifications
- **Refactoring:** Rules 1-3 apply strictly during refactors
- **New Features:** Rules 1-3 may be relaxed for new features, but still prefer generic patterns
- **Type Safety:** Rules 4-5 apply to all code
- **Code Quality:** Rules 6-8 apply to all code, but use judgment
- **Testing:** Rules 10-13 apply to all test files
- **Responsive Design:** Rule 20 applies to all Vue.js UI components and layouts
- **Documentation & Patterns:** Rules 21-22 apply to all new implementations and component creation
- **Security:** Rules 23-26 apply to all code handling user input, database queries, and configuration

### Exceptions
- **Test Files:** May use fallbacks, type assertions, and mutations for test setup
- **Migration Scripts:** May use more permissive patterns for one-time migrations
- **Legacy Code:** When fixing legacy code, prefer gradual improvement over strict adherence
- **Performance Critical:** When performance is proven to be an issue, optimizations may override some rules

---

## QUICK REFERENCE

**Must Follow (Critical):**
- No unnecessary additions during refactors
- Generic patterns with runtime configs
- Clear transformation functions

**Strong Preference (Type Safety):**
- Avoid unnecessary type assertions and use explicit return types
- Descriptive generic names

**Best Practices (Code Quality):**
- Strategic memoization
- Functional over mutations
- Explicit error handling

**Testing:**
- Documented test files
- Immutable working tests
- Hybrid unit/integration approach
- Optional dev mode testing

**Responsive Design:**
- Mobile-first approach
- Component-level responsiveness
- Vuetify responsive utilities
- Touch-friendly sizing
- Ionic Vue compatibility

**Documentation & Patterns:**
- Documentation checks at critical junctures (use `/check-before-implement` or `/plan-phase`)
- Pattern reuse before duplication
- Generic component creation when patterns emerge

**Security:**
- SQL injection prevention (parameterized queries only)
- XSS prevention (React default escaping, Vue v-text)
- Input validation (server-side with Joi/Zod)
- Secure configuration (environment variables, no hardcoded secrets)

