# Strategic Comment Placement Guide

**Purpose:** Guide for strategically placing STRUCTURED and REFERENCE comments at decision points to maximize learning value while minimizing cognitive load.

**Context:** Learning-focused code commentary system supporting WHAT/HOW/WHY structured comments and pattern references.

---

## Overview

This guide helps you decide:
- **When** to use STRUCTURED vs REFERENCE vs individual comment types
- **Where** to place comments for maximum learning value
- **How** to manage comment density to avoid cognitive overload

---

## Comment Type Selection

### STRUCTURED Comments

Use STRUCTURED comments for **first occurrences** and **decision points**:

- ✅ Function/component definitions with complex logic (>5 lines)
- ✅ Architectural pattern introductions
- ✅ Framework transition points (React → Vue)
- ✅ Complex type definitions
- ✅ State management decisions
- ✅ Significant architectural choices

**Format:**
```typescript
/**
 * STRUCTURED: [Title]
 * 
 * WHAT: [What we're doing - the goal/purpose]
 * 
 * HOW: [How we're doing it - the approach/pattern]
 * 
 * WHY: [Why it works/why we chose this - the rationale]
 * 
 * SEE: [Optional reference to related pattern]
 */
```

### REFERENCE Comments

Use REFERENCE comments for **repeated patterns**:

- ✅ Same pattern used in multiple places
- ✅ Minor variations of established patterns
- ✅ Following an architectural pattern explained elsewhere
- ✅ Framework patterns already documented

**Format:**
```typescript
/**
 * REFERENCE: [Pattern Name]
 * See: [file-path::functionName or file-path:lineNumber]
 * 
 * [Brief note about any differences or variations]
 */
```

### Individual Comment Types

Use individual types (LEARNING, WHY, COMPARISON, PATTERN, RESOURCE) for:

- ✅ Simple explanations that don't need full WHAT/HOW/WHY structure
- ✅ Quick clarifications
- ✅ Resource links
- ✅ Framework comparisons

---

## Decision Point Identification

### 1. Function/Component Definitions

**Criteria:**
- Functions with >5 lines of logic
- Functions with multiple responsibilities
- Functions with complex control flow
- Functions making architectural decisions

**Example - STRUCTURED:**
```typescript
/**
 * STRUCTURED: Vue Query Mutation Pattern
 * 
 * WHAT: Using Vue Query's useMutation for API updates with error handling
 * 
 * HOW: Following the mutation pattern with onSuccess/onError callbacks
 * 
 * WHY: Consistent error handling, loading states, and optimistic updates
 *      across all mutations. Better than manual fetch() calls.
 */
export function useEntityMutation<GE extends GlobalEntityKey>(
  entityKey: GE,
  method: 'POST' | 'PUT' | 'DELETE'
) {
  // Implementation...
}
```

**Example - REFERENCE (if pattern exists elsewhere):**
```typescript
/**
 * REFERENCE: Entity Mutation Pattern
 * See: client-vue/src/composables/useEntity.ts::useEntityMutation
 * 
 * This mutation handles bulk operations with the same pattern.
 */
export function useBulkMutation<GE extends GlobalEntityKey>(entityKey: GE) {
  // Implementation...
}
```

### 2. Architectural Patterns

**Criteria:**
- Composables (use* functions)
- Context providers
- Transformers
- State management patterns

**Example - STRUCTURED:**
```typescript
/**
 * STRUCTURED: Composable Pattern for Entity CRUD
 * 
 * WHAT: Higher-level composable providing convenient CRUD methods
 * 
 * HOW: Wraps low-level mutations with create/update/delete methods
 *      Uses Vue Query for caching and state management
 * 
 * WHY: Reduces boilerplate, provides consistent API, enables caching
 *      Similar to React hooks pattern but more integrated
 */
export function useEntityCrud<GE extends GlobalEntityKey>(entityKey: GE) {
  // Implementation...
}
```

### 3. Framework Transitions

**Criteria:**
- React hooks → Vue equivalents
- State management patterns
- Effect patterns (useEffect → watchEffect)

**Example - STRUCTURED:**
```typescript
/**
 * STRUCTURED: Vue.js Computed Properties
 * 
 * WHAT: Derived state that automatically updates when dependencies change
 * 
 * HOW: Using computed() function with reactive dependencies
 * 
 * WHY: Automatic dependency tracking prevents stale data bugs
 *      No manual dependency arrays like React's useMemo
 * 
 * COMPARISON: React: useMemo(() => value * 2, [value])
 *             Vue: computed(() => value.value * 2)
 */
const doubled = computed(() => value.value * 2);
```

### 4. Complex Logic Sections

**Criteria:**
- Nested conditionals with business logic
- Loops with complex transformations
- Async operations with error handling
- State machines or complex state transitions

**Example - STRUCTURED:**
```typescript
/**
 * STRUCTURED: Error Handling Strategy
 * 
 * WHAT: Centralized error handling for API mutations
 * 
 * HOW: Using Vue Query's onError callback with error transformation
 * 
 * WHY: Consistent error handling across all mutations
 *      Transforms API errors to user-friendly messages
 */
const { mutateAsync } = useMutation({
  mutationFn: apiCall,
  onError: (error) => {
    // Error handling logic...
  }
});
```

### 5. Complex Type Definitions

**Criteria:**
- Generic types with constraints
- Union types with multiple variants
- Mapped types
- Complex type utilities

**Example - STRUCTURED:**
```typescript
/**
 * STRUCTURED: Generic Entity Type System
 * 
 * WHAT: Type-safe entity system with runtime configuration
 * 
 * HOW: Using GlobalEntityKey with ENTITY_CONFIGS for runtime behavior
 * 
 * WHY: Maintains type safety while allowing dynamic entity management
 *      Avoids code duplication across entity types
 */
export type GlobalEntity<GE extends GlobalEntityKey> = EntityBase<GE> & {
  // Type definition...
};
```

---

## Reference Usage Guidelines

### When to Use References

**Use REFERENCE when:**
- ✅ Pattern is already explained elsewhere
- ✅ Usage is straightforward application of pattern
- ✅ Only minor variations exist
- ✅ Pattern is well-established in codebase

**Don't use REFERENCE when:**
- ❌ First occurrence of pattern
- ❌ Significant variations from original
- ❌ Reference would be unclear or ambiguous
- ❌ Pattern is simple enough that reference adds no value

### Reference Format

**Preferred formats:**
- `file-path::functionName` (e.g., `useEntity.ts::useEntityMutation`)
- `file-path:lineNumber` (e.g., `useEntity.ts:42`)
- Relative paths: `../composables/useEntity.ts::useEntityMutation`

**Examples:**
```typescript
// Good - Clear function reference
/**
 * REFERENCE: Entity Mutation Pattern
 * See: client-vue/src/composables/useEntity.ts::useEntityMutation
 */

// Good - Line number reference
/**
 * REFERENCE: Vue Query Setup
 * See: client-vue/src/composables/useQuery.ts:15
 */

// Good - Relative path
/**
 * REFERENCE: API Client Pattern
 * See: ../api/client.ts::createApiClient
 */
```

---

## Cognitive Load Management

### Density Guidelines

**Strategic placement:**
- ~1 STRUCTURED comment per function/component (at definition)
- ~1 REFERENCE comment per repeated pattern usage
- Avoid comments on every line
- Focus on decision points, not obvious code

**Too dense (avoid):**
```typescript
// ❌ Too many comments
/**
 * STRUCTURED: Get user
 */
function getUser() {
  // ❌ Obvious - no comment needed
  return user;
}

/**
 * STRUCTURED: Set user
 */
function setUser(user: User) {
  // ❌ Obvious - no comment needed
  this.user = user;
}
```

**Just right:**
```typescript
// ✅ Strategic placement at decision point
/**
 * STRUCTURED: User Authentication Flow
 * 
 * WHAT: Authenticate user and manage session state
 * 
 * HOW: Using JWT tokens with refresh mechanism
 * 
 * WHY: Secure, stateless authentication with automatic token refresh
 */
async function authenticateUser(credentials: Credentials) {
  // Implementation with clear logic...
}
```

### Placement Strategy

**Place comments:**
- ✅ At function/component definitions
- ✅ Before complex logic blocks
- ✅ At architectural decision points
- ✅ Before framework transitions

**Don't place comments:**
- ❌ On every line
- ❌ On obvious code (getters, setters)
- ❌ Inside simple conditionals
- ❌ On import statements (unless explaining why)

---

## Progression Pattern: STRUCTURED → REFERENCE

### First Occurrence (STRUCTURED)

```typescript
// File: client-vue/src/composables/useEntity.ts

/**
 * STRUCTURED: Entity Mutation Pattern
 * 
 * WHAT: Using Vue Query's useMutation for API updates
 * 
 * HOW: Following the mutation pattern with error handling
 * 
 * WHY: Consistent error handling and loading states
 */
export function useEntityMutation<GE extends GlobalEntityKey>(
  entityKey: GE,
  method: 'POST' | 'PUT' | 'DELETE'
) {
  // Full implementation...
}
```

### Subsequent Occurrences (REFERENCE)

```typescript
// File: client-vue/src/composables/useSchemaProp.ts

/**
 * REFERENCE: Entity Mutation Pattern
 * See: client-vue/src/composables/useEntity.ts::useEntityMutation
 * 
 * This mutation handles schema prop operations with the same pattern.
 */
export function useSchemaPropMutation(method: 'POST' | 'PUT' | 'DELETE') {
  // Implementation following same pattern...
}
```

### Variation with Note (REFERENCE)

```typescript
// File: client-vue/src/composables/useBulk.ts

/**
 * REFERENCE: Entity Mutation Pattern
 * See: client-vue/src/composables/useEntity.ts::useEntityMutation
 * 
 * Variation: Handles bulk operations instead of single entities.
 */
export function useBulkMutation<GE extends GlobalEntityKey>(entityKey: GE) {
  // Implementation with bulk-specific logic...
}
```

---

## Before/After Examples

### Before: No Comments

```typescript
export function useEntityCrud<GE extends GlobalEntityKey>(entityKey: GE) {
  const { mutateAsync: createAsync } = useEntityMutation<GE>(entityKey, 'POST');
  const { mutateAsync: updateAsync } = useEntityMutation<GE>(entityKey, 'PUT');
  const { mutateAsync: deleteAsync } = useEntityMutation<GE>(entityKey, 'DELETE');
  
  const create = async (admin: GlobalEntity<GE>): Promise<GlobalEntity<GE> | undefined> => {
    const result = await createAsync({ admin });
    return result as GlobalEntity<GE> | undefined;
  };
  
  // More methods...
}
```

### After: Strategic STRUCTURED Comment

```typescript
/**
 * STRUCTURED: Higher-Level Entity CRUD Composable
 * 
 * WHAT: Convenient CRUD methods wrapping low-level mutations
 * 
 * HOW: Uses useEntityMutation for each operation type (POST/PUT/DELETE)
 * 
 * WHY: Reduces boilerplate, provides consistent API, enables caching
 *      Similar to React hooks pattern but more integrated
 */
export function useEntityCrud<GE extends GlobalEntityKey>(entityKey: GE) {
  const { mutateAsync: createAsync } = useEntityMutation<GE>(entityKey, 'POST');
  const { mutateAsync: updateAsync } = useEntityMutation<GE>(entityKey, 'PUT');
  const { mutateAsync: deleteAsync } = useEntityMutation<GE>(entityKey, 'DELETE');
  
  const create = async (admin: GlobalEntity<GE>): Promise<GlobalEntity<GE> | undefined> => {
    const result = await createAsync({ admin });
    return result as GlobalEntity<GE> | undefined;
  };
  
  // More methods...
}
```

---

## Best Practices Summary

1. **Use STRUCTURED at decision points** - First occurrences, complex logic, architectural choices
2. **Use REFERENCE for repeated patterns** - Link to original explanation
3. **Keep comments concise** - 3-5 lines per section (WHAT/HOW/WHY)
4. **Place strategically** - At function definitions, not every line
5. **Manage density** - ~1 comment per function/component, focus on decision points
6. **Use clear references** - Format: `file-path::functionName` or `file-path:lineNumber`
7. **Document variations** - Note differences in REFERENCE comments

---

## Related Documentation

- [Code Comments README](./README.md) - Complete command documentation
- [Quick Reference](./QUICK_REFERENCE.md) - Command lookup table
- [Learning Strategies](../../../LEARNING_STRATEGIES.md) - Learning-focused comment patterns

